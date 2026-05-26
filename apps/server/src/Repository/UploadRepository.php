<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Upload;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<Upload>
 */
class UploadRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Upload::class);
    }

    public function findByIdAndUser(Uuid $id, string $userId): ?Upload
    {
        return $this->createQueryBuilder('u')
            ->andWhere('u.id = :id')
            ->andWhere('u.userId = :userId')
            ->setParameter('id', $id, 'uuid')
            ->setParameter('userId', $userId)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function findCompletedByMd5(string $md5): ?Upload
    {
        return $this->createQueryBuilder('u')
            ->andWhere('u.md5Hash = :md5')
            ->andWhere('u.status = :status')
            ->setParameter('md5', $md5)
            ->setParameter('status', Upload::STATUS_COMPLETE)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * @return Upload[]
     */
    public function findStaleIncomplete(\DateTimeImmutable $threshold): array
    {
        return $this->createQueryBuilder('u')
            ->andWhere('u.status = :status')
            ->andWhere('u.createdAt < :threshold')
            ->setParameter('status', Upload::STATUS_PENDING)
            ->setParameter('threshold', $threshold)
            ->getQuery()
            ->getResult();
    }

    /**
     * @return Upload[]
     */
    public function findExpiredComplete(\DateTimeImmutable $threshold): array
    {
        return $this->createQueryBuilder('u')
            ->andWhere('u.status = :status')
            ->andWhere('u.finalizedAt < :threshold')
            ->setParameter('status', Upload::STATUS_COMPLETE)
            ->setParameter('threshold', $threshold)
            ->getQuery()
            ->getResult();
    }

    public function countByStatus(string $status): int
    {
        return (int) $this->createQueryBuilder('u')
            ->select('COUNT(u)')
            ->andWhere('u.status = :status')
            ->setParameter('status', $status)
            ->getQuery()
            ->getSingleScalarResult();
    }

    public function countCompletedSince(\DateTimeImmutable $since): int
    {
        return (int) $this->createQueryBuilder('u')
            ->select('COUNT(u)')
            ->andWhere('u.status = :status')
            ->andWhere('u.finalizedAt >= :since')
            ->setParameter('status', Upload::STATUS_COMPLETE)
            ->setParameter('since', $since)
            ->getQuery()
            ->getSingleScalarResult();
    }

    public function countFailedSince(\DateTimeImmutable $since): int
    {
        return (int) $this->createQueryBuilder('u')
            ->select('COUNT(u)')
            ->andWhere('u.status = :status')
            ->andWhere('u.createdAt >= :since')
            ->setParameter('status', Upload::STATUS_FAILED)
            ->setParameter('since', $since)
            ->getQuery()
            ->getSingleScalarResult();
    }

    public function sumStorageBytes(): string
    {
        $result = $this->createQueryBuilder('u')
            ->select('SUM(u.size)')
            ->andWhere('u.status = :status')
            ->setParameter('status', Upload::STATUS_COMPLETE)
            ->getQuery()
            ->getSingleScalarResult();

        return $result === null ? '0' : (string) $result;
    }

    /**
     * @return Upload[]
     */
    public function findRecent(int $limit, int $offset = 0): array
    {
        return $this->createQueryBuilder('u')
            ->orderBy('u.createdAt', 'DESC')
            ->setMaxResults($limit)
            ->setFirstResult($offset)
            ->getQuery()
            ->getResult();
    }

    public function countAll(): int
    {
        return (int) $this->createQueryBuilder('u')
            ->select('COUNT(u)')
            ->getQuery()
            ->getSingleScalarResult();
    }
}
