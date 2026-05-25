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

## Type-check

```bash
pnpm --filter mobile exec tsc --noEmit
```

## Features

- **Pick from library** (`expo-image-picker`) — multi-select images and
  videos, up to 10 at a time
- **Take photo / video** — launches the system camera via
  `launchCameraAsync()`
- **Live progress** per file: status badge + percentage + colored bar
  (purple = uploading, amber = paused, emerald = complete, red = failed)
- **Pause / Resume / Cancel** per file
- **Deduplicated** badge when the server short-circuits on MD5 match
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
│   └── expoFileSource.ts        ← File → upload-core FileSource adapter
├── store/
│   └── uploadStore.ts           ← Zustand store of live uploads
└── global.d.ts                  ← CSS module declarations for web bundle
```

## Out of scope (documented in [`docs/decisions.md`](../../docs/decisions.md))

- **Background upload** — `BGTaskScheduler` (iOS) and `WorkManager`
  (Android) add significant OS-specific complexity. Documented as a
  known limitation; the UI stays paused if the user backgrounds the
  app during an upload.
- **Persisting the upload queue across app restarts** — the in-memory
  Zustand store is session-only on mobile. Could be added by mirroring
  the web app's `persist` middleware over AsyncStorage.
- **History panel** — present on web; omitted here to keep the mobile
  screen focused on the active queue. The list could be re-introduced
  if needed.
