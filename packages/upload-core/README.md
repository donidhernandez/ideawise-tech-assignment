# @repo/upload-core

Framework-agnostic chunked upload client shared by the web and mobile apps.

## What it does

- Splits a `FileSource` into N chunks of `chunkSize` bytes (default 1 MiB)
- Uploads them through a configurable number of parallel slots (default 3)
- Retries transient failures with exponential backoff + jitter (1s, 2s, 4s)
- Supports `pause()`, `resume()`, `cancel()` while preserving completed chunks
- Computes an MD5 of the assembled payload (streaming) and sends it to
  `/finalize` for integrity check + server-side deduplication
- Emits typed events: `statusChange`, `progress`, `chunkComplete`,
  `chunkError`, `complete`, `error`

Zero runtime dependencies. Works in browsers, React Native (via Expo's
`fetch`), and Node.

## Usage

```ts
import { UploadManager, FetchAdapter } from '@repo/upload-core';

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
  if (event.type === 'progress') {
    console.log(`${Math.round(event.progress.ratio * 100)}%`);
  }
});

const result = await handle.done();
console.log(result.url, result.deduplicated);
```

For React Native, supply a `slice` that reads from `expo-file-system`:

```ts
import * as FileSystem from 'expo-file-system';

const source = {
  name, size, mimeType,
  slice: async (start, end) => {
    const len = end - start;
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
      position: start,
      length: len,
    });
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  },
};
```

## Run tests

```bash
pnpm --filter @repo/upload-core test
pnpm --filter @repo/upload-core check-types
```

Expected: **22 tests, all green.**

## File layout

```
src/
├── UploadManager.ts       ← public API
├── Semaphore.ts           ← concurrency cap with pause/resume
├── retry.ts               ← retryWithBackoff()
├── md5.ts                 ← streaming MD5 (RFC 1321, dependency-free)
├── types.ts               ← public types
├── index.ts               ← barrel
└── adapters/
    ├── HttpAdapter.ts     ← transport interface
    └── FetchAdapter.ts    ← default browser/RN implementation
test/
├── UploadManager.test.ts  ← integration via MockAdapter (7 tests)
├── Semaphore.test.ts      ← concurrency + pause/resume (4 tests)
├── retry.test.ts          ← backoff, abort, permanent errors (6 tests)
├── md5.test.ts            ← parity vs node:crypto (5 tests)
└── helpers/MockAdapter.ts ← in-memory backend stand-in
```
