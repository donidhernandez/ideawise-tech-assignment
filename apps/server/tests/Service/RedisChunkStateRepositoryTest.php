<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\RedisChunkStateRepository;
use PHPUnit\Framework\TestCase;
use Predis\ClientInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Unit-tests the Redis backend by mocking Predis's ClientInterface. We
 * verify each repository method calls the expected Redis commands with
 * the expected arguments. A live integration test against a real Redis
 * server is deferred — predis is exercised through its documented
 * contract here.
 */
class RedisChunkStateRepositoryTest extends TestCase
{
    public function testAddChunkSAddsAndExpires(): void
    {
        $id = Uuid::v7();
        $expectedKey = 'upload:'.$id->toRfc4122().':chunks';

        $client = $this->createMock(ClientInterface::class);
        $client->expects(self::exactly(2))
            ->method('__call')
            ->willReturnCallback(function (string $method, array $args) use ($expectedKey): int {
                if ($method === 'sadd') {
                    self::assertSame($expectedKey, $args[0]);
                    self::assertSame(['0'], $args[1]);

                    return 1;
                }
                if ($method === 'expire') {
                    self::assertSame($expectedKey, $args[0]);
                    self::assertSame(RedisChunkStateRepository::TTL_SECONDS, $args[1]);

                    return 1;
                }
                self::fail('Unexpected redis call: '.$method);
            });

        (new RedisChunkStateRepository($client))->addChunk($id, 0);
    }

    public function testListChunksParsesSmembersIntoSortedInts(): void
    {
        $client = $this->createMock(ClientInterface::class);
        $client->expects(self::once())
            ->method('__call')
            ->with('smembers')
            ->willReturn(['4', '1', '2']);

        $repo = new RedisChunkStateRepository($client);
        self::assertSame([1, 2, 4], $repo->listChunks(Uuid::v7()));
    }

    public function testHasChunkUsesSismember(): void
    {
        $client = $this->createMock(ClientInterface::class);
        $client->expects(self::once())
            ->method('__call')
            ->with('sismember', self::callback(function ($args): bool {
                return is_string($args[0]) && $args[1] === '7';
            }))
            ->willReturn(1);

        $repo = new RedisChunkStateRepository($client);
        self::assertTrue($repo->hasChunk(Uuid::v7(), 7));
    }

    public function testHasChunkReturnsFalseOnMiss(): void
    {
        $client = $this->createMock(ClientInterface::class);
        $client->expects(self::once())->method('__call')->willReturn(0);

        $repo = new RedisChunkStateRepository($client);
        self::assertFalse($repo->hasChunk(Uuid::v7(), 0));
    }

    public function testRemoveUploadDelsTheKey(): void
    {
        $id = Uuid::v7();
        $expectedKey = 'upload:'.$id->toRfc4122().':chunks';

        $client = $this->createMock(ClientInterface::class);
        $client->expects(self::once())
            ->method('__call')
            ->with('del', [[$expectedKey]])
            ->willReturn(1);

        (new RedisChunkStateRepository($client))->removeUpload($id);
    }

    public function testCustomKeyPrefixIsHonored(): void
    {
        $id = Uuid::v7();
        $expectedKey = 'tenant42:'.$id->toRfc4122().':chunks';

        $client = $this->createMock(ClientInterface::class);
        $client->expects(self::once())
            ->method('__call')
            ->with('smembers', [$expectedKey])
            ->willReturn([]);

        (new RedisChunkStateRepository($client, 'tenant42'))->listChunks($id);
    }
}
