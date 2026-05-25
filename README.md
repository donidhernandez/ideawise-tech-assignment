# Media File Upload System

Tech assessment for IdeaWise. A chunked file upload system for images and
videos that runs across **three clients** — a Symfony API, a React web
app, and an Expo (React Native) mobile app — all sharing a single
TypeScript upload library.

Each tier lives on its own branch per the brief; `dev` is the integration
branch.

---

## At a glance

| Tier | Stack | Branch | Tests |
|---|---|---|---|
| Backend | PHP 8.5 · Symfony 6.4 LTS · Doctrine · SQLite | `feature/backend` | 22 PHPUnit, 51 assertions |
| Web | React 19 · Vite 8 · React Compiler · Tailwind v4 · Zustand · TS strict | `feature/web` | 14 Vitest |
| Mobile | Expo SDK 56 · RN 0.85 · expo-router (typed routes) · React Compiler | `feature/mobile` | TypeScript check |
| Shared client | TypeScript (no runtime deps) · streaming MD5 · semaphore · backoff | `main` (`packages/upload-core`) | 22 Vitest |

**Total: 58 automated tests + end-to-end browser verification against the live backend.**

---

## Architecture

```
┌──────────────┐      ┌──────────────┐
│   Web app    │      │  Mobile app  │
│  (Vite + R19)│      │  (Expo SDK56)│
└──────┬───────┘      └──────┬───────┘
       │                     │
       │   @repo/upload-core │
       │  (chunking · queue  │
       │   · retry · MD5)    │
       └──────────┬──────────┘
                  │
            HTTP / JSON
                  │
       ┌──────────▼──────────┐
       │   Symfony API       │
       │   /api/uploads/…    │
       │                     │
       │ ┌─ SQLite (Doctrine)│
       │ ├─ var/uploads/{id}/│
       │ │   (in-flight)     │
       │ └─ var/storage/Y/M/D│
       │     {md5}_filename  │
       └─────────────────────┘
```

A file gets sliced client-side into 1 MiB chunks, dispatched in 3 parallel
slots with exponential-backoff retry; the server appends each `.part`,
sniffs MIME by magic number on chunk 0, reassembles on finalize, verifies
MD5, deduplicates against existing files, and commits to date-partitioned
storage.

Full flow + protocol in [`docs/api.md`](docs/api.md). Design decisions
(why SQLite, why filesystem over Redis, why no real auth in MVP) in
[`docs/decisions.md`](docs/decisions.md).

---

## Branches

```
main              ← clean baseline: monorepo config + packages/upload-core + docs
└─ dev            ← integration: all three tiers merged + tested together
   ├─ feature/backend   apps/server  (Symfony 6.4 API)
   ├─ feature/web       apps/web     (React 19 + Vite 8 SPA)
   └─ feature/mobile    apps/mobile  (Expo SDK 56 native app)
```

The brief required each tier on its own branch. They were integrated on
`dev` with `--no-ff` merges so each feature's history is preserved.

---

## Repository structure

```
ideawise-tech-assignment/
├── apps/
│   ├── server/        ← Symfony 6.4 API (PHP 8.5)
│   ├── web/           ← React 19 + Vite 8 SPA
│   └── mobile/        ← Expo SDK 56 (iOS / Android / web)
├── packages/
│   ├── upload-core/   ← shared TS upload client (zero runtime deps)
│   ├── ui/            ← shared React primitives (from the monorepo template)
│   ├── eslint-config/
│   └── typescript-config/
├── docs/
│   ├── api.md         ← endpoint reference
│   └── decisions.md   ← ADRs
├── CLAUDE.md          ← agent-onboarding doc
└── README.md          ← you are here
```

---

## Quick start

### Prerequisites

- Node 18+ and pnpm 9
- PHP 8.2+ and Composer 2 (for the backend)
- Optional: Symfony CLI for nicer dev DX
- For mobile: Expo Go on a device or an iOS / Android simulator

### 1) Backend (`apps/server`)

```bash
git checkout feature/backend
pnpm install                          # workspace-wide
cd apps/server
composer install
cp .env.example .env.local
php bin/console doctrine:migrations:migrate --no-interaction
php -S 127.0.0.1:8000 -t public
# or: symfony serve
```

→ `http://127.0.0.1:8000/api/uploads/init` is live.

### 2) Web (`apps/web`)

```bash
git checkout feature/web              # or `dev` to have everything
pnpm install
cp apps/web/.env.example apps/web/.env.local   # optional
pnpm --filter web dev
```

→ Open `http://localhost:3000`, drop files, watch them upload.

