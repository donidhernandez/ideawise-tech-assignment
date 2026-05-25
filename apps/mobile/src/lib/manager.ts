import { UploadManager } from '@repo/upload-core';
import { env } from './env';
import { ExpoUploadAdapter } from './expoUploadAdapter';

let cached: UploadManager | null = null;

export function getUploadManager(): UploadManager {
  if (cached) return cached;
  cached = new UploadManager(new ExpoUploadAdapter(), {
    baseUrl: env.apiUrl,
    userId: env.userId,
    chunkSize: env.chunkSize,
    concurrency: env.concurrency,
    maxRetries: env.maxRetries,
  });
  return cached;
}
