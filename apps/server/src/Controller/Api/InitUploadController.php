<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\Upload;
use App\EventSubscriber\UserIdSubscriber;
use App\Service\ChunkStorage;
use App\Service\DedupService;
use App\Service\MagicNumberValidator;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

final class InitUploadController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ChunkStorage $chunkStorage,
        private readonly DedupService $dedup,
        private readonly MagicNumberValidator $mimeValidator,
        private readonly int $maxUploadSize,
        private readonly int $chunkSize,
    ) {
    }

    #[Route('/api/uploads/init', name: 'api_uploads_init', methods: ['POST'])]
    public function __invoke(Request $request): JsonResponse
    {
        $userId = $request->attributes->get(UserIdSubscriber::ATTR_USER_ID);
        $payload = json_decode($request->getContent(), true);

        if (!is_array($payload)) {
            return new JsonResponse(['error' => 'invalid_json'], 400);
        }

        $filename = $payload['filename'] ?? null;
        $size = $payload['size'] ?? null;
        $mimeType = $payload['mimeType'] ?? null;
        $totalChunks = $payload['totalChunks'] ?? null;
        $md5 = $payload['md5'] ?? null;

        if (!is_string($filename) || $filename === '') {
            return new JsonResponse(['error' => 'invalid_filename'], 400);
        }
        if (!is_int($size) || $size <= 0) {
            return new JsonResponse(['error' => 'invalid_size'], 400);
        }
        if ($size > $this->maxUploadSize) {
            return new JsonResponse([
                'error' => 'size_too_large',
                'maxBytes' => $this->maxUploadSize,
            ], 413);
        }
        if (!is_string($mimeType) || !$this->mimeValidator->isAllowed($mimeType)) {
            return new JsonResponse([
                'error' => 'unsupported_mime_type',
                'allowed' => $this->mimeValidator->getAllowedMimeTypes(),
            ], 415);
        }
        if (!is_int($totalChunks) || $totalChunks <= 0) {
            return new JsonResponse(['error' => 'invalid_total_chunks'], 400);
        }

        $expectedChunks = (int) ceil($size / $this->chunkSize);
        if ($totalChunks !== $expectedChunks) {
            return new JsonResponse([
                'error' => 'chunk_count_mismatch',
                'expected' => $expectedChunks,
                'chunkSize' => $this->chunkSize,
            ], 400);
        }

        // Early dedup: if client sends MD5 and we already have it, short-circuit.
        if (is_string($md5) && preg_match('/^[a-f0-9]{32}$/i', $md5) === 1) {
            $existing = $this->dedup->findExisting(strtolower($md5));
            if ($existing !== null) {
                return new JsonResponse([
                    'deduplicated' => true,
                    'fileId' => $existing->getId()->toRfc4122(),
                    'url' => '/uploads/'.$existing->getStoragePath(),
                ]);
            }
        }

        $upload = new Upload($filename, $mimeType, (string) $size, $totalChunks, $userId);
        $this->em->persist($upload);
        $this->em->flush();

        $this->chunkStorage->ensureUploadDirectory($upload->getId());

        return new JsonResponse([
            'uploadId' => $upload->getId()->toRfc4122(),
            'existingChunks' => [],
            'chunkSize' => $this->chunkSize,
        ], 201);
    }
}
