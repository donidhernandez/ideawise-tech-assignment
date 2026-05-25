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
  idle:        'bg-zinc-100 text-zinc-500',
  initializing:'bg-zinc-100 text-zinc-600',
  uploading:   'bg-violet-100 text-violet-700',
  paused:      'bg-amber-100 text-amber-700',
  finalizing:  'bg-sky-100 text-sky-700',
  complete:    'bg-emerald-100 text-emerald-700',
  failed:      'bg-rose-100 text-rose-700',
  canceled:    'bg-zinc-100 text-zinc-400',
};

/** Statuses that get the pulsing live dot. */
const ANIMATED = new Set<UploadStatus>(['uploading', 'initializing', 'finalizing']);

interface Props {
  status: UploadStatus;
  deduplicated?: boolean;
}

export function StatusBadge({ status, deduplicated = false }: Props) {
  const label = status === 'complete' && deduplicated ? 'Deduplicated' : LABELS[status];
  const isAnimated = ANIMATED.has(status);

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        CLASSES[status],
      ].join(' ')}
    >
      {isAnimated && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse"
          aria-hidden="true"
        />
      )}
      {status === 'complete' && !deduplicated && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2 6 5 9 10 3" />
        </svg>
      )}
      {label}
    </span>
  );
}
