import { HttpError } from './adapters/HttpAdapter.js';

export interface RetryOptions {
  maxAttempts: number;       // total attempts INCLUDING the first
  baseDelayMs: number;       // first retry delay; doubles each attempt
  jitterMs?: number;         // 0..jitterMs random additive
  signal?: AbortSignal;
  /** Called after each failed attempt that will be retried. */
  onRetry?: (error: Error, attempt: number, nextDelayMs: number) => void;
  /** Override sleep for testability. Defaults to setTimeout. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export class RetryAbortError extends Error {
  constructor() {
    super('Retry aborted');
    this.name = 'RetryAbortError';
  }
}

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryAbortError());
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(id);
      reject(new RetryAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.isRetryable();
  // Network errors, timeouts, AbortError-from-fetch, etc. — retryable.
  // We exclude only our own RetryAbortError (user-initiated cancel).
  if (err instanceof RetryAbortError) return false;
  return true;
}

/**
 * Runs `task` up to `maxAttempts` times with exponential backoff
 * (baseDelayMs, baseDelayMs*2, baseDelayMs*4, ...) + optional jitter.
 *
 * Stops immediately on permanent errors (4xx that aren't 408/425/429)
 * and on signal abort.
 */
export async function retryWithBackoff<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    if (options.signal?.aborted) throw new RetryAbortError();

    try {
      return await task(attempt);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === options.maxAttempts) {
        throw err;
      }
      const base = options.baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = options.jitterMs ? Math.random() * options.jitterMs : 0;
      const delay = base + jitter;
      options.onRetry?.(err as Error, attempt, delay);
      await sleep(delay, options.signal);
    }
  }

  // Unreachable, but keeps the type checker happy.
  throw lastError instanceof Error ? lastError : new Error('Retry failed');
}
