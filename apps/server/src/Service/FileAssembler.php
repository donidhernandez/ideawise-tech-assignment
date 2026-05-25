<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Upload;
use Symfony\Component\Filesystem\Filesystem;

class FileAssembler
{
    public function __construct(
        private readonly ChunkStorage $chunkStorage,
        private readonly Filesystem $filesystem,
        private readonly string $storageDir,
    ) {
    }

    /**
     * Concatenates all chunks for an upload into a single file in a temp location,
     * computes the MD5 hash, and returns [tempPath, md5].
     *
     * @return array{0: string, 1: string}
     */
    public function assemble(Upload $upload): array
    {
        $tempPath = sys_get_temp_dir().DIRECTORY_SEPARATOR.'assembled_'.$upload->getId()->toRfc4122();
        $out = fopen($tempPath, 'wb');
        if ($out === false) {
            throw new \RuntimeException('Failed to open temporary file for assembly');
        }

        $ctx = hash_init('md5');

        try {
            for ($i = 0; $i < $upload->getTotalChunks(); $i++) {
                $chunkPath = $this->chunkStorage->getChunkPath($upload->getId(), $i);
                if (!is_file($chunkPath)) {
                    throw new \RuntimeException("Missing chunk $i for upload {$upload->getId()->toRfc4122()}");
                }
                $in = fopen($chunkPath, 'rb');
                if ($in === false) {
                    throw new \RuntimeException("Failed to open chunk $i");
                }
                while (!feof($in)) {
                    $buf = fread($in, 8192);
                    if ($buf === false) {
                        fclose($in);
                        throw new \RuntimeException("Failed reading chunk $i");
                    }
                    hash_update($ctx, $buf);
                    fwrite($out, $buf);
                }
                fclose($in);
            }
        } finally {
            fclose($out);
        }

        $md5 = hash_final($ctx);

        return [$tempPath, $md5];
    }

    /**
     * Moves an assembled file to its final storage location:
     * var/storage/{YYYY/MM/DD}/{md5}_{sanitizedFilename}
     */
    public function moveToStorage(string $tempPath, string $md5, string $filename): string
    {
        $now = new \DateTimeImmutable();
        $relativeDir = $now->format('Y/m/d');
        $absoluteDir = $this->storageDir.DIRECTORY_SEPARATOR.$relativeDir;
        $this->filesystem->mkdir($absoluteDir, 0775);

        $safeName = $this->sanitizeFilename($filename);
        $finalPath = $absoluteDir.DIRECTORY_SEPARATOR.$md5.'_'.$safeName;
        $relativePath = $relativeDir.'/'.$md5.'_'.$safeName;

        $this->filesystem->rename($tempPath, $finalPath, true);

        return $relativePath;
    }

    private function sanitizeFilename(string $filename): string
    {
        $basename = basename($filename);
        $sanitized = preg_replace('/[^A-Za-z0-9._-]/', '_', $basename) ?? 'file';

        return mb_substr($sanitized, 0, 100);
    }
}
