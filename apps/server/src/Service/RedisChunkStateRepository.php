<?php

declare(strict_types=1);

namespace App\Service;

use Predis\ClientInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Redis-backed chunk index. Stores received chunk indexes per upload in a
 * Redis SET keyed by `upload:{id}:chunks`, with a 24-hour TTL per spec.
 *
 * Adds two guarantees over the filesystem default:
 *   - O(1) chunk-status reads instead of a directory scan.
 *   - State is shared across application hosts behind a load balancer,
 *     so chunk PUTs and /status polls can land on different servers.
 *
 * The chunk *bytes* still live on the filesystem (or on shared storage
 * in a multi-host deployment). This repository is the index, not the
 * data store.
 */
class RedisChunkStateRepository implements ChunkStateRepository
{
    /** 24 hours, per the spec's "cache uploaded chunks (24-hour retention)". */
    public const TTL_SECONDS = 24 * 60 * 60;

    public function __construct(
        private readonly ClientInterface $redis,
        /** Optional key prefix; useful when multiple apps share one Redis. */
        private readonly string $keyPrefix = 'upload',
    ) {
    }

    public function addChunk(Uuid $uploadId, int $index): void
    {
        $key = $this->key($uploadId);
        // SADD returns 0 if already present (idempotent — that's the design).
        $this->redis->sadd($key, [(string) $index]);
        // Re-arm the TTL on every write so an in-progress upload doesn't
        // expire mid-flight.
        $this->redis->expire($key, self::TTL_SECONDS);
    }

    public function listChunks(Uuid $uploadId): array
    {
        $members = $this->redis->smembers($this->key($uploadId));
        $indexes = array_map('intval', $members);
        sort($indexes);

        return $indexes;
    }

    public function hasChunk(Uuid $uploadId, int $index): bool
    {
        return (bool) $this->redis->sismember($this->key($uploadId), (string) $index);
    }

    public function removeUpload(Uuid $uploadId): void
    {
        $this->redis->del([$this->key($uploadId)]);
    }

    private function key(Uuid $uploadId): string
    {
        return sprintf('%s:%s:chunks', $this->keyPrefix, $uploadId->toRfc4122());
    }
}
