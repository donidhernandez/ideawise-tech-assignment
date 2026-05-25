<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\Upload;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class InitUploadControllerTest extends WebTestCase
{
    private KernelBrowser $client;
    private EntityManagerInterface $em;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
        $this->em->createQuery('DELETE FROM '.Upload::class)->execute();
    }

    public function testInitRequiresUserIdHeader(): void
    {
        $this->client->request('POST', '/api/uploads/init', [], [], [
            'CONTENT_TYPE' => 'application/json',
        ], json_encode([
            'filename' => 'test.jpg',
            'size' => 1024,
            'mimeType' => 'image/jpeg',
            'totalChunks' => 1,
        ]));

        self::assertResponseStatusCodeSame(401);
    }

    public function testInitCreatesUploadAndReturnsId(): void
    {
        $this->client->request('POST', '/api/uploads/init', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode([
            'filename' => 'photo.jpg',
            'size' => 1048576,
            'mimeType' => 'image/jpeg',
            'totalChunks' => 1,
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertArrayHasKey('uploadId', $body);
        self::assertSame([], $body['existingChunks']);
    }

    public function testInitRejectsInvalidMimeType(): void
    {
        $this->client->request('POST', '/api/uploads/init', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode([
            'filename' => 'malware.exe',
            'size' => 1024,
            'mimeType' => 'application/x-msdownload',
            'totalChunks' => 1,
        ]));

        self::assertResponseStatusCodeSame(415);
    }

    public function testInitRejectsChunkCountMismatch(): void
    {
        $this->client->request('POST', '/api/uploads/init', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode([
            'filename' => 'photo.jpg',
            'size' => 5_000_000, // ~5MB, expects 5 chunks @ 1MB
            'mimeType' => 'image/jpeg',
            'totalChunks' => 1,
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame('chunk_count_mismatch', $body['error']);
    }

    public function testInitWithKnownMd5ReturnsDeduplicated(): void
    {
        $existing = new Upload('existing.jpg', 'image/jpeg', '1024', 1, 'user-1');
        $existing->setStatus(Upload::STATUS_COMPLETE);
        $existing->setMd5Hash(str_repeat('a', 32));
        $existing->setStoragePath('2026/01/01/'.str_repeat('a', 32).'_existing.jpg');
        $existing->setFinalizedAt(new \DateTimeImmutable());
        $this->em->persist($existing);
        $this->em->flush();

        $this->client->request('POST', '/api/uploads/init', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode([
            'filename' => 'duplicate.jpg',
            'size' => 1024,
            'mimeType' => 'image/jpeg',
            'totalChunks' => 1,
            'md5' => str_repeat('a', 32),
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($this->client->getResponse()->getContent(), true);
        self::assertTrue($body['deduplicated']);
        self::assertSame($existing->getId()->toRfc4122(), $body['fileId']);
    }
}
