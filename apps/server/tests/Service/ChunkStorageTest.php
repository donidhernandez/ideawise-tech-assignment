<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\ChunkStorage;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\Uid\Uuid;

class ChunkStorageTest extends TestCase
{
    private string $tmpDir;
    private ChunkStorage $storage;
    private Filesystem $filesystem;

    protected function setUp(): void
    {
        $this->filesystem = new Filesystem();
        $this->tmpDir = sys_get_temp_dir().'/chunkstorage_'.bin2hex(random_bytes(6));
        $this->filesystem->mkdir($this->tmpDir);
        $this->storage = new ChunkStorage($this->filesystem, $this->tmpDir);
    }

    protected function tearDown(): void
    {
        if (is_dir($this->tmpDir)) {
            $this->filesystem->remove($this->tmpDir);
        }
    }

    public function testWriteChunkCreatesFileAndDirectory(): void
    {
        $id = Uuid::v7();
        $path = $this->storage->writeChunk($id, 0, 'hello');

        self::assertFileExists($path);
        self::assertSame('hello', file_get_contents($path));
        self::assertDirectoryExists($this->storage->getUploadDirectory($id));
    }

    public function testListReceivedChunksReturnsSortedIndexes(): void
    {
        $id = Uuid::v7();
        $this->storage->writeChunk($id, 2, 'c');
        $this->storage->writeChunk($id, 0, 'a');
        $this->storage->writeChunk($id, 1, 'b');

        self::assertSame([0, 1, 2], $this->storage->listReceivedChunks($id));
    }

    public function testChunkExists(): void
    {
        $id = Uuid::v7();
        self::assertFalse($this->storage->chunkExists($id, 0));
        $this->storage->writeChunk($id, 0, 'x');
        self::assertTrue($this->storage->chunkExists($id, 0));
    }

    public function testRemoveUploadDirectoryDeletesAllChunks(): void
    {
        $id = Uuid::v7();
        $this->storage->writeChunk($id, 0, 'a');
        $this->storage->writeChunk($id, 1, 'b');
        $dir = $this->storage->getUploadDirectory($id);
        self::assertDirectoryExists($dir);

        $this->storage->removeUploadDirectory($id);
        self::assertDirectoryDoesNotExist($dir);
    }

    public function testListReceivedChunksOnMissingDirectoryReturnsEmpty(): void
    {
        $id = Uuid::v7();
        self::assertSame([], $this->storage->listReceivedChunks($id));
    }
}
