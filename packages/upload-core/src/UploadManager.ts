import { HttpAdapter, HttpError } from './adapters/HttpAdapter.js';
import { Md5Hasher } from './md5.js';
import { retryWithBackoff, RetryAbortError } from './retry.js';
import { Semaphore } from './Semaphore.js';
import type {
  FileSource,
  FinalizeResponse,
  InitResponse,
  UploadConfig,
  UploadEvent,
  UploadEventListener,
  UploadHandle,
  UploadProgress,
  UploadStatus,
} from './types.js';

const DEFAULTS = {
  chunkSize: 1024 * 1024,    // 1 MiB
  concurrency: 3,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  retryJitterMs: 250,
} as const;

interface ChunkState {
  index: number;
  start: number;
  end: number;
  /** Set when the server has acknowledged this chunk. */
  done: boolean;
}

export class UploadManager {
  constructor(
    private readonly adapter: HttpAdapter,
    private readonly config: UploadConfig
  ) {}

  upload(source: FileSource): UploadHandle {
    return new UploadJob(this.adapter, this.config, source);
  }
}

class UploadJob implements UploadHandle {
  uploadId: string | null = null;
  status: UploadStatus = 'idle';

  private readonly chunkSize: number;
  private readonly concurrency: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryJitterMs: number;

  private readonly chunks: ChunkState[];
  private readonly totalBytes: number;
  private uploadedBytes = 0;

  private readonly cancelController = new AbortController();
  private readonly chunkControllers = new Map<number, AbortController>();
  private semaphore: Semaphore;
  private readonly listeners = new Set<UploadEventListener>();
  private readonly donePromise: Promise<FinalizeResponse>;
  private resolveDone!: (r: FinalizeResponse) => void;
  private rejectDone!: (e: Error) => void;

  private fullMd5: string | null = null;

  constructor(
    private readonly adapter: HttpAdapter,
    private readonly config: UploadConfig,
    private readonly source: FileSource
  ) {
    this.chunkSize = config.chunkSize ?? DEFAULTS.chunkSize;
    this.concurrency = config.concurrency ?? DEFAULTS.concurrency;
    this.maxRetries = config.maxRetries ?? DEFAULTS.maxRetries;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? DEFAULTS.retryBaseDelayMs;
    this.retryJitterMs = config.retryJitterMs ?? DEFAULTS.retryJitterMs;

    this.totalBytes = source.size;
    this.chunks = this.buildChunks(source.size, this.chunkSize);
    this.semaphore = new Semaphore(this.concurrency);

    this.donePromise = new Promise<FinalizeResponse>((resolve, reject) => {
      this.resolveDone = resolve;
      this.rejectDone = reject;
    });
    // Prevent unhandled-rejection warnings when the consumer never awaits.
    this.donePromise.catch(() => undefined);

    // Kick off asynchronously so the consumer can attach listeners first.
    queueMicrotask(() => {
      void this.run();
    });
  }

