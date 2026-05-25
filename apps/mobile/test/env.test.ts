/**
 * env.ts is read at import time. We exercise the module by re-importing it
 * under controlled process.env values to cover the `?? default` fallback
 * paths.
 */

describe('env', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
  });

  it('exposes the documented shape with defaults when EXPO_PUBLIC_* is unset', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_USER_ID;
    delete process.env.EXPO_PUBLIC_CHUNK_SIZE;
    delete process.env.EXPO_PUBLIC_CONCURRENCY;
    delete process.env.EXPO_PUBLIC_MAX_RETRIES;

    jest.isolateModules(() => {
      const { env } = require('@/lib/env');
      expect(env.apiUrl).toBe('http://127.0.0.1:8000');
      expect(env.userId).toBe('mobile-demo-user');
      expect(env.chunkSize).toBe(1024 * 1024);
      expect(env.concurrency).toBe(3);
      expect(env.maxRetries).toBe(3);
    });
  });

  it('strips a trailing slash off EXPO_PUBLIC_API_URL', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://example.com:8000/';
    jest.isolateModules(() => {
      const { env } = require('@/lib/env');
      expect(env.apiUrl).toBe('https://example.com:8000');
    });
  });

  it('overrides each setting individually', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://1.2.3.4:9000';
    process.env.EXPO_PUBLIC_USER_ID = 'alice';
    process.env.EXPO_PUBLIC_CHUNK_SIZE = '2097152';
    process.env.EXPO_PUBLIC_CONCURRENCY = '5';
    process.env.EXPO_PUBLIC_MAX_RETRIES = '7';

    jest.isolateModules(() => {
      const { env } = require('@/lib/env');
      expect(env.apiUrl).toBe('http://1.2.3.4:9000');
      expect(env.userId).toBe('alice');
      expect(env.chunkSize).toBe(2097152);
      expect(env.concurrency).toBe(5);
      expect(env.maxRetries).toBe(7);
    });
  });
});
