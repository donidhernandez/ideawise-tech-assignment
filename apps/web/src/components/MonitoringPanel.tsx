import { useCallback, useEffect, useState } from 'react';
import { useAdminStats } from '../hooks/useAdminStats.ts';
import { useAdminUploads } from '../hooks/useAdminUploads.ts';
import { formatBytes } from '../lib/format.ts';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatSecondsAgo(lastUpdated: Date | null, now: number): string {
  if (!lastUpdated) return '';
  const secs = Math.max(0, Math.floor((now - lastUpdated.getTime()) / 1000));
  return `Updated ${secs}s ago`;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(1, numerator / denominator);
}

// ── sub-components ───────────────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: string;
  colorClass: string;
  bgClass: string;
}

function StatTile({ label, value, colorClass, bgClass }: StatTileProps) {
  return (
    <div className={`rounded-lg p-3 ${bgClass} ring-1 ring-inset ring-black/5`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold leading-tight ${colorClass}`}>{value}</p>
    </div>
  );
}

interface ProgressRowProps {
  label: string;
  detail: string;
  ratio: number;
}

function ProgressRow({ label, detail, ratio }: ProgressRowProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-700">{label}</span>
        <span className="text-xs text-zinc-500 tabular-nums">{detail}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-zinc-100">
        <div
          className="h-1 rounded-full bg-violet-500 transition-all duration-500"
          style={{ width: `${Math.round(ratio * 100)}%` }}
          role="progressbar"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
}

function RemoteStatusBadge({ status }: StatusBadgeProps) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    complete: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
  };
  const cls = map[status] ?? 'bg-zinc-100 text-zinc-500';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

// ── uploads table ─────────────────────────────────────────────────────────────

interface UploadsTableProps {
  panelOpen: boolean;
}

function UploadsTable({ panelOpen }: UploadsTableProps) {
  const [tableOpen, setTableOpen] = useState(false);
  const { data, loading, error } = useAdminUploads(1, panelOpen && tableOpen);

  const toggle = useCallback(() => setTableOpen((v) => !v), []);

  return (
    <div className="border-t border-zinc-100 pt-3">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between text-sm font-semibold text-zinc-900"
      >
        <span>Recent uploads</span>
        <span className="text-zinc-400" aria-hidden="true">
          {tableOpen ? '▲' : '▼'}
        </span>
      </button>

      {tableOpen && (
        <div className="mt-3">
          {loading && (
            <p className="text-xs text-zinc-400">Loading…</p>
          )}
          {error && !loading && (
            <p className="text-xs text-red-600">Error: {error}</p>
          )}
          {data && !loading && (
            <>
              <p className="mb-2 text-[10px] text-zinc-400">
                {data.total} total · showing {data.uploads.length}
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="pb-2 text-left font-medium text-zinc-500">File</th>
                      <th className="pb-2 text-left font-medium text-zinc-500">Type</th>
                      <th className="pb-2 text-right font-medium text-zinc-500">Size</th>
                      <th className="pb-2 text-left font-medium text-zinc-500">Status</th>
                      <th className="pb-2 text-left font-medium text-zinc-500">User</th>
                      <th className="pb-2 text-left font-medium text-zinc-500">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {data.uploads.map((u) => (
                      <tr key={u.id}>
                        <td className="py-1.5 pr-3">
                          <span
                            className="block max-w-[120px] truncate font-medium text-zinc-800"
                            title={u.filename}
                          >
                            {u.filename}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-500">{u.mimeType}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-600">
                          {formatBytes(u.size)}
                        </td>
                        <td className="py-1.5 pr-3">
                          <RemoteStatusBadge status={u.status} />
                        </td>
                        <td className="py-1.5 pr-3">
                          <span
                            className="block max-w-[80px] truncate text-zinc-500"
                            title={u.userId}
                          >
                            {u.userId}
                          </span>
                        </td>
                        <td className="py-1.5 tabular-nums text-zinc-400">
                          {new Date(u.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export function MonitoringPanel() {
  const [open, setOpen] = useState(false);
  const { stats, error, lastUpdated } = useAdminStats(open);

  // 1-second tick for "Updated Xs ago" display.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // ── Collapsed header ──────────────────────────────────────────────────────
  const statusDot =
    error !== null ? (
      <span className="flex items-center gap-1 text-xs text-red-600" aria-label="Connection error">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
        error
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs text-emerald-600" aria-label="Live">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
        live
      </span>
    );

  return (
    <section className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900">
            {open ? '▼' : '▶'} Server Monitor
          </span>
        </div>
        <div className="flex items-center gap-3">
          {open && statusDot}
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3 space-y-4">
          {/* Error banner — shown over stale data when connection is lost */}
          {error !== null && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Could not reach server — retrying…
            </div>
          )}

          {/* Last-updated ticker */}
          {lastUpdated !== null && (
            <p className="text-[10px] text-zinc-400 tabular-nums">
              {formatSecondsAgo(lastUpdated, now)}
            </p>
          )}

          {/* Skeleton while first fetch is in flight */}
          {stats === null && error === null && (
            <p className="text-xs text-zinc-400">Connecting…</p>
          )}

          {/* ── Section A: Queue stats ── */}
          {stats !== null && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Queue
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label="Active"
                  value={String(stats.queue.active)}
                  colorClass="text-violet-700"
                  bgClass="bg-violet-50"
                />
                <StatTile
                  label="Completed today"
                  value={String(stats.queue.completedToday)}
                  colorClass="text-emerald-700"
                  bgClass="bg-emerald-50"
                />
                <StatTile
                  label="Failed today"
                  value={String(stats.queue.failedToday)}
                  colorClass={stats.queue.failedToday > 0 ? 'text-red-700' : 'text-zinc-500'}
                  bgClass={stats.queue.failedToday > 0 ? 'bg-red-50' : 'bg-zinc-50'}
                />
                <StatTile
                  label="Success rate"
                  value={`${(stats.queue.successRateToday * 100).toFixed(1)}%`}
                  colorClass="text-emerald-700"
                  bgClass="bg-emerald-50"
                />
              </div>
            </div>
          )}

          {/* ── Section B: System health ── */}
          {stats !== null && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                System
              </h3>
              <div className="space-y-3">
                <ProgressRow
                  label="Memory"
                  detail={`${formatBytes(stats.system.memoryUsedBytes)} / ${formatBytes(stats.system.memoryPeakBytes)}`}
                  ratio={pct(stats.system.memoryUsedBytes, stats.system.memoryPeakBytes)}
                />
                <ProgressRow
                  label="Disk"
                  detail={`${formatBytes(stats.system.diskFreeBytes)} free of ${formatBytes(stats.system.diskTotalBytes)}`}
                  ratio={pct(
                    stats.system.diskTotalBytes - stats.system.diskFreeBytes,
                    stats.system.diskTotalBytes
                  )}
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-700">Load avg</span>
                  <span className="text-xs text-zinc-500 tabular-nums">
                    {stats.system.loadAvg === null
                      ? 'n/a'
                      : `${stats.system.loadAvg[0]} / ${stats.system.loadAvg[1]} / ${stats.system.loadAvg[2]} (1m/5m/15m)`}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-700">Total storage managed</span>
                  <span className="text-xs text-zinc-500 tabular-nums">
                    {formatBytes(stats.queue.totalStorageBytes)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Section C: Recent uploads table ── */}
          <UploadsTable panelOpen={open} />
        </div>
      )}
    </section>
  );
}
