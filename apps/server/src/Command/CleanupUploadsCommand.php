<?php

declare(strict_types=1);

namespace App\Command;

use App\Repository\UploadRepository;
use App\Service\ChunkStateRepository;
use App\Service\ChunkStorage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Filesystem\Filesystem;

#[AsCommand(
    name: 'app:uploads:cleanup',
    description: 'Cleans up incomplete (>30 min) and expired (>30 days) uploads'
)]
class CleanupUploadsCommand extends Command
{
    public function __construct(
        private readonly UploadRepository $uploads,
        private readonly EntityManagerInterface $em,
        private readonly ChunkStorage $chunkStorage,
        private readonly ChunkStateRepository $chunkState,
        private readonly Filesystem $filesystem,
        private readonly string $storageDir,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('incomplete-minutes', null, InputOption::VALUE_REQUIRED, 'Age threshold for incomplete uploads (minutes)', 30)
            ->addOption('retention-days', null, InputOption::VALUE_REQUIRED, 'Retention for completed files (days)', 30)
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Report what would be deleted without removing anything');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $dryRun = (bool) $input->getOption('dry-run');
        $incompleteMin = max(1, (int) $input->getOption('incomplete-minutes'));
        $retentionDays = max(1, (int) $input->getOption('retention-days'));

        $incompleteThreshold = new \DateTimeImmutable("-{$incompleteMin} minutes");
        $expiredThreshold = new \DateTimeImmutable("-{$retentionDays} days");

        $stale = $this->uploads->findStaleIncomplete($incompleteThreshold);
        $io->section(sprintf('Incomplete uploads older than %d minutes: %d', $incompleteMin, count($stale)));

        foreach ($stale as $upload) {
            $io->writeln(sprintf('  - %s (%s)', $upload->getId()->toRfc4122(), $upload->getCreatedAt()->format('c')));
            if (!$dryRun) {
                $this->chunkStorage->removeUploadDirectory($upload->getId());
                $this->chunkState->removeUpload($upload->getId());
                $this->em->remove($upload);
            }
        }

        $expired = $this->uploads->findExpiredComplete($expiredThreshold);
        $io->section(sprintf('Completed uploads older than %d days: %d', $retentionDays, count($expired)));

        foreach ($expired as $upload) {
            $io->writeln(sprintf('  - %s (%s)', $upload->getId()->toRfc4122(), $upload->getFinalizedAt()?->format('c') ?? '?'));
            if ($dryRun) {
                continue;
            }
            $storagePath = $upload->getStoragePath();
            if ($storagePath !== null) {
                // Only remove the physical file if no other upload references it (same md5)
                $sharedRefs = $this->uploads->createQueryBuilder('u')
                    ->select('COUNT(u.id)')
                    ->andWhere('u.storagePath = :path')
                    ->andWhere('u.id != :id')
                    ->setParameter('path', $storagePath)
                    ->setParameter('id', $upload->getId(), 'uuid')
                    ->getQuery()
                    ->getSingleScalarResult();

                if ((int) $sharedRefs === 0) {
                    $absolute = $this->storageDir.DIRECTORY_SEPARATOR.$storagePath;
                    if ($this->filesystem->exists($absolute)) {
                        $this->filesystem->remove($absolute);
                    }
                }
            }
            $this->em->remove($upload);
        }

        if (!$dryRun) {
            $this->em->flush();
        }

        $io->success($dryRun ? 'Dry run complete' : 'Cleanup complete');

        return Command::SUCCESS;
    }
}
