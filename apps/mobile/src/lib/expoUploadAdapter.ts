import {
  FetchAdapter,
  type HttpAdapter,
  type HttpRequest,
  type HttpResponse,
} from '@repo/upload-core';
import { File, FileMode, Paths, UploadType } from 'expo-file-system';

/**
 * React Native fetch does not send `ArrayBuffer` request bodies byte-for-byte
 * (different RN versions either coerce them through string conversion or fail
 * outright — `new Blob([Uint8Array])` is also explicitly unsupported on RN
 * with "Creating blobs from ArrayBuffer and ArrayBufferView are not supported").
 *
 * For PUT-chunk requests we therefore route around fetch entirely: write the
 * chunk bytes to a temp file in the cache directory, then use the SDK 56
 * native `File.upload(url, { uploadType: BINARY_CONTENT })` API which performs
 * a real binary HTTP upload from disk. Bytes arrive byte-exact.
 *
 * All other requests (JSON init/finalize, GET status) keep going through
 * `FetchAdapter` because RN's fetch handles strings and GETs correctly.
 */
export class ExpoUploadAdapter implements HttpAdapter {
  private readonly fallback = new FetchAdapter();

  async request(req: HttpRequest): Promise<HttpResponse> {
    if (req.body instanceof ArrayBuffer) {
      return this.uploadBinary(req, req.body);
    }
    return this.fallback.request(req);
  }

  private async uploadBinary(req: HttpRequest, body: ArrayBuffer): Promise<HttpResponse> {
    const tempName = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.bin`;
    const tempFile = new File(Paths.cache, tempName);

    try {
      // Write the chunk bytes to disk so Expo can stream them as the request body.
      tempFile.create();
      const handle = tempFile.open(FileMode.WriteOnly);
      try {
        handle.writeBytes(new Uint8Array(body));
      } finally {
        handle.close();
      }

      // Only POST/PUT carry bodies through upload-core; PATCH is reachable through
      // a future adapter caller but never produced today.
      const httpMethod: 'POST' | 'PUT' | 'PATCH' = req.method === 'POST' ? 'POST' : 'PUT';

      const result = await tempFile.upload(req.url, {
        httpMethod,
        uploadType: UploadType.BINARY_CONTENT,
        headers: req.headers,
        // iOS NSURLSession in background mode — chunks already in flight when
        // the user backgrounds the app continue to complete. Android ignores
        // this option but its underlying transfer also survives backgrounding
        // while the process is alive. Default in SDK 56, repeated here for
        // intent.
        sessionType: 'background',
      });

      const contentType = result.headers['content-type'] ?? result.headers['Content-Type'] ?? '';
      let json: unknown = null;
      if (contentType.includes('application/json') && result.body.length > 0) {
        try {
          json = JSON.parse(result.body);
        } catch {
          // leave json null — text remains the source of truth
        }
      }

      return { status: result.status, json, text: result.body };
    } finally {
      try {
        tempFile.delete();
      } catch {
        // Best-effort cleanup; the OS purges the cache directory anyway.
      }
    }
  }
}
