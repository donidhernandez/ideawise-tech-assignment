import type { ErrorCategory } from '@repo/upload-core';
import { useUpload } from '../hooks/useUpload.ts';
import { formatBytes } from '../lib/format.ts';
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

function errorCategoryLabel(c: ErrorCategory): string {
  return CATEGORY_LABELS[c];
}

interface Props {
  item: UploadItemModel;
}

const ACTIVE_STATUSES = new Set(['idle', 'initializing', 'uploading', 'paused']);
const TERMINAL_STATUSES = new Set(['complete', 'failed', 'canceled']);

export function UploadItem({ item }: Props) {
  const { pause, resume, cancel, remove } = useUpload();
  const percent = Math.round(item.ratio * 100);

  return (
    <li className="rounded-xl bg-white p-4 ring-1 ring-zinc-200" data-testid="upload-item">
      <div className="flex items-start gap-4">
        <FilePreview item={item} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium text-zinc-900" title={item.name}>
              {item.name}
            </p>
            <StatusBadge status={item.status} deduplicated={item.deduplicated} />
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
            <span>{formatBytes(item.uploadedBytes)} / {formatBytes(item.size)}</span>
            <span>·</span>
            <span>{percent}%</span>
          </div>

          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Upload progress for ${item.name}`}
          >
            <div
              className={[
                'h-full transition-all duration-200',
                item.status === 'failed' ? 'bg-rose-500' :
                item.status === 'complete' ? 'bg-emerald-500' :
                item.status === 'paused' ? 'bg-amber-500' : 'bg-violet-500',
              ].join(' ')}
              style={{ width: `${percent}%` }}
            />
          </div>

          {item.error && item.status === 'failed' && (
            <div
              className="mt-2 flex items-start gap-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700 ring-1 ring-rose-200"
              data-testid="upload-error"
            >
              {item.errorCategory && (
                <span className="font-semibold uppercase tracking-wider">
                  {errorCategoryLabel(item.errorCategory)}
                </span>
              )}
              <span className="flex-1">{item.error}</span>
            </div>
          )}

          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-medium text-violet-600 hover:underline"
            >
              View uploaded file →
            </a>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          {ACTIVE_STATUSES.has(item.status) && item.status !== 'paused' && (
            <ActionButton onClick={() => pause(item.localId)} label="Pause" />
          )}
          {item.status === 'paused' && (
            <ActionButton onClick={() => resume(item.localId)} label="Resume" variant="primary" />
          )}
          {ACTIVE_STATUSES.has(item.status) && (
            <ActionButton onClick={() => void cancel(item.localId)} label="Cancel" variant="danger" />
          )}
          {TERMINAL_STATUSES.has(item.status) && (
            <ActionButton onClick={() => remove(item.localId)} label="Remove" />
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
    default: 'bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50',
    primary: 'bg-violet-600 text-white ring-violet-600 hover:bg-violet-700',
    danger: 'bg-white text-rose-600 ring-rose-300 hover:bg-rose-50',
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
