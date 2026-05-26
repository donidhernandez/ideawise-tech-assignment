import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminStats, type AdminStats } from '../src/hooks/useAdminStats';

const SAMPLE: AdminStats = {
  queue: {
    active: 2,
    completedToday: 5,
    failedToday: 1,
    successRateToday: 0.83,
    totalStorageBytes: 1024,
  },
  system: {
    memoryUsedBytes: 100,
    memoryPeakBytes: 200,
    diskFreeBytes: 500,
    diskTotalBytes: 1000,
    loadAvg: [0.1, 0.2, 0.3],
  },
  generatedAt: '2026-05-25T12:00:00+00:00',
};

function jsonOk<T>(body: T): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useAdminStats', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns null fields when disabled and never calls fetch', () => {
    const fetchMock = vi.mocked(fetch);
    const { result } = renderHook(() => useAdminStats(false));
    expect(result.current.stats).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches once on enable, sets stats and lastUpdated, sends X-User-Id header', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(jsonOk(SAMPLE));

    const { result } = renderHook(() => useAdminStats(true));
    await waitFor(() => expect(result.current.stats).not.toBeNull());

    expect(result.current.stats).toEqual(SAMPLE);
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated).toBeInstanceOf(Date);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/admin\/stats$/);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-User-Id']).toBeTypeOf('string');
  });

  it('sets error string when response is not OK and keeps stats null on first failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500 }));
    const { result } = renderHook(() => useAdminStats(true));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/500/);
    expect(result.current.stats).toBeNull();
  });

  it('sets error on thrown network failure but preserves last good stats', async () => {
    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce(jsonOk(SAMPLE))
      .mockRejectedValueOnce(new Error('Network is down'));

    vi.useFakeTimers();
    const { result } = renderHook(() => useAdminStats(true));

    // First fetch resolves
    await vi.waitFor(() => expect(result.current.stats).not.toBeNull());

    // Advance to second poll (5s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toMatch(/Network is down/);
    // last good value is preserved
    expect(result.current.stats).toEqual(SAMPLE);
  });

  it('resets to nulls when enabled flips back to false', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(SAMPLE));
    const { result, rerender } = renderHook(({ on }) => useAdminStats(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current.stats).not.toBeNull());

    rerender({ on: false });

    expect(result.current.stats).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
  });

  it('polls every 5 seconds while enabled', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(jsonOk(SAMPLE));
    vi.useFakeTimers();
    renderHook(() => useAdminStats(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // flush initial
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('aborts in-flight requests on unmount (no error leaks)', async () => {
    vi.mocked(fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    const { result, unmount } = renderHook(() => useAdminStats(true));
    unmount();
    // Allow any pending microtasks to drain
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.error).toBeNull();
  });
});
