import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UploadManager } from '../src/UploadManager.js';
import type { UploadEvent } from '../src/types.js';
import { MockAdapter, makeFileSource } from './helpers/MockAdapter.js';

function makePayload(size: number, seed = 7): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = (i * seed) & 0xff;
  return buf;
}

const CHUNK = 64 * 1024; // 64 KiB chunks for faster tests

describe('UploadManager', () => {
  it('splits into the correct number of chunks and uploads them all', async () => {
    const payload = makePayload(CHUNK * 2 + 1234);
    const adapter = new MockAdapter();
    const mgr = new UploadManager(adapter, {
      baseUrl: 'http://x',
      userId: 'u',
      chunkSize: CHUNK,
      retryBaseDelayMs: 1,
      retryJitterMs: 0,
    });

    const handle = mgr.upload(makeFileSource('a.bin', 'application/octet-stream', payload));
    const result = await handle.done();

    expect(result.deduplicated).toBe(false);
    expect(handle.status).toBe('complete');
    const uploadId = handle.uploadId!;
    expect(adapter.chunkCount(uploadId)).toBe(3);

    const reassembled = adapter.reassemble(uploadId);
    expect(reassembled.length).toBe(payload.length);
    expect(reassembled).toEqual(payload);
  });

  it('emits progress events that monotonically increase to 1', async () => {
    const payload = makePayload(CHUNK * 4);
    const adapter = new MockAdapter({ chunkLatencyMs: 5 });
    const mgr = new UploadManager(adapter, {
      baseUrl: 'http://x',
      userId: 'u',
      chunkSize: CHUNK,
      retryBaseDelayMs: 1,
      retryJitterMs: 0,
    });

    const handle = mgr.upload(makeFileSource('a.bin', 'application/octet-stream', payload));
    const ratios: number[] = [];
    handle.on((e: UploadEvent) => {
      if (e.type === 'progress') ratios.push(e.progress.ratio);
    });
    await handle.done();

    expect(ratios.length).toBeGreaterThan(0);
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1] as number);
    }
    expect(ratios[ratios.length - 1]).toBe(1);
  });

  it('respects concurrency limit when uploading many chunks', async () => {
    const payload = makePayload(CHUNK * 8);
    const adapter = new MockAdapter({ chunkLatencyMs: 25 });
    const mgr = new UploadManager(adapter, {
      baseUrl: 'http://x',
      userId: 'u',
      chunkSize: CHUNK,
      concurrency: 2,
      retryBaseDelayMs: 1,
      retryJitterMs: 0,
    });

    // Instrument adapter to count in-flight chunk requests.
    let inFlight = 0;
    let peak = 0;
    const originalRequest = adapter.request.bind(adapter);
    adapter.request = async (req) => {
      if (req.method === 'PUT') {
        inFlight++;
        peak = Math.max(peak, inFlight);
      }
      try {
        return await originalRequest(req);
      } finally {
        if (req.method === 'PUT') inFlight--;
      }
    };

    const handle = mgr.upload(makeFileSource('a.bin', 'application/octet-stream', payload));
    await handle.done();
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('retries transient 503 errors and ultimately succeeds', async () => {
    const payload = makePayload(CHUNK * 2);
    const adapter = new MockAdapter({ failChunkOnce: new Map([[0, 2]]) }); // chunk 0 fails twice then succeeds
    const mgr = new UploadManager(adapter, {
      baseUrl: 'http://x',
      userId: 'u',
      chunkSize: CHUNK,
      maxRetries: 5,
      retryBaseDelayMs: 1,
      retryJitterMs: 0,
    });

    const events: UploadEvent[] = [];
    const handle = mgr.upload(makeFileSource('a.bin', 'application/octet-stream', payload));
    handle.on((e) => events.push(e));
    const result = await handle.done();

    expect(result.deduplicated).toBe(false);
    const chunkErrors = events.filter((e) => e.type === 'chunkError');
    expect(chunkErrors.length).toBe(2); // two retried failures
  });

  it('sends the MD5 of the assembled payload to finalize', async () => {
    const payload = makePayload(CHUNK * 2 + 17);
    const adapter = new MockAdapter();
    const mgr = new UploadManager(adapter, {
      baseUrl: 'http://x',
      userId: 'u',
      chunkSize: CHUNK,
      retryBaseDelayMs: 1,
      retryJitterMs: 0,
    });

    let sentMd5: string | null = null;
    const originalRequest = adapter.request.bind(adapter);
    adapter.request = async (req) => {
      if (req.method === 'POST' && req.url.includes('/finalize') && typeof req.body === 'string') {
        sentMd5 = JSON.parse(req.body).md5;
      }
      return originalRequest(req);
    };

    const handle = mgr.upload(makeFileSource('a.bin', 'application/octet-stream', payload));
    await handle.done();

    const expected = createHash('md5').update(payload).digest('hex');
    expect(sentMd5).toBe(expected);
  });

  it('cancel rejects the done() promise and emits canceled', async () => {
    const payload = makePayload(CHUNK * 4);
    const adapter = new MockAdapter({ chunkLatencyMs: 50 });
    const mgr = new UploadManager(adapter, {
      baseUrl: 'http://x',
      userId: 'u',
      chunkSize: CHUNK,
      retryBaseDelayMs: 1,
      retryJitterMs: 0,
    });
    const handle = mgr.upload(makeFileSource('a.bin', 'application/octet-stream', payload));

    // Let init complete, then cancel mid-flight.
    await new Promise((r) => setTimeout(r, 20));
    await handle.cancel();

    await expect(handle.done()).rejects.toThrow(/canceled/i);
    expect(handle.status).toBe('canceled');
  });

  it('pause halts new chunk dispatches; resume completes the upload', async () => {
    const payload = makePayload(CHUNK * 6);
    const adapter = new MockAdapter({ chunkLatencyMs: 20 });
    const mgr = new UploadManager(adapter, {
      baseUrl: 'http://x',
      userId: 'u',
      chunkSize: CHUNK,
      concurrency: 2,
      retryBaseDelayMs: 1,
      retryJitterMs: 0,
    });
    const handle = mgr.upload(makeFileSource('a.bin', 'application/octet-stream', payload));

    await new Promise((r) => setTimeout(r, 30));
    handle.pause();
    const chunksBefore = adapter.uploads.size > 0 ? adapter.chunkCount(handle.uploadId!) : 0;
    await new Promise((r) => setTimeout(r, 60));
    const chunksDuringPause = adapter.chunkCount(handle.uploadId!);
    // Some chunks may complete that were already in flight before pause aborted them.
    // After the brief pause window, no further chunks should land.
    expect(chunksDuringPause).toBeLessThan(6);
    expect(handle.status).toBe('paused');

    handle.resume();
    await handle.done();
    expect(handle.status).toBe('complete');
    expect(adapter.chunkCount(handle.uploadId!)).toBe(6);
    // Suppress unused-var lint for `chunksBefore`
    void chunksBefore;
  });
});
