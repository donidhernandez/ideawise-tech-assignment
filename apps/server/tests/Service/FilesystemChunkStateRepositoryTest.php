<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\ChunkStorage;
use App\Service\FilesystemChunkStateRepository;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\Uid\Uuid;

class FilesystemChunkStateRepositoryTest extends TestCase
{
    private string $tmpDir;
    private ChunkStorage $chunkStorage;
    private FilesystemChunkStateRepository $repo;
    private Filesystem $filesystem;

    protected function setUp(): void
    {
        $this->filesystem = new Filesystem();
        $this->tmpDir = sys_get_temp_dir().'/chunkstate_fs_'.bin2hex(random_bytes(6));
        $this->filesystem->mkdir($this->tmpDir);
        $this->chunkStorage = new ChunkStorage($this->filesystem, $this->tmpDir);
        $this->repo = new FilesystemChunkStateRepository($this->chunkStorage);
    }

    protected function tearDown(): void
    {
        if (is_dir($this->tmpDir)) {
            $this->filesystem->remove($this->tmpDir);
        }
    }

    public function testListChunksReturnsEmptyForUnknownUpload(): void
    {
        self::assertSame([], $this->repo->listChunks(Uuid::v7()));
    }

    public function testListChunksReturnsExistingPartFilesInOrder(): void
    {
        $id = Uuid::v7();
        $this->chunkStorage->writeChunk($id, 2, 'c');
        $this->chunkStorage->writeChunk($id, 0, 'a');
        $this->chunkStorage->writeChunk($id, 1, 'b');

        self::assertSame([0, 1, 2], $this->repo->listChunks($id));
    }

    public function testHasChunkReflectsFilesystemTruth(): void
    {
        $id = Uuid::v7();
        self::assertFalse($this->repo->hasChunk($id, 0));
        $this->chunkStorage->writeChunk($id, 0, 'x');
        self::assertTrue($this->repo->hasChunk($id, 0));
    }

    public function testAddChunkIsAnIntentionalNoOp(): void
    {
        // The filesystem store treats the .part file's existence as the
        // record. addChunk() exists on the interface so the Redis store
        // can write asynchronously; on filesystem it's a no-op and must
        // never throw.
        $id = Uuid::v7();
        $this->repo->addChunk($id, 5);
        self::assertSame([], $this->repo->listChunks($id));
    }

    public function testRemoveUploadDoesNotErrorAndLeavesFilesystemToTheCaller(): void
    {
        // removeUpload is a no-op on this backend; the caller is
        // expected to remove the directory via ChunkStorage. We verify
        // it doesn't throw and that the on-disk state is unchanged.
        $id = Uuid::v7();
        $this->chunkStorage->writeChunk($id, 0, 'x');
        $this->repo->removeUpload($id);
        self::assertSame([0], $this->repo->listChunks($id));
    }
}
