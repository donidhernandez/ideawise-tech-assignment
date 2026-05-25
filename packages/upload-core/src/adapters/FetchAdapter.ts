import type { HttpAdapter, HttpRequest, HttpResponse } from './HttpAdapter.js';

/**
 * Default browser adapter: thin wrapper around the global `fetch`.
 * Works in any environment where `fetch` is available (modern browsers,
 * Node 18+). For React Native, prefer a platform-specific adapter
 * because RN's fetch handling of `ArrayBuffer` bodies is unreliable —
 * see `apps/mobile/src/lib/expoUploadAdapter.ts`.
 */
export class FetchAdapter implements HttpAdapter {
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    // `fetch` requires `globalThis` as its `this`. Storing it as an instance
    // method and calling `this.fetchImpl(...)` would set the wrong `this` and
    // browsers throw "Illegal invocation". Bind defensively here.
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    const response = await this.fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body as BodyInit | undefined,
      signal: req.signal,
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    let json: unknown = null;
    if (contentType.includes('application/json') && text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        // leave json null — `text` is the source of truth
      }
    }
    return { status: response.status, json, text };
  }
}
