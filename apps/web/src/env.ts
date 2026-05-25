/**
 * Centralized read of runtime configuration. Keeps `import.meta.env` access
 * out of components so they remain trivially testable.
 */
export const env = {
  apiUrl: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
  /** Pseudo user id — real auth is out of MVP scope (ADR-003). */
  userId: import.meta.env.VITE_USER_ID ?? 'web-demo-user',
  chunkSize: Number(import.meta.env.VITE_CHUNK_SIZE ?? 1024 * 1024),
  concurrency: Number(import.meta.env.VITE_CONCURRENCY ?? 3),
  maxRetries: Number(import.meta.env.VITE_MAX_RETRIES ?? 3),
};
