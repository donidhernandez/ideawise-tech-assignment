import type { ErrorCategory } from '@repo/upload-core';
import { useRef } from 'react';
import { toast } from 'sonner';
import { env } from '../env.ts';
import { useUpload } from '../hooks/useUpload.ts';
import { formatBytes, formatEta } from '../lib/format.ts';
import type { UploadItem as UploadItemModel } from '../store/uploadStore.ts';
import { FilePreview } from './FilePreview.tsx';
import { StatusBadge } from './StatusBadge.tsx';

const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  invalid_type: 'Invalid type',
  file_too_large: 'Too large',
  network: 'Network',
  rate_limited: 'Rate limit',
  integrity: 'Corrupt',
  auth: 'Auth',
  server: 'Server',
  unknown: 'Error',
};

interface Props {
  item: UploadItemModel;
}

const ACTIVE_STATUSES = new Set(['idle', 'initializing', 'uploading', 'paused']);
const TERMINAL_STATUSES = new Set(['complete', 'failed', 'canceled']);

export function UploadItem({ item }: Props) {
  const { pause, resume, cancel, remove, resumeOrphan } = useUpload();
  const percent = Math.round(item.ratio * 100);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleRepick = (file: File | undefined): void => {
    if (!file) return;
    const ok = resumeOrphan(item.localId, file);
    if (ok) toast.info(`Resuming ${file.name}…`);
  };

  // Speed & ETA — only show while actively uploading with a valid sample.
  const showSpeed = item.status === 'uploading' && item.speedBps !== null && item.speedBps > 0;
  const etaSecs =
    showSpeed && item.speedBps
      ? Math.ceil((item.size - item.uploadedBytes) / item.speedBps)
      : null;

  const barColor =
    item.status === 'failed'   ? 'bg-rose-500' :
    item.status === 'complete' ? 'bg-emerald-500' :
    item.status === 'paused'   ? 'bg-amber-400' : 'bg-violet-500';

  return (
    <li className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition-shadow hover:shadow-md" data-testid="upload-item">
      <div className="flex items-start gap-4">
        <FilePreview item={item} />

        <div className="min-w-0 flex-1">
          {/* Name + badge */}
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-zinc-900" title={item.name}>
              {item.name}
            </p>
            <StatusBadge status={item.status} deduplicated={item.deduplicated} />
          </div>

          {/* Bytes / percent / speed / ETA */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400">
            <span>
              {formatBytes(item.uploadedBytes)}
              <span className="text-zinc-300"> / </span>
              {formatBytes(item.size)}
            </span>
            <span className="text-zinc-300">·</span>
            <span className="tabular-nums">{percent}%</span>
            {showSpeed && item.speedBps !== null && (
              <>
                <span className="text-zinc-300">·</span>
                <span className="text-violet-500">↑ {formatBytes(item.speedBps)}/s</span>
                {etaSecs !== null && etaSecs > 0 && etaSecs < 3600 && (
                  <>
                    <span className="text-zinc-300">·</span>
                    <span>~{formatEta(etaSecs)}</span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Progress bar */}
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Upload progress for ${item.name}`}
          >
            <div
              className={['relative h-full overflow-hidden transition-all duration-300', barColor].join(' ')}
              style={{ width: `${percent}%` }}
            >
              {item.status === 'uploading' && (
                <div className="shimmer absolute inset-0" aria-hidden="true" />
              )}
            </div>
          </div>

          {/* Retry notice */}
          {item.retryInfo && (
            <div
              className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 ring-1 ring-amber-200"
              data-testid="retry-notice"
            >
              <svg
                className="animate-spin shrink-0"
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>
                Network error — retrying chunk
                {' '}(attempt {item.retryInfo.attempt} of {item.retryInfo.total})
              </span>
            </div>
          )}

          {/* Orphan notice */}
          {item.orphaned && item.status === 'paused' && (
            <div
              className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200"
              data-testid="orphan-notice"
            >
              <span className="font-semibold uppercase tracking-wider">Resume</span>
              <span className="flex-1">
                This upload was interrupted. Re-select <b>{item.name}</b> to continue — the server keeps
                what already arrived and the rest skips via dedup.
              </span>
            </div>
          )}

          {/* Error notice */}
          {item.error && item.status === 'failed' && (
            <div
              className="mt-2 flex items-start gap-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700 ring-1 ring-rose-200"
              data-testid="upload-error"
            >
              {item.errorCategory && (
                <span className="font-semibold uppercase tracking-wider">
                  {CATEGORY_LABELS[item.errorCategory]}
                </span>
              )}
              <span className="flex-1">{item.error}</span>
            </div>
          )}

          {/* View link (complete) */}
          {item.url && (
            <a
              href={env.apiUrl + item.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800 hover:underline"
            >
              View file
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 8.5L8.5 3.5M5 3.5h3.5v3.5" />
              </svg>
            </a>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5">
          {item.orphaned && item.status === 'paused' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={item.mimeType.startsWith('video/') ? 'video/*' : 'image/*,video/*'}
                className="hidden"
                onChange={(e) => handleRepick(e.target.files?.[0])}
                data-testid="orphan-file-input"
              />
              <ActionButton
                onClick={() => fileInputRef.current?.click()}
                label="Re-select"
                variant="primary"
              />
            </>
          )}
          {!item.orphaned && ACTIVE_STATUSES.has(item.status) && item.status !== 'paused' && (
            <ActionButton onClick={() => pause(item.localId)} label="Pause" />
          )}
          {!item.orphaned && item.status === 'paused' && (
            <ActionButton onClick={() => resume(item.localId)} label="Resume" variant="primary" />
          )}
          {!item.orphaned && ACTIVE_STATUSES.has(item.status) && (
            <ActionButton onClick={() => void cancel(item.localId)} label="Cancel" variant="danger" />
          )}
          {TERMINAL_STATUSES.has(item.status) && (
            <ActionButton onClick={() => remove(item.localId)} label="Remove" />
          )}
          {item.orphaned && (
            <ActionButton onClick={() => remove(item.localId)} label="Discard" variant="danger" />
          )}
        </div>
      </div>
    </li>
  );
}

function ActionButton({
  onClick, label, variant = 'default',
}: {
  onClick: () => void;
  label: string;
  variant?: 'default' | 'primary' | 'danger';
}) {
  const cls = {
    default: 'bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300',
    primary: 'bg-violet-600 text-white ring-violet-600 hover:bg-violet-700',
    danger:  'bg-white text-rose-500 ring-rose-200 hover:bg-rose-50',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${cls}`}
    >
      {label}
    </button>
  );
}
