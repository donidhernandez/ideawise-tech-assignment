<?php

declare(strict_types=1);

namespace App\Controller\Api;

use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Serves finalized uploads out of var/storage/.
 *
 * The URL returned by /api/uploads/{id}/finalize looks like:
 *   /uploads/{userId}/{YYYY/MM/DD}/{md5}_{filename}
 *
 * This controller maps that URL to the file on disk and streams it with
 * an inline Content-Disposition so browsers can render images/videos
 * directly in an <img> or <video> tag.
 *
 * Path traversal is prevented by resolving the absolute path and asserting
 * it still starts with the storage directory prefix.
 */
final class ServeUploadController
{
    public function __construct(
        private readonly string $storageDir,
    ) {
    }

    #[Route(
        '/uploads/{path}',
        name: 'serve_upload',
        requirements: ['path' => '.+'],
        methods: ['GET', 'HEAD']
    )]
    public function __invoke(string $path, Request $request): Response
    {
        // Normalise separators and resolve to absolute path
        $relative  = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);
        $storageRoot = realpath($this->storageDir);

        if ($storageRoot === false) {
            // Storage dir hasn't been created yet (no files finalized, or dir was removed).
            // From the client's perspective the file simply does not exist.
            throw new NotFoundHttpException('File not found.');
        }

        $absolute = $storageRoot . DIRECTORY_SEPARATOR . $relative;
        $resolved = realpath($absolute);

        // Guard against path traversal: the resolved path must stay inside storageDir
        if (
            $resolved === false
            || !str_starts_with($resolved, $storageRoot . DIRECTORY_SEPARATOR)
            || !is_file($resolved)
        ) {
            throw new NotFoundHttpException('File not found.');
        }

        // Detect MIME type via the ext-fileinfo extension (always available; no
        // symfony/mime package required). Falls back to octet-stream for safety.
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($resolved) ?: 'application/octet-stream';

        $response = new BinaryFileResponse($resolved, 200, ['Content-Type' => $mime]);

        // Let the browser display the file inline (images render in <img>, videos in <video>)
        $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_INLINE, basename($resolved));

        // 24-hour cache; files are immutable once finalised (content-addressed by MD5)
        $response->setMaxAge(86400);
        $response->setPublic();

        return $response;
    }
}
