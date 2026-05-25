import { FetchAdapter, UploadManager } from '@repo/upload-core';
import { env } from '../env.ts';

/**
 * Process-wide singleton. Created lazily so tests can inject their own.
 */
let cached: UploadManager | null = null;

export function getUploadManager(): UploadManager {
  if (cached) return cached;
  cached = new UploadManager(new FetchAdapter(), {
    baseUrl: env.apiUrl,
    userId: env.userId,
    chunkSize: env.chunkSize,
    concurrency: env.concurrency,
    maxRetries: env.maxRetries,
  });
  return cached;
}

/** Test hook — replace the singleton with a custom instance. */
export function __setUploadManagerForTests(mgr: UploadManager | null): void {
  cached = mgr;
}
