<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\Upload;
use App\EventSubscriber\UserIdSubscriber;
use App\Repository\UploadRepository;
use App\Service\ChunkStateRepository;
use App\Service\ChunkStorage;
use App\Service\MagicNumberValidator;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

final class UploadChunkController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly UploadRepository $uploads,
        private readonly ChunkStorage $chunkStorage,
        private readonly ChunkStateRepository $chunkState,
        private readonly MagicNumberValidator $mimeValidator,
        private readonly LoggerInterface $logger,
        private readonly int $chunkSize,
    ) {
    }

    #[Route(
        '/api/uploads/{uploadId}/chunks/{index}',
        name: 'api_uploads_chunk',
        requirements: ['uploadId' => '[0-9a-fA-F\-]{36}', 'index' => '\d+'],
        methods: ['PUT']
    )]
    public function __invoke(string $uploadId, int $index, Request $request): JsonResponse
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
        if ($upload->getStatus() !== Upload::STATUS_PENDING) {
            return new JsonResponse(['error' => 'upload_not_pending'], 409);
        }
        if ($index < 0 || $index >= $upload->getTotalChunks()) {
            return new JsonResponse(['error' => 'chunk_index_out_of_range'], 400);
        }

        $data = $request->getContent();
        if ($data === '') {
            return new JsonResponse(['error' => 'empty_chunk'], 400);
        }

        $isLastChunk = $index === ($upload->getTotalChunks() - 1);
        $length = strlen($data);
        if (!$isLastChunk && $length !== $this->chunkSize) {
            return new JsonResponse([
                'error' => 'invalid_chunk_size',
                'expected' => $this->chunkSize,
                'received' => $length,
            ], 400);
        }
        if ($isLastChunk && $length > $this->chunkSize) {
            return new JsonResponse([
                'error' => 'last_chunk_too_large',
                'max' => $this->chunkSize,
                'received' => $length,
            ], 400);
        }

        // Optional Content-MD5 verification of this single chunk
        $expectedMd5 = $request->headers->get('Content-MD5');
        if (is_string($expectedMd5) && $expectedMd5 !== '') {
            $actualMd5 = md5($data);
            if (!hash_equals(strtolower($expectedMd5), $actualMd5)) {
                return new JsonResponse(['error' => 'chunk_md5_mismatch'], 422);
            }
        }

        // Validate magic number on chunk 0 (file header lives there)
        if ($index === 0) {
            $sniffed = $this->mimeValidator->detectFromBuffer(substr($data, 0, 4096));
            if (!$this->mimeValidator->isAllowed($sniffed)) {
                $this->logger->warning('Rejected upload due to magic-number mismatch', [
                    'uploadId' => $upload->getId()->toRfc4122(),
                    'declaredMime' => $upload->getMimeType(),
                    'detectedMime' => $sniffed,
                ]);

                return new JsonResponse([
                    'error' => 'mime_type_mismatch',
                    'declared' => $upload->getMimeType(),
                    'detected' => $sniffed,
                ], 415);
            }
        }

        $alreadyExisted = $this->chunkStorage->chunkExists($uuid, $index);
        $this->chunkStorage->writeChunk($uuid, $index, $data);
        $this->chunkState->addChunk($uuid, $index);

        if (!$alreadyExisted) {
            $upload->setReceivedChunks($upload->getReceivedChunks() + 1);
            $this->em->flush();
        }

        return new JsonResponse([
            'received' => true,
            'index' => $index,
            'receivedChunks' => $upload->getReceivedChunks(),
            'totalChunks' => $upload->getTotalChunks(),
        ]);
    }
}
