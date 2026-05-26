import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonitoringPanel } from '../src/components/MonitoringPanel';
import type { AdminStats } from '../src/hooks/useAdminStats';
import type { UploadsPage } from '../src/hooks/useAdminUploads';

const STATS: AdminStats = {
  queue: {
    active: 3,
    completedToday: 7,
    failedToday: 2,
    successRateToday: 0.778,
    totalStorageBytes: 10_485_760,
  },
  system: {
    memoryUsedBytes: 2_000_000,
    memoryPeakBytes: 4_000_000,
    diskFreeBytes: 50_000_000_000,
    diskTotalBytes: 200_000_000_000,
    loadAvg: [0.5, 0.7, 0.8],
  },
  generatedAt: '2026-05-25T12:00:00+00:00',
};

const STATS_NO_LOAD: AdminStats = { ...STATS, system: { ...STATS.system, loadAvg: null } };

const STATS_ZERO_FAILED: AdminStats = {
  ...STATS,
  queue: { ...STATS.queue, failedToday: 0 },
};

const UPLOADS_PAGE: UploadsPage = {
  total: 2,
  page: 1,
  limit: 20,
  uploads: [
    {
      id: 'u1',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 2048,
      status: 'complete',
      userId: 'web-demo-user',
      totalChunks: 1,
      receivedChunks: 1,
      createdAt: '2026-05-25T10:00:00+00:00',
      finalizedAt: '2026-05-25T10:00:05+00:00',
    },
    {
      id: 'u2',
      filename: 'video.mp4',
      mimeType: 'video/mp4',
      size: 4096,
      status: 'pending',
      userId: 'web-demo-user',
      totalChunks: 4,
      receivedChunks: 2,
      createdAt: '2026-05-25T11:00:00+00:00',
      finalizedAt: null,
    },
  ],
};

function jsonOk<T>(body: T): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function routeFetch(stats: AdminStats | null, uploads: UploadsPage | null) {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/admin/stats')) {
      return stats ? Promise.resolve(jsonOk(stats)) : Promise.reject(new Error('boom'));
    }
    if (url.includes('/api/admin/uploads')) {
      return uploads ? Promise.resolve(jsonOk(uploads)) : Promise.reject(new Error('boom'));
    }
    return Promise.reject(new Error(`unrouted ${url}`));
  });
}

describe('<MonitoringPanel />', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', routeFetch(STATS, UPLOADS_PAGE));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the collapsed header and does not fetch until opened', () => {
    const fetchMock = vi.mocked(fetch);
    render(<MonitoringPanel />);
    expect(screen.getByText(/server monitor/i)).toBeInTheDocument();
    // Stat tiles should not be visible while collapsed.
    expect(screen.queryByText(/active/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('expands on click and renders stat tiles + system metrics after fetch', async () => {
    render(<MonitoringPanel />);
    fireEvent.click(screen.getByText(/server monitor/i));

    expect(screen.getByLabelText(/live/i)).toBeInTheDocument();

    // Wait for the stats to land
    await waitFor(() => expect(screen.getByText(/active/i)).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument(); // active
    expect(screen.getByText('7')).toBeInTheDocument(); // completed today
    expect(screen.getByText('2')).toBeInTheDocument(); // failed today
    expect(screen.getByText(/77\.8%/)).toBeInTheDocument(); // success rate
    expect(screen.getByText(/Memory/)).toBeInTheDocument();
    expect(screen.getByText(/Disk/)).toBeInTheDocument();
    expect(screen.getByText(/0\.5 \/ 0\.7 \/ 0\.8/)).toBeInTheDocument();
  });

  it('shows "n/a" for load avg when the server returns null (Windows case)', async () => {
    vi.stubGlobal('fetch', routeFetch(STATS_NO_LOAD, UPLOADS_PAGE));
    render(<MonitoringPanel />);
    fireEvent.click(screen.getByText(/server monitor/i));
    await waitFor(() => expect(screen.getByText('n/a')).toBeInTheDocument());
  });

  it('uses the zinc styling when failed today is zero', async () => {
    vi.stubGlobal('fetch', routeFetch(STATS_ZERO_FAILED, UPLOADS_PAGE));
    render(<MonitoringPanel />);
    fireEvent.click(screen.getByText(/server monitor/i));
    await waitFor(() => expect(screen.getByText(/Active/i)).toBeInTheDocument());
    // The "Failed today" tile value is "0" — find it and check it carries the zinc class.
    const failedTile = screen
      .getAllByText('0')
      .find((el) => el.previousSibling?.textContent === 'Failed today');
    expect(failedTile?.className).toMatch(/text-zinc-500/);
  });

  it('shows the amber error banner when stats fetch fails', async () => {
    vi.stubGlobal('fetch', routeFetch(null, UPLOADS_PAGE));
    render(<MonitoringPanel />);
    fireEvent.click(screen.getByText(/server monitor/i));
    await waitFor(() =>
      expect(screen.getByText(/could not reach server/i)).toBeInTheDocument()
    );
  });

  it('toggles the Recent uploads sub-section and renders rows on expand', async () => {
    render(<MonitoringPanel />);
    fireEvent.click(screen.getByText(/server monitor/i));
    await waitFor(() => expect(screen.getByText(/recent uploads/i)).toBeInTheDocument());

    // Sub-section is closed by default — no rows yet.
    expect(screen.queryByText('photo.jpg')).toBeNull();

    fireEvent.click(screen.getByText(/recent uploads/i));

    await waitFor(() => expect(screen.getByText('photo.jpg')).toBeInTheDocument());
    expect(screen.getByText('video.mp4')).toBeInTheDocument();
    // Status badges should appear (RemoteStatusBadge text — exact strings to
    // avoid matching the "Completed today" stat tile label).
    expect(screen.getByText('complete')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    // Table summary line
    expect(screen.getByText(/2 total/)).toBeInTheDocument();
  });

  it('shows the error message in the uploads sub-section when its fetch fails', async () => {
    vi.stubGlobal('fetch', routeFetch(STATS, null));
    render(<MonitoringPanel />);
    fireEvent.click(screen.getByText(/server monitor/i));
    await waitFor(() => expect(screen.getByText(/recent uploads/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/recent uploads/i));
    await waitFor(() => expect(screen.getByText(/^Error:/)).toBeInTheDocument());
  });

  it('collapses again when the header is clicked twice', async () => {
    render(<MonitoringPanel />);
    const header = screen.getByText(/server monitor/i);
    fireEvent.click(header);
    await waitFor(() => expect(screen.getByLabelText(/live/i)).toBeInTheDocument());
    fireEvent.click(header);
    expect(screen.queryByLabelText(/live/i)).toBeNull();
  });
});
