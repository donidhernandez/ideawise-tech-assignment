<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\EventSubscriber\UserIdSubscriber;
use App\Repository\UploadRepository;
use App\Service\ChunkStorage;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

final class UploadStatusController
{
    public function __construct(
        private readonly UploadRepository $uploads,
        private readonly ChunkStorage $chunkStorage,
    ) {
    }

    #[Route(
        '/api/uploads/{uploadId}/status',
        name: 'api_uploads_status',
        requirements: ['uploadId' => '[0-9a-fA-F\-]{36}'],
        methods: ['GET']
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

        return new JsonResponse([
            'uploadId' => $upload->getId()->toRfc4122(),
            'status' => $upload->getStatus(),
            'totalChunks' => $upload->getTotalChunks(),
            'uploadedChunks' => $this->chunkStorage->listReceivedChunks($upload->getId()),
            'url' => $upload->getStoragePath() !== null ? '/uploads/'.$upload->getStoragePath() : null,
        ]);
    }
}
