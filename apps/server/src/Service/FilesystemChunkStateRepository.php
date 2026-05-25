<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\Uid\Uuid;

/**
 * Default backend. Treats the chunk files on disk as the index — listing the
 * `var/uploads/{uploadId}/*.part` directory IS the source of truth.
 *
 * The trade-off versus Redis: on a single-host deployment this is
 * adequate and zero-config; behind a load balancer with sticky-session
 * disabled it breaks because a chunk PUT on host A doesn't show up in
 * a /status query routed to host B. ADR-016 covers the migration.
 */
class FilesystemChunkStateRepository implements ChunkStateRepository
{
    public function __construct(private readonly ChunkStorage $chunkStorage)
    {
    }

    public function addChunk(Uuid $uploadId, int $index): void
    {
        // No-op: the chunk file's existence on disk *is* the record.
        // ChunkStorage::writeChunk has already happened before this is called.
        // Keeping the method on the interface lets the Redis backend stay
        // symmetrical without a special case in the controller.
        unset($uploadId, $index);
    }

    public function listChunks(Uuid $uploadId): array
    {
        return $this->chunkStorage->listReceivedChunks($uploadId);
    }

    public function hasChunk(Uuid $uploadId, int $index): bool
    {
        return $this->chunkStorage->chunkExists($uploadId, $index);
    }

    public function removeUpload(Uuid $uploadId): void
    {
        // The chunk directory is removed by the caller (FinalizeController /
        // CleanupCommand) via ChunkStorage::removeUploadDirectory. Nothing
        // to do at the index level.
        unset($uploadId);
    }
}
