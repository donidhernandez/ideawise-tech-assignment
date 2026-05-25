<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\Upload;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class AdminUploadsControllerTest extends WebTestCase
{
    private KernelBrowser $client;
    private EntityManagerInterface $em;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
        $this->em->createQuery('DELETE FROM ' . Upload::class)->execute();
    }

    public function testRequiresUserIdHeader(): void
    {
        $this->client->request('GET', '/api/admin/uploads');

        self::assertResponseStatusCodeSame(401);
    }

    public function testReturnsEmptyList(): void
    {
        $this->client->request('GET', '/api/admin/uploads', [], [], [
            'HTTP_X-User-Id' => 'admin-user',
        ]);

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($this->client->getResponse()->getContent(), true);

        self::assertSame(0, $body['total']);
        self::assertSame([], $body['uploads']);
    }

    public function testReturnsPaginatedList(): void
    {
        for ($i = 1; $i <= 3; $i++) {
            $upload = new Upload("file{$i}.jpg", 'image/jpeg', '1024', 1, 'user-1');
            $this->em->persist($upload);
        }
        $this->em->flush();

        $this->client->request('GET', '/api/admin/uploads?limit=2&page=1', [], [], [
            'HTTP_X-User-Id' => 'admin-user',
        ]);

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($this->client->getResponse()->getContent(), true);

        self::assertSame(3, $body['total']);
        self::assertCount(2, $body['uploads']);
        self::assertSame(1, $body['page']);
        self::assertSame(2, $body['limit']);
    }

    public function testLimitCappedAt100(): void
    {
        $this->client->request('GET', '/api/admin/uploads?limit=999', [], [], [
            'HTTP_X-User-Id' => 'admin-user',
        ]);

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($this->client->getResponse()->getContent(), true);

        self::assertSame(100, $body['limit']);
    }
}
