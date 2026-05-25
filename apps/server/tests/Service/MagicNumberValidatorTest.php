<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\MagicNumberValidator;
use PHPUnit\Framework\TestCase;

class MagicNumberValidatorTest extends TestCase
{
    private MagicNumberValidator $validator;

    protected function setUp(): void
    {
        $this->validator = new MagicNumberValidator();
    }

    public function testDetectsJpegFromMagicBytes(): void
    {
        // JPEG SOI marker + minimal data
        $jpegHeader = "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00";
        self::assertSame('image/jpeg', $this->validator->detectFromBuffer($jpegHeader));
        self::assertTrue($this->validator->isAllowed('image/jpeg'));
    }

    public function testDetectsPngFromMagicBytes(): void
    {
        $pngHeader = "\x89PNG\r\n\x1A\n\x00\x00\x00\x0DIHDR";
        self::assertSame('image/png', $this->validator->detectFromBuffer($pngHeader));
    }

    public function testRejectsExecutable(): void
    {
        // Windows PE header (MZ...)
        $exeHeader = "MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00";
        $detected = $this->validator->detectFromBuffer($exeHeader);
        self::assertFalse($this->validator->isAllowed($detected));
    }

    public function testRejectsArbitraryText(): void
    {
        $text = "This is just plain text content.";
        $detected = $this->validator->detectFromBuffer($text);
        self::assertFalse($this->validator->isAllowed($detected));
    }

    public function testGetAllowedMimeTypesReturnsList(): void
    {
        $allowed = $this->validator->getAllowedMimeTypes();
        self::assertContains('image/jpeg', $allowed);
        self::assertContains('video/mp4', $allowed);
    }
}
