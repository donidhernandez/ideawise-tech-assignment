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

  it.each([
    ['missing_chunks', 'server', true],
    ['assembly_failed', 'server', true],
    ['invalid_total_chunks', 'server', true],
    ['chunk_count_mismatch', 'server', true],
    ['invalid_chunk_size', 'server', true],
    ['last_chunk_too_large', 'server', true],
    ['chunk_index_out_of_range', 'server', true],
    ['invalid_md5', 'server', true],
    ['invalid_filename', 'server', true],
    ['invalid_size', 'server', true],
    ['invalid_upload_id', 'server', true],
    ['invalid_json', 'server', true],
    ['upload_not_found', 'server', false],
    ['empty_chunk', 'integrity', true],
    ['mime_type_mismatch', 'invalid_type', false],
    ['chunk_md5_mismatch', 'integrity', true],
  ])('maps server error code %s to %s (retryable=%s)', (code, category, retryable) => {
    const err = new HttpError(400, { error: code }, 'failure');
    const r = categorizeError(err);
    expect(r.category).toBe(category);
    expect(r.retryable).toBe(retryable);
  });

  it.each([
    [403, 'auth'],
    [413, 'file_too_large'],
    [415, 'invalid_type'],
    [429, 'rate_limited'],
    [502, 'server'],
  ])('maps bare HTTP status %d to %s', (status, category) => {
    const err = new HttpError(status, null, `status ${status}`);
    expect(categorizeError(err).category).toBe(category);
  });

  it('maps a 4xx without recognized code to server (non-retryable)', () => {
    const err = new HttpError(418, { error: 'teapot' }, 'I am a teapot');
    const r = categorizeError(err);
    expect(r.category).toBe('server');
    expect(r.retryable).toBe(false);
  });

  it('maps a 4xx with no body to server (non-retryable)', () => {
    const err = new HttpError(400, null, 'bad');
    const r = categorizeError(err);
    expect(r.category).toBe('server');
    expect(r.retryable).toBe(false);
  });

  it('handles non-Error inputs by stringifying them', () => {
    const r = categorizeError('a raw string error');
    expect(r.category).toBe('unknown');
    expect(r.message).toBe('a raw string error');
  });
});
