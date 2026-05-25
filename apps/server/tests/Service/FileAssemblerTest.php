<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Entity\Upload;
use App\Service\ChunkStorage;
use App\Service\FileAssembler;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;

class FileAssemblerTest extends TestCase
{
    private string $tmpRoot;
    private Filesystem $filesystem;
    private ChunkStorage $chunkStorage;
    private FileAssembler $assembler;

    protected function setUp(): void
    {
        $this->filesystem = new Filesystem();
        $this->tmpRoot = sys_get_temp_dir().'/assembler_'.bin2hex(random_bytes(6));
        $this->filesystem->mkdir($this->tmpRoot);
        $this->chunkStorage = new ChunkStorage($this->filesystem, $this->tmpRoot.'/uploads');
        $this->assembler = new FileAssembler($this->chunkStorage, $this->filesystem, $this->tmpRoot.'/storage');
    }

    protected function tearDown(): void
    {
        if (is_dir($this->tmpRoot)) {
            $this->filesystem->remove($this->tmpRoot);
        }
    }

    public function testAssemblesChunksInOrderAndComputesMd5(): void
    {
        $upload = new Upload('test.bin', 'application/octet-stream', '15', 3, 'user-1');
        $this->chunkStorage->writeChunk($upload->getId(), 0, 'AAAAA');
        $this->chunkStorage->writeChunk($upload->getId(), 1, 'BBBBB');
        $this->chunkStorage->writeChunk($upload->getId(), 2, 'CCCCC');

        [$tempPath, $md5] = $this->assembler->assemble($upload);

        self::assertFileExists($tempPath);
        self::assertSame('AAAAABBBBBCCCCC', file_get_contents($tempPath));
        self::assertSame(md5('AAAAABBBBBCCCCC'), $md5);

        @unlink($tempPath);
    }

    public function testAssembleThrowsWhenChunkMissing(): void
    {
        $upload = new Upload('broken.bin', 'application/octet-stream', '10', 2, 'user-1');
        $this->chunkStorage->writeChunk($upload->getId(), 0, 'AAAAA');
        // chunk 1 missing

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/Missing chunk 1/');
        $this->assembler->assemble($upload);
    }

    public function testMoveToStorageOrganizesByUserAndDate(): void
    {
        $tempFile = $this->tmpRoot.'/tempfile.bin';
        file_put_contents($tempFile, 'data');

        $md5 = md5('data');
        $relative = $this->assembler->moveToStorage($tempFile, $md5, 'My Photo.jpg', 'alice-42');

        $now = new \DateTimeImmutable();
        $expectedDir = 'alice-42/'.$now->format('Y/m/d');
        self::assertStringStartsWith($expectedDir.'/'.$md5.'_', $relative);
        self::assertStringEndsWith('.jpg', $relative);
        self::assertFileExists($this->tmpRoot.'/storage/'.$relative);
        self::assertFileDoesNotExist($tempFile);
    }

    public function testSanitizesUnsafeFilenameCharacters(): void
    {
        $tempFile = $this->tmpRoot.'/tempfile2.bin';
        file_put_contents($tempFile, 'x');
        $relative = $this->assembler->moveToStorage($tempFile, md5('x'), '../../etc/passwd', 'user-1');

        self::assertStringNotContainsString('..', basename($relative));
        self::assertStringNotContainsString('/', basename($relative));
    }

    public function testSanitizesUserIdInPath(): void
    {
        $tempFile = $this->tmpRoot.'/tempfile3.bin';
        file_put_contents($tempFile, 'x');
        $relative = $this->assembler->moveToStorage($tempFile, md5('x'), 'f.jpg', '../../malicious user@evil');

        // First path segment is the sanitized user id — no slashes, dots collapsed.
        $firstSegment = explode('/', $relative)[0];
        self::assertStringNotContainsString('..', $firstSegment);
        self::assertStringNotContainsString('@', $firstSegment);
        self::assertMatchesRegularExpression('/^[A-Za-z0-9_-]+$/', $firstSegment);
    }
}
