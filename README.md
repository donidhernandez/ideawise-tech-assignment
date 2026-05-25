# Media File Upload System

[![CI](https://github.com/donidhernandez/ideawise-tech-assignment/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/donidhernandez/ideawise-tech-assignment/actions/workflows/ci.yml)
![PHP 8.4+](https://img.shields.io/badge/PHP-8.4+-777BB4?logo=php&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Expo SDK 56](https://img.shields.io/badge/Expo-SDK%2056-000020?logo=expo&logoColor=white)
![Tests: 190+](https://img.shields.io/badge/tests-190%2B-success)

Tech assessment for IdeaWise. A chunked file upload system for images and
videos that runs across **three clients** — a Symfony API, a React web
app, and an Expo (React Native) mobile app — all sharing a single
TypeScript upload library.

Each tier lives on its own branch per the brief; `dev` is the integration
branch.

---

## At a glance

| Tier | Stack | Branch | Tests | Coverage* |
|---|---|---|---|---|
| Backend | PHP 8.5 · Symfony 6.4 LTS · Doctrine · SQLite | `feature/backend` | 23 PHPUnit, 54 assertions | requires xdebug/pcov |
| Web | React 19 · Vite 8 · React Compiler · Tailwind v4 · Zustand · TS strict | `feature/web` | 48 Vitest + 4 Playwright | **84 / 65 / 97 / 98** |
| Mobile | Expo SDK 56 · RN 0.85 · expo-router (typed routes) · React Compiler · Jest | `feature/mobile` | 36 Jest | **95 / 96 / 96 / 94** |
| Shared client | TypeScript (no runtime deps) · streaming MD5 · semaphore · backoff | `main` (`packages/upload-core`) | 61 Vitest | **92 / 79 / 97 / 94** |

\* Coverage cells are `% stmt / % branch / % func / % line`. Run `pnpm coverage` at the repo root for a fresh report. PHP coverage requires Xdebug or PCOV — see [`apps/server/README.md`](apps/server/README.md#coverage).

**Total: 172 automated tests + Playwright E2E that drives the SPA against a real Symfony backend.**

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

Full flow + protocol in [`docs/api.md`](docs/api.md). All 16 design
decisions (storage layout, auth strategy, opt-in Redis, mobile
background, error categorization, …) in [`docs/decisions.md`](docs/decisions.md).

---

## Branches

```
main              clean baseline: monorepo config + packages/upload-core + docs
└─ dev            integration: every feature merged --no-ff (172+ tests green)
   ├─ feature/backend                  apps/server (Symfony 6.4 API)
   ├─ feature/web                      apps/web    (React 19 + Vite 8 SPA)
   ├─ feature/mobile                   apps/mobile (Expo SDK 56 native app)
   ├─ feature/quick-wins               rate limit / audit logs / log retention / storage-by-user
   ├─ feature/background-upload        mobile background via TaskManager + AsyncStorage
   ├─ feature/mobile-tests             jest-expo suite (36 tests)
   ├─ feature/test-coverage            Vitest v8 + Jest --coverage + thresholds
   ├─ feature/e2e-playwright           web E2E happy paths (4 tests)
   ├─ feature/network-resilience-tests Playwright route() failure injection (4 tests)
   ├─ feature/web-resumable            web persisted queue + re-pick resume
   └─ feature/redis-chunks             opt-in Redis ChunkStateRepository
```

The brief required each tier on its own branch. Cross-cutting work
(quick wins, background upload, coverage, E2E, resumable, Redis) lives
in additional short-lived branches that merge into `dev` with
`--no-ff` so the feature history stays auditable.

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
- PHP 8.4+ and Composer 2 (for the backend) and Composer 2 (for the backend)
- Optional: Symfony CLI for nicer dev DX
- For mobile: Expo Go on a device or an iOS / Android simulator
- For Playwright E2E (web only): one-time `pnpm e2e:install` downloads Chromium (~112 MB)
- For PHP coverage (optional): Xdebug or PCOV — see `apps/server/README.md`

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
# → OK (23 tests, 54 assertions)

# Shared upload client (Vitest)
pnpm --filter @repo/upload-core test
# → 61 tests in 6 files

# Web (Vitest + Testing Library)
pnpm --filter web test
# → 48 tests in 10 files

# Mobile (Jest + jest-expo)
pnpm --filter mobile test
# → 36 tests in 4 files

# All JS coverages at once (via turbo)
pnpm coverage

# Web E2E (Playwright Chromium — starts vite + symfony before running)
pnpm e2e:install                       # one-time: downloads Chromium (~112 MB)
pnpm e2e                               # 4 tests in ~5 seconds

# Type-checks
pnpm --filter web check-types
pnpm --filter mobile exec tsc --noEmit

# Builds
pnpm --filter web build                # ~316 KB JS / 97 KB gzip
```

The Playwright suite (`apps/web/e2e/`) starts both the Vite dev server and a
PHP built-in server against `apps/server/public` before any test runs, then
drives the full upload flow in Chromium: happy upload, error categorization
on a text-bytes-declared-as-image rejection, deduplication on
identical-payload re-upload, and the Remove action. See [ADR-014](docs/decisions.md#adr-014-playwright-e2e-against-the-real-backend).

A complementary PowerShell smoke test that exercises the backend directly
lives at `apps/server/scripts/smoke-test.ps1`.

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

All require `X-User-Id` header. Rate-limited 10 inits/minute and 600 chunks/minute per user.
Full request/response shapes, error codes, and the cleanup CLI in
[`docs/api.md`](docs/api.md).

---

## Out of scope (MVP)

These were called out in the advanced section of the brief and
deliberately deferred. Reasoning lives in [`docs/decisions.md`](docs/decisions.md):

- **Redis** for chunk-state tracking — filesystem (`var/uploads/{id}/*.part`) is sufficient at MVP scale; `ChunkStorage` is one interface away from a Redis backend
- **Real authentication** — `X-User-Id` header is treated as authoritative; replacing the auth subscriber is a one-file change
- **Antimalware sandbox** (ClamAV) — limited to MIME whitelist + magic-number sniffing
- **True byte-range resume on mobile** — current `resumePendingUploads()` re-uploads from chunk 0 and relies on MD5 dedup. ADR-013 covers the trade-off.
- **Real-time monitoring dashboard** — would expose `/api/metrics` for Prometheus
- **Mobile E2E** (Detox) — covered by Jest unit tests + a manual on-device pass
- **Stress testing** — plan documented; execution out of scope

---

## Continuous integration

Every push to `main` / `dev` and every PR runs
[`.github/workflows/ci.yml`](.github/workflows/ci.yml), which fans out
into six parallel jobs:

| Job | Runs | Artifacts |
|---|---|---|
| `upload-core · vitest + coverage` | `tsc` + Vitest + v8 coverage | `coverage-upload-core/` HTML |
| `web · vitest + build + coverage` | `tsc` + Vitest + Vite production build | `coverage-web/` + `web-build/` |
| `mobile · jest-expo + coverage` | `tsc` + Jest + coverage | `coverage-mobile/` HTML |
| `backend · phpunit + coverage` | `composer install` + container lint + PHPUnit with PCOV | `coverage-backend/` HTML |
| `e2e · playwright chromium` | Boots Vite + PHP backend, runs 8 Chromium tests | `playwright-report/` |
| `CI status` | Aggregates the others as a single required check | — |

Caching: pnpm via `actions/setup-node`, Composer via `actions/cache`.
Concurrency: stale runs on the same branch are cancelled on new pushes.
Branch protection: set "CI status" as the single required check on
`main` / `dev`.

Dependabot is wired in [`.github/dependabot.yml`](.github/dependabot.yml)
for npm + Composer + GitHub Actions, grouped so weekly PRs stay
reviewable.

## Roadmap if continued

- Promote the upload-history view from web to mobile (Zustand persist over
  AsyncStorage is already wired for the active queue — adding the history
  slice is a small change)
- True byte-range resume on mobile: have `/init` accept an existing
  `uploadId` and return populated `existingChunks`; `upload-core` already
  honors `existingChunks`
- Replace `X-User-Id` with JWT verification in `UserIdSubscriber`
- Mobile Detox E2E to mirror the web Playwright pass
- Codecov / Codacy integration on top of the existing coverage artifacts
- Stress test execution via the k6 plan in roadmap

---

## License

See per-app `LICENSE` files where present (the Expo scaffold ships one).
The custom code in this repo is unlicensed pending the assessment outcome.
