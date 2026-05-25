# Media Uploader — Mobile

Expo SDK 56 + React Native 0.85 + TypeScript + expo-router (typed routes)
+ React Compiler.

Consumes the same backend as the web app (`feature/backend`) and uses the
shared [`@repo/upload-core`](../../packages/upload-core) package for
chunking, retry, and pause/resume.

## Requirements

- Node 18+ and pnpm 9
- A running backend on port 8000 (see `apps/server`)
- Expo Go on a physical device, OR an iOS / Android simulator

## Setup

```bash
# From the repo root
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `.env` and set `EXPO_PUBLIC_API_URL` to your machine's **LAN IP**,
not `localhost` — the physical device cannot route to your computer's
loopback interface:

```
EXPO_PUBLIC_API_URL=http://192.168.1.42:8000
```

(On Windows: `ipconfig` to find your IPv4. On macOS/Linux: `ifconfig` or
`ip addr`.)

## Run

```bash
pnpm --filter mobile start          # interactive launcher
pnpm --filter mobile ios            # iOS simulator
pnpm --filter mobile android        # Android emulator
pnpm --filter mobile web            # browser preview (UI sanity check only — the
                                    #   native FileHandle / picker APIs require
                                    #   a real device)
```

Scan the QR with Expo Go (iOS / Android) for the fastest path.

## Type-check and tests

```bash
pnpm --filter mobile exec tsc --noEmit
pnpm --filter mobile test                  # Jest (36 tests)
pnpm --filter mobile coverage              # 95/96/96/94 (stmt/branch/func/line)
```

The Jest suite uses `jest-expo` and covers `uploadStore` (rehydrate as
orphans, replaceItem), the pure helpers in `src/lib/inference.ts`
(makeLocalId / inferMime / deriveName), `src/lib/env.ts` (defaults +
overrides + trailing-slash handling), and the full
`backgroundUpload.ts` flow (`resumePendingUploads` + the event bridge +
`defineBackgroundUploadTask` + `registerBackgroundUploadTask`).
Native-only modules (`expo-file-system` `File`/`FileHandle`,
`expo-task-manager`, `expo-background-task`,
`@react-native-async-storage/async-storage`) are mocked in
[`jest.setup.js`](jest.setup.js).

## Features

- **Pick from library** (`expo-image-picker`) — multi-select images and
  videos, up to 10 at a time
- **Take photo / video** — launches the system camera via
  `launchCameraAsync()`
- **Live progress** per file: status badge + percentage + colored bar
  (purple = uploading, amber = paused, emerald = complete, red = failed)
- **Pause / Resume / Cancel** per file
- **Categorized errors** (`INVALID TYPE` / `TOO LARGE` / `NETWORK` /
  `RATE LIMIT` / `CORRUPT` / `AUTH` / `SERVER`) via the shared
  `categorizeError()` helper in upload-core
- **Deduplicated** badge when the server short-circuits on MD5 match
- **Background upload** + **persisted queue** + **auto-resume on
  foreground / OS wake-up** — see the dedicated section below
- **Global queue progress** with completed / active counts
- Native tabs (Upload / Explore) — Upload is the default tab

## Stack notes

- **React Compiler is enabled** via `experiments.reactCompiler: true` in
  `app.json` — no manual `useMemo` / `useCallback` for performance
- **Chunked file reads use the SDK 56 `File` + `FileHandle` API**, not
  the deprecated `readAsStringAsync({ encoding: 'base64', position,
  length })`. A fresh handle is opened per chunk read so concurrent
  reads don't clobber each other's `offset` — see
  [`src/lib/expoFileSource.ts`](src/lib/expoFileSource.ts)
- **Permissions** are declared by the `expo-image-picker` and
  `expo-camera` plugins in `app.json`; runtime permission requests live
  in the upload screen
- **Monorepo Metro config** in `metro.config.js` watches the workspace
  root and adds a custom resolver that maps `./foo.js` imports to
  `./foo.ts` so `@repo/upload-core`'s Node-ESM-style imports resolve
  under Metro

## File layout

```
src/
├── app/
│   ├── _layout.tsx              ← ThemeProvider + AppTabs
│   ├── index.tsx                ← Upload screen (this app's main screen)
│   └── explore.tsx              ← Expo starter demo (kept for reference)
├── components/
│   ├── upload-item.tsx          ← per-file card with progress + actions
│   ├── app-tabs.tsx             ← NativeTabs config (Upload + Explore)
│   ├── themed-text.tsx
│   ├── themed-view.tsx
│   └── …                        ← rest is from the Expo scaffold
├── hooks/
│   └── use-upload.ts            ← bridges UploadHandle events → Zustand
├── lib/
│   ├── env.ts                   ← EXPO_PUBLIC_* env reader
│   ├── manager.ts               ← UploadManager singleton
│   ├── expoFileSource.ts        ← File → upload-core FileSource adapter
│   ├── expoUploadAdapter.ts     ← native binary upload via File.upload()
│   └── backgroundUpload.ts      ← TaskManager + resume-on-foreground
├── store/
│   └── uploadStore.ts           ← Zustand store + AsyncStorage persist
└── global.d.ts                  ← CSS module declarations for web bundle

test/                            ← Jest (36 tests / 4 files)
├── inference.test.ts            (11) — makeLocalId / inferMime / deriveName
├── env.test.ts                  (3)  — defaults + per-var overrides + slash
├── uploadStore.test.ts          (6)  — add/patch/remove/rehydrateAsOrphans
└── backgroundUpload.test.ts     (16) — resume + event bridge + task wiring
```

## Background upload

Three layers cooperate (see [ADR-013](../../docs/decisions.md)):

1. **In-flight chunks** run through `File.upload(..., { sessionType:
   'background' })` so iOS hands them to a background `NSURLSession`
   and Android keeps them alive while the process is alive.
2. **The queue is persisted** to AsyncStorage (`mobile-upload-queue`).
   On rehydrate, in-flight rows are demoted to `paused` because their
   `UploadHandle` is gone.
3. **Resume** runs on (a) initial mount, (b) every app-foreground
   transition (`AppState` listener), and (c) an OS-scheduled
   `expo-background-task` (`com.expo.modules.backgroundtask.processing`).
   All three call the same `resumePendingUploads()` helper, which
   re-uploads each paused row using the original `sourceUri`. The
   server's MD5 dedup short-circuits anything that already completed.

**Known limits**
- `expo-background-task` only fires reliably in a **dev client or
  production build**, not in Expo Go. In Expo Go the OS-scheduled
  trigger silently no-ops and only the foreground trigger runs.
- iOS `BGTaskScheduler` is at the OS's discretion — the 15-minute
  minimum in our `registerTaskAsync()` call is a hint.
- The original file URI must still resolve when resume fires. If the
  OS purged the cache or the user deleted the asset, that row is
  marked failed with "Source file is no longer available."

## Out of scope (documented in [`docs/decisions.md`](../../docs/decisions.md))

- **True byte-range resume** — current resume re-uploads from chunk 0
  and relies on MD5 dedup. Real byte-range resume would require backend
  `/init` to accept an existing `uploadId` and return populated
  `existingChunks`. ADR-013 covers the trade-off.
- **History panel** — present on web; omitted here to keep the mobile
  screen focused on the active queue. The Zustand store could expose
  it trivially.
