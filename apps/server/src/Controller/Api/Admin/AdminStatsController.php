<?php

declare(strict_types=1);

namespace App\Controller\Api\Admin;

use App\Entity\Upload;
use App\Repository\UploadRepository;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class AdminStatsController
{
    public function __construct(
        private readonly UploadRepository $repo,
        #[Autowire('%kernel.project_dir%/var/storage')]
        private readonly string $storageDir,
    ) {
    }

    #[Route('/api/admin/stats', name: 'api_admin_stats', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        $todayUtc = new \DateTimeImmutable('today', new \DateTimeZone('UTC'));

        $active = $this->repo->countByStatus(Upload::STATUS_PENDING);
        $completedToday = $this->repo->countCompletedSince($todayUtc);
        $failedToday = $this->repo->countFailedSince($todayUtc);

        $totalToday = $completedToday + $failedToday;
        $successRateToday = $totalToday === 0 ? 1.0 : round($completedToday / $totalToday, 4);

        $totalStorageBytes = (int) $this->repo->sumStorageBytes();

        // Disk metrics — guard against missing storage dir on fresh install
        $diskFreeBytes = 0;
        $diskTotalBytes = 0;
        if (is_dir($this->storageDir)) {
            $free = disk_free_space($this->storageDir);
            $total = disk_total_space($this->storageDir);
            $diskFreeBytes = $free !== false ? (int) $free : 0;
            $diskTotalBytes = $total !== false ? (int) $total : 0;
        }

        // Load average — not available on Windows
        $loadAvg = function_exists('sys_getloadavg') ? sys_getloadavg() : null;

        return new JsonResponse([
            'queue' => [
                'active' => $active,
                'completedToday' => $completedToday,
                'failedToday' => $failedToday,
                'successRateToday' => $successRateToday,
                'pendingIncomplete' => $active,
                'totalStorageBytes' => $totalStorageBytes,
            ],
            'system' => [
                'memoryUsedBytes' => memory_get_usage(true),
                'memoryPeakBytes' => memory_get_peak_usage(true),
                'diskFreeBytes' => $diskFreeBytes,
                'diskTotalBytes' => $diskTotalBytes,
                'loadAvg' => $loadAvg,
            ],
            'generatedAt' => (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format(\DateTimeInterface::ATOM),
        ]);
    }
}