### 3) Mobile (`apps/mobile`)

```bash
git checkout feature/mobile           # or `dev`
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/mobile/.env` and set `EXPO_PUBLIC_API_URL` to your machine's
**LAN IP** — `localhost` doesn't reach a phone:

```
EXPO_PUBLIC_API_URL=http://192.168.1.42:8000
```

```bash
pnpm --filter mobile start            # scan the QR with Expo Go
pnpm --filter mobile ios              # iOS simulator
pnpm --filter mobile android          # Android emulator
pnpm --filter mobile web              # browser preview (UI sanity check only;
                                      # the native FileHandle / picker paths
                                      # need a real device)
```

### Running everything together (integration branch)

```bash
git checkout dev
pnpm install
# Terminal 1
cd apps/server && composer install && php -S 127.0.0.1:8000 -t public
# Terminal 2
pnpm --filter web dev
# Terminal 3
pnpm --filter mobile start
```

---

## Tests

```bash
# Backend (PHPUnit)
cd apps/server && php bin/phpunit --testdox
# → OK (22 tests, 51 assertions)

# Shared upload client (Vitest)
pnpm --filter @repo/upload-core test
# → 22 tests in 4 files

# Web (Vitest + Testing Library)
pnpm --filter web test
# → 14 tests in 3 files

# Type-checks
pnpm --filter web check-types
pnpm --filter mobile exec tsc --noEmit

# Builds
pnpm --filter web build                # ~316 KB JS / 97 KB gzip
```

End-to-end verification of the full upload flow against a running server
is documented as `apps/server/scripts/smoke-test.ps1` (PowerShell) and
was exercised manually in the browser against the live backend.

---

## What `@repo/upload-core` provides

The shared TypeScript client both apps depend on. Zero runtime deps so it
runs unchanged in browsers, React Native (via Expo), and Node. Source:
[`packages/upload-core`](packages/upload-core).

```ts
const mgr = new UploadManager(new FetchAdapter(), {
  baseUrl: 'http://localhost:8000',
  userId: 'demo-user',
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

const result = await handle.done();  // { fileId, url, deduplicated }
```

Per-upload `pause()` / `resume()` / `cancel()`. Concurrency cap via an
in-house semaphore. Exponential backoff with jitter, with permanent
errors (4xx-non-retryable) failing fast. Streaming MD5 (RFC 1321
implemented in-house) used for the finalize integrity check and the
optional early-dedup path.

---

## Backend API (4 endpoints)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/uploads/init` | start a session — optional early MD5 dedup |
| `PUT`  | `/api/uploads/{id}/chunks/{idx}` | upload a single chunk |
| `POST` | `/api/uploads/{id}/finalize` | reassemble, verify MD5, dedup, commit |
| `GET`  | `/api/uploads/{id}/status` | resume / poll |

All require `X-User-Id` header. Rate-limited 60 requests/minute per user.
Full request/response shapes, error codes, and the cleanup CLI in
[`docs/api.md`](docs/api.md).

---

## Out of scope (MVP)

These were called out in the advanced section of the brief and
deliberately deferred. Reasoning lives in [`docs/decisions.md`](docs/decisions.md):

- **Redis** for chunk-state tracking — filesystem (`var/uploads/{id}/*.part`) is sufficient at MVP scale; `ChunkStorage` is one interface away from a Redis backend
- **Real authentication** — `X-User-Id` header is treated as authoritative; replacing the auth subscriber is a one-file change
- **Antimalware sandbox** (ClamAV) — limited to MIME whitelist + magic-number sniffing
- **Background uploads on mobile** — `BGTaskScheduler` (iOS) + `WorkManager` (Android) are non-trivial; the queue freezes if the app is backgrounded
- **Real-time monitoring dashboard** — would expose `/api/metrics` for Prometheus
- **E2E tests** (Playwright / Detox) — covered by unit tests on critical paths + manual browser verification
- **Stress testing** — plan documented; execution out of scope

---

## Roadmap if continued

- Promote the upload-history view from web to mobile (it's a Zustand
  store with optional `persist` middleware away)
- Persist the active queue across app restarts (AsyncStorage on mobile)
- Replace `X-User-Id` with JWT verification in `UserIdSubscriber`
- Add a `RedisChunkStorage` and make the backend swap between filesystem
  and Redis via env config
- E2E suite (Playwright for web, Detox for mobile)
- CI: GitHub Actions matrix running PHPUnit + the two Vitest suites + mobile type-check on every PR

---

## License

See per-app `LICENSE` files where present (the Expo scaffold ships one).
The custom code in this repo is unlicensed pending the assessment outcome.
