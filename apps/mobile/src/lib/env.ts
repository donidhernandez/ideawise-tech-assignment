/**
 * Centralized read of runtime configuration. EXPO_PUBLIC_* env vars are
 * inlined at build time by Expo / Metro and are safe to expose to the
 * client bundle.
 *
 * IMPORTANT: do NOT use `localhost` on a real device — the device cannot
 * route there. Use your machine's LAN IP (e.g. http://192.168.1.42:8000).
 */
export const env = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
  userId: process.env.EXPO_PUBLIC_USER_ID ?? 'mobile-demo-user',
  chunkSize: Number(process.env.EXPO_PUBLIC_CHUNK_SIZE ?? 1024 * 1024),
  concurrency: Number(process.env.EXPO_PUBLIC_CONCURRENCY ?? 3),
  maxRetries: Number(process.env.EXPO_PUBLIC_MAX_RETRIES ?? 3),
};
