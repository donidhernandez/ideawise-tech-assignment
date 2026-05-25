export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: ArrayBuffer | string;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  /** Parsed JSON body if Content-Type indicates JSON; otherwise null. */
  json: unknown;
  /** Raw text fallback */
  text: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }

  /** Anything 4xx except 408/425/429 is a permanent error — not worth retrying. */
  isRetryable(): boolean {
    if (this.status >= 500) return true;
    return this.status === 408 || this.status === 425 || this.status === 429;
  }
}

/**
 * Pluggable HTTP transport. Lets the same UploadManager run on
 * browser fetch, expo-file-system, node-fetch, etc.
 */
export interface HttpAdapter {
  request(req: HttpRequest): Promise<HttpResponse>;
}
