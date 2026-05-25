<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\Uid\Uuid;

class ChunkStorage
{
    public function __construct(
        private readonly Filesystem $filesystem,
        private readonly string $uploadsDir,
    ) {
    }

    public function ensureUploadDirectory(Uuid $uploadId): string
    {
        $dir = $this->getUploadDirectory($uploadId);
        $this->filesystem->mkdir($dir, 0775);

        return $dir;
    }

    public function writeChunk(Uuid $uploadId, int $index, string $data): string
    {
        $dir = $this->ensureUploadDirectory($uploadId);
        $path = sprintf('%s/%d.part', $dir, $index);
        $this->filesystem->dumpFile($path, $data);

        return $path;
    }

    public function getChunkPath(Uuid $uploadId, int $index): string
    {
        return sprintf('%s/%d.part', $this->getUploadDirectory($uploadId), $index);
    }

    public function chunkExists(Uuid $uploadId, int $index): bool
    {
        return $this->filesystem->exists($this->getChunkPath($uploadId, $index));
    }

    /**
     * @return int[] sorted indexes of chunks already received
     */
    public function listReceivedChunks(Uuid $uploadId): array
    {
        $dir = $this->getUploadDirectory($uploadId);
        if (!is_dir($dir)) {
            return [];
        }

        $indexes = [];
        foreach (scandir($dir) ?: [] as $file) {
            if (preg_match('/^(\d+)\.part$/', $file, $m) === 1) {
                $indexes[] = (int) $m[1];
            }
        }
        sort($indexes);

        return $indexes;
    }

    public function getUploadDirectory(Uuid $uploadId): string
    {
        return sprintf('%s/%s', $this->uploadsDir, $uploadId->toRfc4122());
    }

    public function removeUploadDirectory(Uuid $uploadId): void
    {
        $dir = $this->getUploadDirectory($uploadId);
        if (is_dir($dir)) {
            $this->filesystem->remove($dir);
        }
    }
}
