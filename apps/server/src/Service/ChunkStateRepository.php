<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\Uid\Uuid;

/**
 * Backing store for "which chunks of upload X has the server received".
 *
 * The chunk bytes themselves always live on the filesystem (see
 * {@see ChunkStorage}). This repository is purely the index — the spec's
 * "track chunk status (Redis records)" requirement. Default
 * implementation is filesystem-backed (the .part directory IS the
 * source of truth); production deployments can flip
 * `CHUNK_STATE_BACKEND=redis` to share state across multiple
 * application servers behind a load balancer.
 *
 * Implementations must be:
 *   - idempotent on addChunk()
 *   - tolerant of race conditions (concurrent chunk PUTs are normal)
 *   - cheap on listChunks() because /status calls it on every poll
 */
interface ChunkStateRepository
{
    /** Records that index N of $uploadId has been received. */
    public function addChunk(Uuid $uploadId, int $index): void;

    /**
     * Returns the indexes the store has on file for $uploadId, sorted asc.
     * Empty array for unknown ids.
     *
     * @return int[]
     */
    public function listChunks(Uuid $uploadId): array;

    /** Constant-time check for a single chunk. */
    public function hasChunk(Uuid $uploadId, int $index): bool;

    /** Drops all chunk records for $uploadId (called after finalize / cancel). */
    public function removeUpload(Uuid $uploadId): void;
}
