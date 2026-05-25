import { describe, expect, it, vi } from 'vitest';
import { FetchAdapter } from '../src/adapters/FetchAdapter.js';

function makeFetch(response: {
  status: number;
  contentType?: string;
  text?: string;
}): typeof fetch {
  return vi.fn().mockResolvedValue({
    status: response.status,
    headers: {
      get: (h: string) =>
        h.toLowerCase() === 'content-type' ? (response.contentType ?? null) : null,
    },
    text: () => Promise.resolve(response.text ?? ''),
  }) as unknown as typeof fetch;
}

describe('FetchAdapter', () => {
  it('passes method, headers, body, and signal through to fetch', async () => {
    const stub = makeFetch({ status: 200, contentType: 'application/json', text: '{"ok":true}' });
    const adapter = new FetchAdapter(stub);
    const controller = new AbortController();
    const buf = new ArrayBuffer(8);

    const res = await adapter.request({
      url: 'http://x/api',
      method: 'PUT',
      headers: { 'X-User-Id': 'u', 'Content-Type': 'application/octet-stream' },
      body: buf,
      signal: controller.signal,
    });

    expect(stub).toHaveBeenCalledWith(
      'http://x/api',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'X-User-Id': 'u', 'Content-Type': 'application/octet-stream' },
        body: buf,
        signal: controller.signal,
      })
    );
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    expect(res.text).toBe('{"ok":true}');
  });

  it('parses JSON when content-type indicates it', async () => {
    const stub = makeFetch({ status: 201, contentType: 'application/json; charset=utf-8', text: '{"uploadId":"abc"}' });
    const res = await new FetchAdapter(stub).request({
      url: 'http://x/init',
      method: 'POST',
      headers: {},
    });
    expect(res.json).toEqual({ uploadId: 'abc' });
  });

  it('leaves json null when content-type is not JSON', async () => {
    const stub = makeFetch({ status: 200, contentType: 'text/plain', text: 'hello' });
    const res = await new FetchAdapter(stub).request({
      url: 'http://x',
      method: 'GET',
      headers: {},
    });
    expect(res.json).toBeNull();
    expect(res.text).toBe('hello');
  });

  it('survives malformed JSON in a JSON-typed response', async () => {
    const stub = makeFetch({ status: 200, contentType: 'application/json', text: 'not-json{' });
    const res = await new FetchAdapter(stub).request({
      url: 'http://x',
      method: 'GET',
      headers: {},
    });
    expect(res.json).toBeNull();
    expect(res.text).toBe('not-json{');
  });

  it('leaves json null for empty bodies even with JSON content-type', async () => {
    const stub = makeFetch({ status: 204, contentType: 'application/json', text: '' });
    const res = await new FetchAdapter(stub).request({
      url: 'http://x',
      method: 'DELETE',
      headers: {},
    });
    expect(res.json).toBeNull();
    expect(res.text).toBe('');
  });

  it('defaults to the global fetch when no impl is provided', async () => {
    const originalFetch = globalThis.fetch;
    const spy = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve('x'),
    });
    globalThis.fetch = spy as unknown as typeof fetch;
    try {
      await new FetchAdapter().request({ url: 'http://x', method: 'GET', headers: {} });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
