import type { UploadStatus } from '@repo/upload-core';

const LABELS: Record<UploadStatus, string> = {
  idle: 'Idle',
  initializing: 'Init…',
  uploading: 'Uploading',
  paused: 'Paused',
  finalizing: 'Finalizing',
  complete: 'Complete',
  failed: 'Failed',
  canceled: 'Canceled',
};

const CLASSES: Record<UploadStatus, string> = {
  idle: 'bg-zinc-100 text-zinc-600',
  initializing: 'bg-zinc-100 text-zinc-700',
  uploading: 'bg-violet-100 text-violet-700',
  paused: 'bg-amber-100 text-amber-700',
  finalizing: 'bg-sky-100 text-sky-700',
  complete: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  canceled: 'bg-zinc-100 text-zinc-500',
};

interface Props {
  status: UploadStatus;
  deduplicated?: boolean;
}

export function StatusBadge({ status, deduplicated = false }: Props) {
  const label = status === 'complete' && deduplicated ? 'Deduplicated' : LABELS[status];
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        CLASSES[status],
      ].join(' ')}
    >
      {label}
    </span>
  );
}
