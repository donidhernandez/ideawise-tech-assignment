import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/adapters/HttpAdapter.js';
import { retryWithBackoff, RetryAbortError } from '../src/retry.js';

const noSleep = (): Promise<void> => Promise.resolve();

describe('retryWithBackoff', () => {
  it('resolves on first success without delay', async () => {
    const task = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(task, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      sleep: noSleep,
    });
    expect(result).toBe('ok');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors with exponential delays', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom1'))
      .mockRejectedValueOnce(new Error('boom2'))
      .mockResolvedValue('ok');
    const delays: number[] = [];
    const result = await retryWithBackoff(task, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    expect(result).toBe('ok');
    expect(task).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([1000, 2000]);
  });

  it('stops immediately on permanent HTTP errors (4xx non-retryable)', async () => {
    const task = vi.fn().mockRejectedValue(new HttpError(400, null, 'bad request'));
    await expect(
      retryWithBackoff(task, { maxAttempts: 5, baseDelayMs: 1000, sleep: noSleep })
    ).rejects.toBeInstanceOf(HttpError);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('retries 429 (rate limit) and 503 (service unavailable)', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(429, null, 'too many'))
      .mockRejectedValueOnce(new HttpError(503, null, 'svc down'))
      .mockResolvedValue('ok');
    const result = await retryWithBackoff(task, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      sleep: noSleep,
    });
    expect(result).toBe('ok');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxAttempts and rethrows last error', async () => {
    const task = vi.fn().mockRejectedValue(new Error('forever'));
    await expect(
      retryWithBackoff(task, { maxAttempts: 3, baseDelayMs: 1000, sleep: noSleep })
    ).rejects.toThrow('forever');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('aborts immediately when signal is fired pre-task', async () => {
    const controller = new AbortController();
    controller.abort();
    const task = vi.fn();
    await expect(
      retryWithBackoff(task, {
        maxAttempts: 3,
        baseDelayMs: 1000,
        sleep: noSleep,
        signal: controller.signal,
      })
    ).rejects.toBeInstanceOf(RetryAbortError);
    expect(task).not.toHaveBeenCalled();
  });
});
