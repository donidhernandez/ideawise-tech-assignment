<?php

declare(strict_types=1);

namespace App\Service;

class MagicNumberValidator
{
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/avif',
        'image/bmp',
        'image/tiff',
        'image/heic',
        'image/heif',
        'image/svg+xml',
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
        'video/webm',
        'video/mpeg',
        'video/3gpp',
        'video/3gpp2',
    ];

    /**
     * Detects the real MIME type of a file by reading its magic number.
     */
    public function detect(string $filePath): string
    {
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($filePath);
        if ($mime === false) {
            throw new \RuntimeException('Failed to detect MIME type for '.$filePath);
        }

        return $mime;
    }

    /**
     * Detects MIME type from a binary buffer (used on chunk 0 before reassembly).
     */
    public function detectFromBuffer(string $buffer): string
    {
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->buffer($buffer);
        if ($mime === false) {
            throw new \RuntimeException('Failed to detect MIME type from buffer');
        }

        return $mime;
    }

    public function isAllowed(string $mimeType): bool
    {
        return in_array($mimeType, self::ALLOWED_MIME_TYPES, true);
    }

    /**
     * @return string[]
     */
    public function getAllowedMimeTypes(): array
    {
        return self::ALLOWED_MIME_TYPES;
    }
}
