export type UploadStatus =
  | 'idle'
  | 'initializing'
  | 'uploading'
  | 'paused'
  | 'finalizing'
  | 'complete'
  | 'failed'
  | 'canceled';

export interface UploadConfig {
  baseUrl: string;
  userId: string;
  chunkSize?: number;       // bytes; default 1 MiB
  concurrency?: number;     // parallel chunks; default 3
  maxRetries?: number;      // per chunk; default 3
  retryBaseDelayMs?: number; // default 1000 (1s, 2s, 4s)
  /**
   * Optional jitter range in ms added to each backoff delay
   * to avoid thundering-herd on simultaneous retries.
   */
  retryJitterMs?: number;
}

export interface FileSource {
  /** Human-readable filename */
  name: string;
  /** Total bytes */
  size: number;
  /** Declared MIME type (the server will sniff and verify chunk 0) */
  mimeType: string;
  /** Read a byte range; return ArrayBuffer (or Uint8Array compatible) */
  slice: (start: number, end: number) => Promise<ArrayBuffer>;
}

export interface InitResponse {
  uploadId: string;
  existingChunks: number[];
  chunkSize: number;
}

export interface FinalizeResponse {
  fileId: string;
  url: string;
  deduplicated: boolean;
}

export interface StatusResponse {
  uploadId: string;
  status: 'pending' | 'complete' | 'failed';
  totalChunks: number;
  uploadedChunks: number[];
  url: string | null;
}

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  uploadedChunks: number;
  totalChunks: number;
  /** 0..1 */
  ratio: number;
}

export type UploadEvent =
  | { type: 'statusChange'; status: UploadStatus }
  | { type: 'progress'; progress: UploadProgress }
  | { type: 'chunkComplete'; index: number }
  | { type: 'chunkError'; index: number; error: Error; attempt: number }
  | { type: 'complete'; result: FinalizeResponse }
  | { type: 'error'; error: Error };

export type UploadEventListener = (event: UploadEvent) => void;

/** A live handle returned by UploadManager.upload(...) */
export interface UploadHandle {
  readonly uploadId: string | null;  // populated after init
  readonly status: UploadStatus;
  pause(): void;
  resume(): void;
  cancel(): Promise<void>;
  on(listener: UploadEventListener): () => void;
  /** Resolves when the upload completes (or rejects on failure/cancel). */
  done(): Promise<FinalizeResponse>;
}
