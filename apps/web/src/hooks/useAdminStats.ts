import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '../env.ts';

interface QueueStats {
  active: number;
  completedToday: number;
  failedToday: number;
  successRateToday: number;
  totalStorageBytes: number;
}

interface SystemStats {
  memoryUsedBytes: number;
  memoryPeakBytes: number;
  diskFreeBytes: number;
  diskTotalBytes: number;
  loadAvg: [number, number, number] | null;
}

export interface AdminStats {
  queue: QueueStats;
  system: SystemStats;
  generatedAt: string;
}

export function useAdminStats(enabled: boolean): {
  stats: AdminStats | null;
  error: string | null;
  lastUpdated: Date | null;
} {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Keep the latest stats ref so we can keep showing stale data on error.
  const latestStatsRef = useRef<AdminStats | null>(null);

  const fetchStats = useCallback(async (signal: AbortSignal): Promise<void> => {
    try {
      const res = await fetch(`${env.apiUrl}/api/admin/stats`, {
        signal,
        headers: { 'X-User-Id': env.userId },
      });

      if (!res.ok) {
        setError(`Server returned ${res.status}`);
        return;
      }

      const data = (await res.json()) as AdminStats;
      latestStatsRef.current = data;
      setStats(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Keep last good value — don't null out stats.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    // Fetch immediately, then every 5 s.
    void fetchStats(controller.signal);
    const id = setInterval(() => {
      void fetchStats(controller.signal);
    }, 5_000);

    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [enabled, fetchStats]);

  // When disabled, reset to nulls.
  useEffect(() => {
    if (!enabled) {
      setStats(null);
      setError(null);
      setLastUpdated(null);
      latestStatsRef.current = null;
    }
  }, [enabled]);

  return { stats, error, lastUpdated };
}
