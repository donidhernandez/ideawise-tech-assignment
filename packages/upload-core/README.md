# @repo/upload-core

Framework-agnostic chunked upload client shared by the web and mobile apps.

## What it does

- Splits a `FileSource` into N chunks of `chunkSize` bytes (default 1 MiB)
- Uploads them through a configurable number of parallel slots (default 3)
- Retries transient failures with exponential backoff + jitter (1 s, 2 s, 4 s)
- Distinguishes permanent (non-retryable) 4xx from transient 5xx /
  network errors via `HttpError.isRetryable()`
- Supports `pause()`, `resume()`, `cancel()` while preserving completed chunks
- Computes an MD5 of the assembled payload (streaming, RFC 1321
  in-house) and sends it to `/finalize` for integrity check +
  server-side deduplication
- Categorizes errors into 8 user-facing buckets via
  `categorizeError()` so web and mobile show the same copy for the same
  backend response
- Emits typed events: `statusChange`, `progress`, `chunkComplete`,
  `chunkError`, `complete`, `error`

**Zero runtime dependencies.** Pluggable transport via `HttpAdapter`,
so the same code runs unchanged in browsers, React Native (via Expo's
native upload), and Node.

## Usage

### Browser

```ts
import { UploadManager, FetchAdapter, categorizeError } from '@repo/upload-core';

const mgr = new UploadManager(new FetchAdapter(), {
  baseUrl: 'http://localhost:8000',
  userId: 'user-123',
});

const handle = mgr.upload({
  name: file.name,
  size: file.size,
  mimeType: file.type,
  slice: (start, end) => file.slice(start, end).arrayBuffer(),
});

handle.on((event) => {
  switch (event.type) {
    case 'progress':
      console.log(`${Math.round(event.progress.ratio * 100)}%`);
      break;
    case 'error': {
      const { category, message, retryable } = categorizeError(event.error);
      console.log(category, message, retryable);
      break;
    }
  }
});

const result = await handle.done();   // { fileId, url, deduplicated }
```

### React Native (Expo)

The default `FetchAdapter` doesn't work for binary chunks on RN — its
`fetch` mangles `ArrayBuffer` bodies. Supply a custom adapter that
routes binary PUTs through Expo's native `File.upload(BINARY_CONTENT)`.
A reference implementation lives in
[`apps/mobile/src/lib/expoUploadAdapter.ts`](../../apps/mobile/src/lib/expoUploadAdapter.ts).
See [ADR-012](../../docs/decisions.md#adr-012-mobile-binary-uploads-bypass-fetch-expo-native-upload-api) for the rationale.

## Run tests

```bash
pnpm --filter @repo/upload-core test          # 61 Vitest tests in 6 files
pnpm --filter @repo/upload-core coverage      # 92 / 79 / 97 / 94 (stmt/branch/func/line)
pnpm --filter @repo/upload-core check-types
```

## File layout

```
src/
├── UploadManager.ts       ← public API + UploadJob lifecycle
├── Semaphore.ts           ← concurrency cap with pause/resume + FIFO drain
├── retry.ts               ← retryWithBackoff() with AbortSignal support
├── md5.ts                 ← streaming MD5 (RFC 1321, dependency-free)
├── errors.ts              ← categorizeError() → 8 user-facing categories
├── types.ts               ← public types (UploadConfig, UploadHandle, …)
├── index.ts               ← barrel
└── adapters/
    ├── HttpAdapter.ts     ← transport interface + HttpError class
    └── FetchAdapter.ts    ← default browser / Node implementation

test/                      ← Vitest (61 tests / 6 files)
├── UploadManager.test.ts  ← integration via MockAdapter (7)
├── Semaphore.test.ts      ← concurrency + pause/resume + FIFO drain (4)
├── retry.test.ts          ← backoff / abort / permanent vs transient (6)
├── md5.test.ts            ← parity vs node:crypto across block boundaries (5)
├── errors.test.ts         ← table-driven mapping of HTTP / API codes (33)
├── FetchAdapter.test.ts   ← JSON / non-JSON / malformed / default-fetch (6)
└── helpers/MockAdapter.ts ← in-memory backend stand-in
```
