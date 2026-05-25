<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Container\ContainerInterface;
use Symfony\Contracts\Service\Attribute\Required;
use Symfony\Contracts\Service\ServiceSubscriberInterface;
use Symfony\Contracts\Service\ServiceSubscriberTrait;

/**
 * Selects the {@see ChunkStateRepository} implementation at boot time.
 *
 * - `filesystem` (default): uses {@see FilesystemChunkStateRepository},
 *   no extra infrastructure required. Adequate single-host.
 * - `redis`: uses {@see RedisChunkStateRepository}; requires `REDIS_DSN`
 *   to point at a reachable Redis server. Recommended for multi-host
 *   deployments. See ADR-016.
 *
 * Implemented as a ServiceSubscriber so neither backend is instantiated
 * unless the configured env actually selects it — predis won't try to
 * connect at boot when running with the filesystem default.
 */
class ChunkStateRepositoryFactory implements ServiceSubscriberInterface
{
    use ServiceSubscriberTrait;

    private string $backend;
    private ContainerInterface $locator;

    public function __construct(string $backend)
    {
        $this->backend = strtolower(trim($backend));
    }

    #[Required]
    public function setContainer(ContainerInterface $locator): void
    {
        $this->locator = $locator;
    }

    public static function getSubscribedServices(): array
    {
        return [
            FilesystemChunkStateRepository::class,
            RedisChunkStateRepository::class,
        ];
    }

    public function create(): ChunkStateRepository
    {
        return match ($this->backend) {
            'redis' => $this->locator->get(RedisChunkStateRepository::class),
            'filesystem', '' => $this->locator->get(FilesystemChunkStateRepository::class),
            default => throw new \InvalidArgumentException(
                sprintf('Unknown CHUNK_STATE_BACKEND "%s" (expected "filesystem" or "redis")', $this->backend)
            ),
        };
    }
}