  on(listener: UploadEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  pause(): void {
    if (this.status === 'uploading') {
      this.semaphore.pause();
      this.setStatus('paused');
      // Abort in-flight chunks so they get retried after resume.
      for (const c of this.chunkControllers.values()) c.abort();
      this.chunkControllers.clear();
    }
  }

  resume(): void {
    if (this.status === 'paused') {
      this.semaphore.resume();
      this.setStatus('uploading');
    }
  }

  async cancel(): Promise<void> {
    if (this.status === 'complete' || this.status === 'canceled') return;
    this.cancelController.abort();
    for (const c of this.chunkControllers.values()) c.abort();
    this.chunkControllers.clear();
    this.semaphore.resume(); // unblock any acquirers so they bail out
    this.setStatus('canceled');
    const err = new Error('Upload canceled');
    this.emit({ type: 'error', error: err });
    this.rejectDone(err);
  }

  done(): Promise<FinalizeResponse> {
    return this.donePromise;
  }

  // ───────────────────────────── internals ─────────────────────────────

  private async run(): Promise<void> {
    try {
      this.setStatus('initializing');
      const init = await this.initSession();
      this.uploadId = init.uploadId;

      // If the server reported chunks already on disk, mark them done.
      for (const idx of init.existingChunks) {
        const c = this.chunks[idx];
        if (c) {
          c.done = true;
          this.uploadedBytes += c.end - c.start;
        }
      }

      this.setStatus('uploading');
      this.emitProgress();

      await this.uploadAllChunks();

      if (this.cancelController.signal.aborted) return;

      this.setStatus('finalizing');
      const md5 = this.fullMd5 ?? (await this.computeMd5());
      const result = await this.finalize(md5);
      this.setStatus('complete');
      this.emit({ type: 'complete', result });
      this.resolveDone(result);
    } catch (err) {
      if (this.status === 'canceled') return; // already handled
      const error = err instanceof Error ? err : new Error(String(err));
      this.setStatus('failed');
      this.emit({ type: 'error', error });
      this.rejectDone(error);
    }
  }

  private async initSession(): Promise<InitResponse> {
    const body = JSON.stringify({
      filename: this.source.name,
      size: this.source.size,
      mimeType: this.source.mimeType,
      totalChunks: this.chunks.length,
    });
    const res = await this.adapter.request({
      url: `${this.config.baseUrl}/api/uploads/init`,
      method: 'POST',
      headers: this.jsonHeaders(),
      body,
      signal: this.cancelController.signal,
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new HttpError(res.status, res.json, `init failed: ${res.status}`);
    }
    return res.json as InitResponse;
  }

  private async uploadAllChunks(): Promise<void> {
    const pending = this.chunks.filter((c) => !c.done);
    const tasks = pending.map((chunk) => this.uploadOne(chunk));
    await Promise.all(tasks);
  }

  private async uploadOne(chunk: ChunkState): Promise<void> {
    while (!chunk.done) {
      // Wait for an open slot (also blocks while paused).
      await this.semaphore.acquire();
      if (this.cancelController.signal.aborted) {
        this.semaphore.release();
        throw new RetryAbortError();
      }
      // Status might have flipped to paused between acquire returning and now.
      if (this.semaphore.isPaused) {
        this.semaphore.release();
        continue;
      }

      try {
        await retryWithBackoff(
          async (attempt) => {
            const controller = new AbortController();
            this.chunkControllers.set(chunk.index, controller);
            // Compose with the master cancel signal.
            const onMasterAbort = (): void => controller.abort();
            this.cancelController.signal.addEventListener('abort', onMasterAbort, { once: true });
            try {
              const data = await this.source.slice(chunk.start, chunk.end);
              await this.putChunk(chunk, data, controller.signal);
              chunk.done = true;
              this.uploadedBytes += chunk.end - chunk.start;
              this.emit({ type: 'chunkComplete', index: chunk.index });
              this.emitProgress();
            } catch (err) {
              this.emit({
                type: 'chunkError',
                index: chunk.index,
                error: err instanceof Error ? err : new Error(String(err)),
                attempt,
              });
              throw err;
            } finally {
              this.cancelController.signal.removeEventListener('abort', onMasterAbort);
              this.chunkControllers.delete(chunk.index);
            }
          },
          {
            maxAttempts: this.maxRetries,
            baseDelayMs: this.retryBaseDelayMs,
            jitterMs: this.retryJitterMs,
            signal: this.cancelController.signal,
          }
        );
        break; // success — exit the while loop
      } catch (err) {
        // If we were paused mid-upload, the inner abort throws — go back and wait.
        if (this.status === 'paused') {
          continue;
        }
        throw err;
      } finally {
        this.semaphore.release();
      }
    }
  }

  private async putChunk(chunk: ChunkState, data: ArrayBuffer, signal: AbortSignal): Promise<void> {
    if (!this.uploadId) throw new Error('uploadId not set');
    const res = await this.adapter.request({
      url: `${this.config.baseUrl}/api/uploads/${this.uploadId}/chunks/${chunk.index}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-User-Id': this.config.userId,
      },
      body: data,
      signal,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new HttpError(res.status, res.json, `chunk ${chunk.index} failed: ${res.status}`);
    }
  }

  private async computeMd5(): Promise<string> {
    const hasher = new Md5Hasher();
    for (const chunk of this.chunks) {
      const data = await this.source.slice(chunk.start, chunk.end);
      hasher.update(new Uint8Array(data));
    }
    return hasher.digest();
  }

  private async finalize(md5: string): Promise<FinalizeResponse> {
    if (!this.uploadId) throw new Error('uploadId not set');
    const res = await this.adapter.request({
      url: `${this.config.baseUrl}/api/uploads/${this.uploadId}/finalize`,
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ md5 }),
      signal: this.cancelController.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new HttpError(res.status, res.json, `finalize failed: ${res.status}`);
    }
    return res.json as FinalizeResponse;
  }

  private buildChunks(size: number, chunkSize: number): ChunkState[] {
    const list: ChunkState[] = [];
    let index = 0;
    for (let start = 0; start < size; start += chunkSize) {
      list.push({
        index: index++,
        start,
        end: Math.min(start + chunkSize, size),
        done: false,
      });
    }
    if (list.length === 0) {
      // 0-byte file edge case — represent as a single empty chunk.
      list.push({ index: 0, start: 0, end: 0, done: false });
    }
    return list;
  }

  private jsonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-User-Id': this.config.userId,
    };
  }

  private setStatus(status: UploadStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit({ type: 'statusChange', status });
  }

  private emit(event: UploadEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // Listener errors should not break the upload pipeline.
      }
    }
  }

  private emitProgress(): void {
    const total = this.totalBytes;
    const progress: UploadProgress = {
      uploadedBytes: this.uploadedBytes,
      totalBytes: total,
      uploadedChunks: this.chunks.filter((c) => c.done).length,
      totalChunks: this.chunks.length,
      ratio: total === 0 ? 1 : Math.min(1, this.uploadedBytes / total),
    };
    this.emit({ type: 'progress', progress });
  }
}
