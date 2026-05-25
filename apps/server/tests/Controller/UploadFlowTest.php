<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\Upload;
use App\Service\ChunkStorage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * End-to-end test of the full upload flow: init → chunk(s) → finalize → status.
 */
class UploadFlowTest extends WebTestCase
{
    private KernelBrowser $client;
    private EntityManagerInterface $em;

    /**
     * Builds a buffer that:
     *   - starts with a valid JPEG header (so magic-number check passes)
     *   - has the requested total length, padded with random bytes
     */
    private function buildJpegPayload(int $size): string
    {
        $header = "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00";
        $padding = str_repeat("\x00", max(0, $size - strlen($header) - 2));
        $footer = "\xFF\xD9";

        return substr($header.$padding.$footer, 0, $size);
    }

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
        $this->em->createQuery('DELETE FROM '.Upload::class)->execute();
    }

    public function testFullUploadFlow(): void
    {
        $chunkSize = 1048576;
        $fileSize = $chunkSize + 500; // 2 chunks
        $payload = $this->buildJpegPayload($fileSize);
        $expectedMd5 = md5($payload);

        // 1) init
        $this->client->request('POST', '/api/uploads/init', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode([
            'filename' => 'flow.jpg',
            'size' => $fileSize,
            'mimeType' => 'image/jpeg',
            'totalChunks' => 2,
        ]));
        self::assertResponseStatusCodeSame(201);
        $uploadId = json_decode($this->client->getResponse()->getContent(), true)['uploadId'];

        // 2) chunk 0
        $this->client->request('PUT', "/api/uploads/$uploadId/chunks/0", [], [], [
            'CONTENT_TYPE' => 'application/octet-stream',
            'HTTP_X-User-Id' => 'user-1',
        ], substr($payload, 0, $chunkSize));
        self::assertResponseIsSuccessful();

        // 3) chunk 1
        $this->client->request('PUT', "/api/uploads/$uploadId/chunks/1", [], [], [
            'CONTENT_TYPE' => 'application/octet-stream',
            'HTTP_X-User-Id' => 'user-1',
        ], substr($payload, $chunkSize));
        self::assertResponseIsSuccessful();

        // 4) status before finalize
        $this->client->request('GET', "/api/uploads/$uploadId/status", [], [], [
            'HTTP_X-User-Id' => 'user-1',
        ]);
        self::assertResponseIsSuccessful();
        $status = json_decode($this->client->getResponse()->getContent(), true);
        self::assertSame([0, 1], $status['uploadedChunks']);
        self::assertSame('pending', $status['status']);

        // 5) finalize
        $this->client->request('POST', "/api/uploads/$uploadId/finalize", [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode(['md5' => $expectedMd5]));
        self::assertResponseIsSuccessful();
        $finalize = json_decode($this->client->getResponse()->getContent(), true);
        self::assertFalse($finalize['deduplicated']);
        self::assertStringStartsWith('/uploads/', $finalize['url']);

        // 6) serve the uploaded file via GET /uploads/…
        $this->client->request('GET', $finalize['url']);
        self::assertResponseIsSuccessful();
        // BinaryFileResponse streams the body; Content-Length reveals the size
        self::assertSame(
            (string) strlen($payload),
            $this->client->getResponse()->headers->get('Content-Length')
        );
        self::assertStringContainsString(
            'image/',
            (string) $this->client->getResponse()->headers->get('Content-Type')
        );

        // 7) path traversal attempt must be rejected
        $this->client->request('GET', '/uploads/../var/data_test.db');
        self::assertResponseStatusCodeSame(404);

        // 9) finalize same MD5 again from a different upload → deduplicated
        $this->client->request('POST', '/api/uploads/init', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode([
            'filename' => 'duplicate.jpg',
            'size' => $fileSize,
            'mimeType' => 'image/jpeg',
            'totalChunks' => 2,
        ]));
        $dupId = json_decode($this->client->getResponse()->getContent(), true)['uploadId'];

        $this->client->request('PUT', "/api/uploads/$dupId/chunks/0", [], [], [
            'CONTENT_TYPE' => 'application/octet-stream',
            'HTTP_X-User-Id' => 'user-1',
        ], substr($payload, 0, $chunkSize));
        $this->client->request('PUT', "/api/uploads/$dupId/chunks/1", [], [], [
            'CONTENT_TYPE' => 'application/octet-stream',
            'HTTP_X-User-Id' => 'user-1',
        ], substr($payload, $chunkSize));
        $this->client->request('POST', "/api/uploads/$dupId/finalize", [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode(['md5' => $expectedMd5]));

        self::assertResponseIsSuccessful();
        $dup = json_decode($this->client->getResponse()->getContent(), true);
        self::assertTrue($dup['deduplicated']);
    }

    public function testFinalizeRejectsMd5Mismatch(): void
    {
        $payload = $this->buildJpegPayload(500); // <1MB so single chunk

        $this->client->request('POST', '/api/uploads/init', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode([
            'filename' => 'small.jpg',
            'size' => 500,
            'mimeType' => 'image/jpeg',
            'totalChunks' => 1,
        ]));
        $uploadId = json_decode($this->client->getResponse()->getContent(), true)['uploadId'];

        $this->client->request('PUT', "/api/uploads/$uploadId/chunks/0", [], [], [
            'CONTENT_TYPE' => 'application/octet-stream',
            'HTTP_X-User-Id' => 'user-1',
        ], $payload);
        self::assertResponseIsSuccessful();

        $this->client->request('POST', "/api/uploads/$uploadId/finalize", [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode(['md5' => str_repeat('0', 32)]));

        self::assertResponseStatusCodeSame(422);
    }

    public function testRejectsMimeTypeMismatch(): void
    {
        // Declare image/jpeg but send a text payload — should fail magic-number check
        $this->client->request('POST', '/api/uploads/init', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X-User-Id' => 'user-1',
        ], json_encode([
            'filename' => 'fake.jpg',
            'size' => 100,
            'mimeType' => 'image/jpeg',
            'totalChunks' => 1,
        ]));
        $uploadId = json_decode($this->client->getResponse()->getContent(), true)['uploadId'];

        $this->client->request('PUT', "/api/uploads/$uploadId/chunks/0", [], [], [
            'CONTENT_TYPE' => 'application/octet-stream',
            'HTTP_X-User-Id' => 'user-1',
        ], str_repeat('This is plain text content. ', 4));

        self::assertResponseStatusCodeSame(415);
    }

    protected function tearDown(): void
    {
        // Clean up var/uploads to avoid leftover test artifacts
        $uploadsDir = static::getContainer()->getParameter('app.uploads_dir');
        $storageDir = static::getContainer()->getParameter('app.storage_dir');
        foreach ([$uploadsDir, $storageDir] as $dir) {
            if (is_dir($dir)) {
                $this->recursiveDelete($dir);
            }
        }
        parent::tearDown();
    }

    private function recursiveDelete(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $path = $dir.DIRECTORY_SEPARATOR.$file;
            if (is_dir($path)) {
                $this->recursiveDelete($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    }
}
