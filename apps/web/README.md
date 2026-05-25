# Media Uploader — Web

React 19 + Vite 8 + TypeScript + React Compiler + Tailwind v4.

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
cp apps/web/.env.example apps/web/.env.local   # optional — edits the API URL
pnpm --filter web dev                          # http://localhost:3000
```

## Running tests

```bash
pnpm --filter web test          # Vitest run (14 tests)
pnpm --filter web check-types   # tsc --noEmit
pnpm --filter web build         # production bundle
```

## Features

- **Drag & drop or click** to pick 1–10 image/video files (≤ 500 MB each)
- **Live thumbnails** for images, typed badges for video / other
- **Per-file progress** with pause / resume / cancel
- **Global queue progress** bar
- **Toast notifications** for success and failure (via `sonner`)
- **Local history** of the last 20 uploads, persisted in `localStorage`,
  with a "deduped" marker when the server short-circuited the upload
- **Responsive** layout (queue on top on narrow viewports, side panel on desktop)

## Stack notes

- **React Compiler** is wired through `@vitejs/plugin-react` + `@rolldown/plugin-babel`
  (`reactCompilerPreset`). It auto-memoizes components — no `useMemo` /
  `useCallback` boilerplate needed for performance.
- **Tailwind v4** uses the `@tailwindcss/vite` plugin (no PostCSS config).
- **Zustand** holds the live upload list and the persisted history; the
  `persist` middleware partializes only the history slice.
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
│   ├── UploadItem.tsx       ← progress + actions
│   ├── UploadQueue.tsx      ← list + global progress
│   ├── HistoryPanel.tsx     ← localStorage history
│   └── StatusBadge.tsx
├── hooks/
│   └── useUpload.ts         ← UploadManager → Zustand bridge
├── store/
│   └── uploadStore.ts       ← Zustand store with persist
└── lib/
    ├── manager.ts           ← UploadManager singleton
    ├── fileSource.ts        ← File → upload-core FileSource adapter
    ├── validation.ts        ← per-file rules (type / size / count)
    └── format.ts            ← byte / time formatting

test/
├── setup.ts                 ← Testing Library + jsdom URL polyfills
├── validation.test.ts       (5 tests)
├── uploadStore.test.ts      (5 tests)
└── format.test.ts           (4 tests)
```

## End-to-end verification

The flow was exercised against a live backend (worktree at
`../ideawise-tech-assignment-backend`, port 8000):

1. Inject a 1.5 MiB synthetic JPEG → 2-chunk upload → status `Complete`,
   file at `var/storage/YYYY/MM/DD/{md5}_browser-real.jpg`.
2. Re-upload the same payload under a different name → status
   `Deduplicated`, no second physical file written.
3. Missing `X-User-Id` header → 401 (covered server-side in PHPUnit).

Screenshots and the full E2E playback live in the project assessment notes.
