<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\UploadRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

#[ORM\Entity(repositoryClass: UploadRepository::class)]
#[ORM\Table(name: 'uploads')]
#[ORM\Index(name: 'idx_uploads_md5', columns: ['md5_hash'])]
#[ORM\Index(name: 'idx_uploads_status_created', columns: ['status', 'created_at'])]
class Upload
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_COMPLETE = 'complete';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(length: 255)]
    private string $filename;

    #[ORM\Column(length: 127)]
    private string $mimeType;

    #[ORM\Column(type: Types::BIGINT)]
    private string $size;

    #[ORM\Column(type: Types::INTEGER)]
    private int $totalChunks;

    #[ORM\Column(type: Types::INTEGER, options: ['default' => 0])]
    private int $receivedChunks = 0;

    #[ORM\Column(length: 16, options: ['default' => self::STATUS_PENDING])]
    private string $status = self::STATUS_PENDING;

    #[ORM\Column(length: 32, nullable: true)]
    private ?string $md5Hash = null;

    #[ORM\Column(length: 128)]
    private string $userId;

    #[ORM\Column(length: 512, nullable: true)]
    private ?string $storagePath = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $finalizedAt = null;

    public function __construct(string $filename, string $mimeType, string $size, int $totalChunks, string $userId)
    {
        $this->id = Uuid::v7();
        $this->filename = $filename;
        $this->mimeType = $mimeType;
        $this->size = $size;
        $this->totalChunks = $totalChunks;
        $this->userId = $userId;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }
    public function getFilename(): string { return $this->filename; }
    public function getMimeType(): string { return $this->mimeType; }
    public function getSize(): string { return $this->size; }
    public function getTotalChunks(): int { return $this->totalChunks; }
    public function getReceivedChunks(): int { return $this->receivedChunks; }
    public function getStatus(): string { return $this->status; }
    public function getMd5Hash(): ?string { return $this->md5Hash; }
    public function getUserId(): string { return $this->userId; }
    public function getStoragePath(): ?string { return $this->storagePath; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getFinalizedAt(): ?\DateTimeImmutable { return $this->finalizedAt; }

    public function setReceivedChunks(int $count): self { $this->receivedChunks = $count; return $this; }
    public function setStatus(string $status): self { $this->status = $status; return $this; }
    public function setMd5Hash(?string $hash): self { $this->md5Hash = $hash; return $this; }
    public function setStoragePath(?string $path): self { $this->storagePath = $path; return $this; }
    public function setFinalizedAt(?\DateTimeImmutable $at): self { $this->finalizedAt = $at; return $this; }

    public function isComplete(): bool { return $this->status === self::STATUS_COMPLETE; }
}
