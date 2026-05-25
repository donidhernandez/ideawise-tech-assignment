import type { HttpAdapter, HttpRequest, HttpResponse } from '../../src/adapters/HttpAdapter.js';

interface ChunkRecord {
  index: number;
  size: number;
  body: Uint8Array;
  timestamp: number;
}

export interface MockAdapterOptions {
  /** Force the Nth PUT chunks/i call to fail with this status (one-shot per index). */
  failChunkOnce?: Map<number, number>;
  /** Delay (ms) applied to chunk PUT requests, to observe concurrency. */
  chunkLatencyMs?: number;
}

/**
 * Minimal in-memory mock of the backend API. Tracks chunks per uploadId.
 */
export class MockAdapter implements HttpAdapter {
  uploads = new Map<string, { totalChunks: number; chunks: Map<number, ChunkRecord> }>();
  /** History of every request made — useful for ordering assertions. */
  history: Array<{ method: string; path: string; ts: number }> = [];

  private uploadCounter = 0;
  private chunkFailCounts = new Map<string, number>(); // key = uploadId/index

  constructor(private readonly options: MockAdapterOptions = {}) {}

  async request(req: HttpRequest): Promise<HttpResponse> {
    const url = new URL(req.url);
    const path = url.pathname;
    this.history.push({ method: req.method, path, ts: Date.now() });

    if (req.method === 'POST' && path === '/api/uploads/init') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : {};
      const id = `mock-${++this.uploadCounter}`;
      this.uploads.set(id, { totalChunks: body.totalChunks, chunks: new Map() });
      return this.json(201, { uploadId: id, existingChunks: [], chunkSize: body.chunkSize ?? 1048576 });
    }

    const chunkMatch = path.match(/^\/api\/uploads\/([^/]+)\/chunks\/(\d+)$/);
    if (chunkMatch && req.method === 'PUT') {
      const [, uploadId, idxStr] = chunkMatch as unknown as [string, string, string];
      const index = parseInt(idxStr, 10);
      const upload = this.uploads.get(uploadId);
      if (!upload) return this.json(404, { error: 'upload_not_found' });

      const failKey = `${uploadId}/${index}`;
      const failures = this.options.failChunkOnce?.get(index) ?? 0;
      const used = this.chunkFailCounts.get(failKey) ?? 0;
      if (used < failures) {
        this.chunkFailCounts.set(failKey, used + 1);
        return this.json(503, { error: 'service_unavailable' });
      }

      if (this.options.chunkLatencyMs) {
        await new Promise((r) => setTimeout(r, this.options.chunkLatencyMs));
      }

      const body = req.body instanceof ArrayBuffer ? new Uint8Array(req.body) : new Uint8Array(0);
      upload.chunks.set(index, { index, size: body.length, body, timestamp: Date.now() });
      return this.json(200, {
        received: true,
        index,
        receivedChunks: upload.chunks.size,
        totalChunks: upload.totalChunks,
      });
    }

    const finalizeMatch = path.match(/^\/api\/uploads\/([^/]+)\/finalize$/);
    if (finalizeMatch && req.method === 'POST') {
      const [, uploadId] = finalizeMatch as unknown as [string, string];
      const upload = this.uploads.get(uploadId);
      if (!upload) return this.json(404, { error: 'upload_not_found' });
      if (upload.chunks.size !== upload.totalChunks) {
        return this.json(409, { error: 'missing_chunks' });
      }
      return this.json(200, {
        fileId: uploadId,
        url: `/uploads/mock/${uploadId}.bin`,
        deduplicated: false,
      });
    }

    return this.json(404, { error: 'not_found' });
  }

  /** Helper: count chunks received for a given uploadId. */
  chunkCount(uploadId: string): number {
    return this.uploads.get(uploadId)?.chunks.size ?? 0;
  }

  /** Helper: returns concatenated body of all chunks in index order. */
  reassemble(uploadId: string): Uint8Array {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error('unknown upload');
    const total = Array.from(upload.chunks.values()).reduce((s, c) => s + c.size, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (let i = 0; i < upload.totalChunks; i++) {
      const c = upload.chunks.get(i);
      if (!c) throw new Error(`missing chunk ${i}`);
      out.set(c.body, cursor);
      cursor += c.size;
    }
    return out;
  }

  private json(status: number, body: unknown): HttpResponse {
    return { status, json: body, text: JSON.stringify(body) };
  }
}

/** A synthetic FileSource backed by an in-memory Uint8Array. */
export function makeFileSource(name: string, mimeType: string, data: Uint8Array): {
  name: string;
  size: number;
  mimeType: string;
  slice: (s: number, e: number) => Promise<ArrayBuffer>;
} {
  return {
    name,
    size: data.length,
    mimeType,
    slice: (start, end) => {
      const slice = data.slice(start, end);
      // Create a fresh ArrayBuffer copy to mimic Blob.arrayBuffer() semantics.
      const buf = new ArrayBuffer(slice.length);
      new Uint8Array(buf).set(slice);
      return Promise.resolve(buf);
    },
  };
}
