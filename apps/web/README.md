# Media Uploader — Web

React 19 + Vite 8 + TypeScript (strict) + React Compiler + Tailwind v4.

Consumes the backend on `feature/backend` via the shared
[`@repo/upload-core`](../../packages/upload-core) package.

## Requirements

- Node 18+ (tested on the latest LTS)
- pnpm 9
- A running backend on `http://localhost:8000` (default, configurable via `VITE_API_URL`)

## Setup

```bash
# From the repo root
pnpm install
cp apps/web/.env.example apps/web/.env.local   # optional — edits the API URL / user id
pnpm --filter web dev                          # http://localhost:3000
```

## Running tests

```bash
pnpm --filter web test            # Vitest (51 tests)
pnpm --filter web coverage        # 84/65/97/98 (stmt/branch/func/line)
pnpm --filter web check-types     # tsc --noEmit
pnpm --filter web build           # production bundle: ~316 KB JS / ~97 KB gzip
```

## End-to-end (Playwright)

```bash
pnpm --filter web e2e:install     # one-time: downloads Chromium (~112 MB)
pnpm --filter web e2e             # 8 tests in ~17 s
pnpm --filter web e2e:ui          # Playwright UI mode
```

Playwright boots a real Vite dev server **and** a PHP built-in server
against `apps/server/public` before any test runs — no MSW mocks, the
suite verifies the actual integration. See [ADR-014](../../docs/decisions.md#adr-014-playwright-e2e-against-the-real-backend).

The suite covers two groups (`e2e/upload.spec.ts` + `e2e/network.spec.ts`):

| # | What it proves |
|---|---|
| 1 | Happy upload reaches `Complete` with a `/uploads/{userId}/Y/M/D/{md5}_…` link |
| 2 | Text bytes declared `image/png` rejected → `INVALID TYPE` badge + friendly copy |
| 3 | Re-uploading the same payload → `Deduplicated` badge, no second file |
| 4 | `Remove` drops a completed row, empty-state copy returns |
| 5 | Two transient 503s on chunk 0 → upload-core retries and lands on `Complete` |
| 6 | All-503 on chunk 0 → row fails with `SERVER` category after the retry budget |
| 7 | 401 on chunk 0 → fails fast (1 attempt, < 4 s, `AUTH` category) — no wasted retries |
| 8 | `route.abort('connectionrefused')` → row fails with `NETWORK` category |

## Features

- **Drag & drop or click** to pick 1–10 image/video files (≤ 500 MB each)
- **Live thumbnails** for images, typed badges for video / other
- **Per-file progress** with pause / resume / cancel + categorized errors
  (`INVALID TYPE` / `TOO LARGE` / `NETWORK` / `RATE LIMIT` / `CORRUPT` / `AUTH` / `SERVER`)
- **Global queue progress** bar with completed / active counts
- **Toast notifications** for success and failure (via `sonner`)
- **Local history** (last 20 uploads) and the **active queue** are both
  persisted to `localStorage`. Rows in flight when the page reloads come
  back as `Paused` + orphaned, with a **Re-select** button to continue —
  the server's MD5 dedup short-circuits anything that already finished
  last session. See [ADR-015](../../docs/decisions.md#adr-015-web-resumable-upload--persist--re-select-to-continue).
- **Responsive** layout (queue stacks on narrow viewports, history side
  panel on desktop)

## Stack notes

- **React Compiler** is wired through `@vitejs/plugin-react` + `@rolldown/plugin-babel`
  (`reactCompilerPreset`). It auto-memoizes components — no `useMemo` /
  `useCallback` boilerplate needed for performance.
- **Tailwind v4** uses the `@tailwindcss/vite` plugin (no PostCSS config).
- **Zustand** with the `persist` middleware over `localStorage` holds
  both the live upload list and the history slice.
- **`react-dropzone`** drives the file picker; validation is in
  `src/lib/validation.ts` and is unit-tested independently.

## File layout

```
src/
├── App.tsx                  ← layout: picker + queue + history
├── main.tsx                 ← React 19 root
├── env.ts                   ← VITE_* env reader
├── index.css                ← Tailwind v4 entry
├── components/
│   ├── FilePicker.tsx       ← react-dropzone + validation
│   ├── FilePreview.tsx      ← image thumb / type badge
│   ├── UploadItem.tsx       ← progress + actions + categorized error box
│   ├── UploadQueue.tsx      ← list + global progress
│   ├── HistoryPanel.tsx     ← localStorage history
│   └── StatusBadge.tsx
├── hooks/
│   └── useUpload.ts         ← UploadManager → Zustand bridge + resumeOrphan
├── store/
│   └── uploadStore.ts       ← Zustand with persist (items + history)
└── lib/
    ├── manager.ts           ← UploadManager singleton
    ├── fileSource.ts        ← File → upload-core FileSource adapter
    ├── validation.ts        ← per-file rules (type / size / count)
    └── format.ts            ← byte / time formatting

test/                        ← Vitest (51 tests / 10 files)
├── setup.ts                 ← Testing Library + jsdom URL polyfills
├── validation.test.ts       (5)
├── uploadStore.test.ts      (6)
├── orphanResume.test.ts     (3) — rehydrate + replaceItem
├── format.test.ts           (4)
├── fileSource.test.ts       (3)
├── StatusBadge.test.tsx     (9)
├── FilePreview.test.tsx     (4)
├── UploadItem.test.tsx      (8)
├── UploadQueue.test.tsx     (4)
├── HistoryPanel.test.tsx    (4)
└── FilePicker.test.tsx      (3)

e2e/                         ← Playwright (8 tests / 2 files)
├── helpers.ts               ← injectFile() + resetStore()
├── upload.spec.ts           ← 4 happy-path scenarios
└── network.spec.ts          ← 4 failure-injection scenarios
```
