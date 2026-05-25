import { useUploadStore } from '../store/uploadStore.ts';
import { formatBytes, formatRelativeTime } from '../lib/format.ts';
import { env } from '../env.ts';

export function HistoryPanel() {
  const history = useUploadStore((s) => s.history);
  const clear = useUploadStore((s) => s.clearHistory);

  if (history.length === 0) {
    return (
      <div className="rounded-xl bg-white p-6 ring-1 ring-zinc-200">
        <h2 className="text-sm font-semibold text-zinc-900">History</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Past uploads will appear here. Stored locally — clears when you do.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-zinc-200">
      <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          History · {history.length}
        </h2>
        <button
          type="button"
          onClick={clear}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Clear
        </button>
      </header>
      <ul className="divide-y divide-zinc-100">
        {history.map((h) => (
          <li key={h.localId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <a
                href={env.apiUrl + h.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm font-medium text-zinc-900 hover:text-violet-700"
                title={h.name}
              >
                {h.name}
              </a>
              <p className="mt-0.5 text-xs text-zinc-500">
                {formatBytes(h.size)} · {formatRelativeTime(h.uploadedAt)}
                {h.deduplicated && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    deduped
                  </span>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
