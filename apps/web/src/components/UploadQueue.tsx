import { useUploadStore } from '../store/uploadStore.ts';
import { formatBytes } from '../lib/format.ts';
import { UploadItem } from './UploadItem.tsx';

export function UploadQueue() {
  const items = useUploadStore((s) => s.items);

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-500">
          No uploads yet. Drop files above to get started.
        </p>
      </div>
    );
  }

  const totalBytes = items.reduce((sum, i) => sum + i.size, 0);
  const uploadedBytes = items.reduce((sum, i) => sum + i.uploadedBytes, 0);
  const globalRatio = totalBytes === 0 ? 0 : uploadedBytes / totalBytes;
  const completedCount = items.filter((i) => i.status === 'complete').length;
  const activeCount = items.filter(
    (i) => i.status === 'uploading' || i.status === 'initializing' || i.status === 'finalizing'
  ).length;

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">
            Queue · {items.length} {items.length === 1 ? 'file' : 'files'}
          </h2>
          <p className="text-xs text-zinc-500">
            {completedCount} complete · {activeCount} active ·{' '}
            {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
          </p>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100"
          role="progressbar"
          aria-valuenow={Math.round(globalRatio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall upload progress"
        >
          <div
            className="h-full bg-violet-500 transition-all duration-200"
            style={{ width: `${Math.round(globalRatio * 100)}%` }}
          />
        </div>
      </div>

      <ul className="space-y-3" data-testid="upload-queue">
        {items.map((item) => (
          <UploadItem key={item.localId} item={item} />
        ))}
      </ul>
    </section>
  );
}
