import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminUploads, type UploadsPage } from '../src/hooks/useAdminUploads';

const PAGE: UploadsPage = {
  total: 1,
  page: 1,
  limit: 20,
  uploads: [
    {
      id: 'u1',
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      status: 'complete',
      userId: 'user-1',
      totalChunks: 1,
      receivedChunks: 1,
      createdAt: '2026-05-25T10:00:00+00:00',
      finalizedAt: '2026-05-25T10:00:05+00:00',
    },
  ],
};

function jsonOk<T>(body: T): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useAdminUploads', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch when disabled', () => {
    const fetchMock = vi.mocked(fetch);
    const { result } = renderHook(() => useAdminUploads(1, false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches page on enable and reports loading then data', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(jsonOk(PAGE));
    const { result } = renderHook(() => useAdminUploads(1, true));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data).toEqual(PAGE);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/admin\/uploads\?page=1&limit=20$/);
  });

  it('re-fetches when page changes', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(jsonOk(PAGE));
    const { rerender } = renderHook(({ page }) => useAdminUploads(page, true), {
      initialProps: { page: 1 },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ page: 2 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(String(fetchMock.mock.calls[1]![0])).toMatch(/page=2/);
  });

  it('sets error string on non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 503 }));
    const { result } = renderHook(() => useAdminUploads(1, true));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/503/);
    expect(result.current.loading).toBe(false);
  });

  it('sets error string when fetch rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAdminUploads(1, true));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/offline/);
  });
});
