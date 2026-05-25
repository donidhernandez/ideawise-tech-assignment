import type { HttpAdapter, HttpRequest, HttpResponse } from './HttpAdapter.js';

/**
 * Default browser adapter: thin wrapper around the global `fetch`.
 * Works in any environment where `fetch` is available (modern browsers,
 * React Native, Node 18+).
 */
export class FetchAdapter implements HttpAdapter {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

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
