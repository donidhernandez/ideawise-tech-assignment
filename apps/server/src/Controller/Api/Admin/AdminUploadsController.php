<?php

declare(strict_types=1);

namespace App\Controller\Api\Admin;

use App\Repository\UploadRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

final class AdminUploadsController
{
    public function __construct(
        private readonly UploadRepository $repo,
    ) {
    }

    #[Route('/api/admin/uploads', name: 'api_admin_uploads', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        $page = max(1, (int) $request->query->get('page', 1));
        $limit = min(100, max(1, (int) $request->query->get('limit', 20)));
        $offset = ($page - 1) * $limit;

        $total = $this->repo->countAll();
        $uploads = $this->repo->findRecent($limit, $offset);

        $items = array_map(static function ($upload): array {
            return [
                'id' => $upload->getId()->toRfc4122(),
                'filename' => $upload->getFilename(),
                'mimeType' => $upload->getMimeType(),
                'size' => (int) $upload->getSize(),
                'status' => $upload->getStatus(),
                'userId' => $upload->getUserId(),
                'totalChunks' => $upload->getTotalChunks(),
                'receivedChunks' => $upload->getReceivedChunks(),
                'storagePath' => $upload->getStoragePath(),
                'createdAt' => $upload->getCreatedAt()->format(\DateTimeInterface::ATOM),
                'finalizedAt' => $upload->getFinalizedAt()?->format(\DateTimeInterface::ATOM),
            ];
        }, $uploads);

        return new JsonResponse([
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'uploads' => $items,
        ]);
    }
}
