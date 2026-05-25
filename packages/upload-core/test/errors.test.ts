import { describe, expect, it } from 'vitest';
import { categorizeError } from '../src/errors.js';
import { HttpError } from '../src/adapters/HttpAdapter.js';

describe('categorizeError', () => {
  it('maps unsupported_mime_type to invalid_type', () => {
    const err = new HttpError(415, { error: 'unsupported_mime_type' }, 'init failed: 415');
    const result = categorizeError(err);
    expect(result.category).toBe('invalid_type');
    expect(result.retryable).toBe(false);
  });

  it('maps size_too_large to file_too_large', () => {
    const err = new HttpError(413, { error: 'size_too_large' }, 'init failed: 413');
    const result = categorizeError(err);
    expect(result.category).toBe('file_too_large');
    expect(result.retryable).toBe(false);
  });

  it('maps md5_mismatch to integrity (retryable)', () => {
    const err = new HttpError(422, { error: 'md5_mismatch' }, 'finalize failed: 422');
    const result = categorizeError(err);
    expect(result.category).toBe('integrity');
    expect(result.retryable).toBe(true);
  });

  it('maps rate_limited to rate_limited (retryable)', () => {
    const err = new HttpError(429, { error: 'rate_limited' }, 'too many');
    const result = categorizeError(err);
    expect(result.category).toBe('rate_limited');
    expect(result.retryable).toBe(true);
  });

  it('maps missing_user_id to auth', () => {
    const err = new HttpError(401, { error: 'missing_user_id' }, 'auth required');
    const result = categorizeError(err);
    expect(result.category).toBe('auth');
    expect(result.retryable).toBe(false);
  });

  it('falls back to http-status mapping when error code is unknown', () => {
    const err = new HttpError(503, null, 'svc down');
    const result = categorizeError(err);
    expect(result.category).toBe('server');
    expect(result.retryable).toBe(true);
  });

  it('detects network errors from message heuristics', () => {
    const result = categorizeError(new Error('TypeError: Network request failed'));
    expect(result.category).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('detects cancellation', () => {
    const result = categorizeError(new Error('Upload canceled'));
    expect(result.category).toBe('unknown');
    expect(result.retryable).toBe(false);
  });

  it('handles plain unknown error', () => {
    const result = categorizeError(new Error('something weird'));
    expect(result.category).toBe('unknown');
    expect(result.message).toBe('something weird');
  });
});
