<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Entity\Upload;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class AdminStatsControllerTest extends WebTestCase
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
        $this->client->request('GET', '/api/admin/stats');

        self::assertResponseStatusCodeSame(401);
    }

    public function testReturnsZeroCountsOnEmptyDb(): void
    {
        $this->client->request('GET', '/api/admin/stats', [], [], [
            'HTTP_X-User-Id' => 'admin-user',
        ]);

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($this->client->getResponse()->getContent(), true);

        self::assertSame(0, $body['queue']['active']);
        self::assertSame(0, $body['queue']['completedToday']);
        self::assertEquals(1.0, $body['queue']['successRateToday']);
    }

    public function testCountsActiveAndCompleted(): void
    {
        $pending = new Upload('pending.jpg', 'image/jpeg', '1048576', 1, 'user-1');
        // status defaults to pending — no call needed

        $complete = new Upload('done.jpg', 'image/jpeg', '2097152', 2, 'user-1');
        $complete->setStatus(Upload::STATUS_COMPLETE);
        $complete->setFinalizedAt(new \DateTimeImmutable());

        $this->em->persist($pending);
        $this->em->persist($complete);
        $this->em->flush();

        $this->client->request('GET', '/api/admin/stats', [], [], [
            'HTTP_X-User-Id' => 'admin-user',
        ]);

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($this->client->getResponse()->getContent(), true);

        self::assertSame(1, $body['queue']['active']);
        self::assertSame(1, $body['queue']['completedToday']);
    }

    public function testSystemMetricsPresent(): void
    {
        $this->client->request('GET', '/api/admin/stats', [], [], [
            'HTTP_X-User-Id' => 'admin-user',
        ]);

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($this->client->getResponse()->getContent(), true);

        self::assertArrayHasKey('system', $body);
        self::assertGreaterThan(0, $body['system']['memoryUsedBytes']);
        self::assertGreaterThanOrEqual(0, $body['system']['diskTotalBytes']);
    }
}
