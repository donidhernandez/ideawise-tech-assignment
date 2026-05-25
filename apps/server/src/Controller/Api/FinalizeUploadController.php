<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\Upload;
use App\EventSubscriber\UserIdSubscriber;
use App\Repository\UploadRepository;
use App\Service\ChunkStorage;
use App\Service\DedupService;
use App\Service\FileAssembler;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

final class FinalizeUploadController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly UploadRepository $uploads,
        private readonly ChunkStorage $chunkStorage,
        private readonly FileAssembler $assembler,
        private readonly DedupService $dedup,
        private readonly Filesystem $filesystem,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route(
        '/api/uploads/{uploadId}/finalize',
        name: 'api_uploads_finalize',
        requirements: ['uploadId' => '[0-9a-fA-F\-]{36}'],
        methods: ['POST']
    )]
    public function __invoke(string $uploadId, Request $request): JsonResponse
    {
        $userId = $request->attributes->get(UserIdSubscriber::ATTR_USER_ID);

        try {
            $uuid = Uuid::fromString($uploadId);
        } catch (\InvalidArgumentException) {
            return new JsonResponse(['error' => 'invalid_upload_id'], 400);
        }

        $upload = $this->uploads->findByIdAndUser($uuid, $userId);
        if ($upload === null) {
            return new JsonResponse(['error' => 'upload_not_found'], 404);
        }
        if ($upload->getStatus() === Upload::STATUS_COMPLETE) {
            return new JsonResponse([
                'fileId' => $upload->getId()->toRfc4122(),
                'url' => '/uploads/'.$upload->getStoragePath(),
                'deduplicated' => false,
            ]);
        }
        if ($upload->getReceivedChunks() !== $upload->getTotalChunks()) {
            return new JsonResponse([
                'error' => 'missing_chunks',
                'received' => $upload->getReceivedChunks(),
                'total' => $upload->getTotalChunks(),
            ], 409);
        }

        $payload = json_decode($request->getContent(), true);
        $expectedMd5 = is_array($payload) ? ($payload['md5'] ?? null) : null;
        if (!is_string($expectedMd5) || preg_match('/^[a-f0-9]{32}$/i', $expectedMd5) !== 1) {
            return new JsonResponse(['error' => 'invalid_md5'], 400);
        }
        $expectedMd5 = strtolower($expectedMd5);

        try {
            [$tempPath, $actualMd5] = $this->assembler->assemble($upload);
        } catch (\Throwable $e) {
            $this->logger->error('Failed to assemble upload', [
                'uploadId' => $upload->getId()->toRfc4122(),
                'error' => $e->getMessage(),
            ]);
            $upload->setStatus(Upload::STATUS_FAILED);
            $this->em->flush();

            return new JsonResponse(['error' => 'assembly_failed'], 500);
        }

        if (!hash_equals($expectedMd5, $actualMd5)) {
            $this->filesystem->remove($tempPath);
            $upload->setStatus(Upload::STATUS_FAILED);
            $this->em->flush();

            return new JsonResponse([
                'error' => 'md5_mismatch',
                'expected' => $expectedMd5,
                'actual' => $actualMd5,
            ], 422);
        }

        // Deduplication: same MD5 already stored — discard chunks, point to existing file
        $existing = $this->dedup->findExisting($actualMd5);
        if ($existing !== null) {
            $this->filesystem->remove($tempPath);
            $this->chunkStorage->removeUploadDirectory($upload->getId());
            $upload->setStatus(Upload::STATUS_COMPLETE);
            $upload->setMd5Hash($actualMd5);
            $upload->setStoragePath($existing->getStoragePath());
            $upload->setFinalizedAt(new \DateTimeImmutable());
            $this->em->flush();

            return new JsonResponse([
                'fileId' => $upload->getId()->toRfc4122(),
                'url' => '/uploads/'.$existing->getStoragePath(),
                'deduplicated' => true,
            ]);
        }

        $storagePath = $this->assembler->moveToStorage($tempPath, $actualMd5, $upload->getFilename());
        $this->chunkStorage->removeUploadDirectory($upload->getId());

        $upload->setStatus(Upload::STATUS_COMPLETE);
        $upload->setMd5Hash($actualMd5);
        $upload->setStoragePath($storagePath);
        $upload->setFinalizedAt(new \DateTimeImmutable());
        $this->em->flush();

        $this->logger->info('Upload finalized', [
            'uploadId' => $upload->getId()->toRfc4122(),
            'md5' => $actualMd5,
            'storagePath' => $storagePath,
        ]);

        return new JsonResponse([
            'fileId' => $upload->getId()->toRfc4122(),
            'url' => '/uploads/'.$storagePath,
            'deduplicated' => false,
        ]);
    }
}
