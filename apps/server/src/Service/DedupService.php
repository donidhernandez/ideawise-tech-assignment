<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Upload;
use App\Repository\UploadRepository;

class DedupService
{
    public function __construct(private readonly UploadRepository $uploads)
    {
    }

    /**
     * Returns an existing completed upload with the same MD5, or null.
     */
    public function findExisting(string $md5): ?Upload
    {
        return $this->uploads->findCompletedByMd5($md5);
    }
}
