# Media File Upload System — CLAUDE.md

> Agent-facing onboarding doc. For the human-facing overview, see
> [`README.md`](README.md).

## Project overview

Tech assessment for IdeaWise. Chunked media uploader for images and
videos with parallel queuing, exponential retry, pause / resume / cancel,
deduplication, persisted queue, and OS-scheduled background resume on
mobile.

## Repository structure

```
ideawise-tech-assignment/       ← Turborepo + pnpm workspace
├── apps/
│   ├── server/                 → Symfony 6.4 LTS / PHP 8.5         (feature/backend)
│   ├── web/                    → React 19 + Vite 8 + React Compiler (feature/web)
│   └── mobile/                 → Expo SDK 56 + RN 0.85              (feature/mobile)
├── packages/
│   ├── upload-core/            → Shared TS upload client (no runtime deps)
│   ├── ui/                     → Shared React primitives (from monorepo template)
│   ├── eslint-config/
│   └── typescript-config/
└── docs/
    ├── api.md                  → endpoint reference
    └── decisions.md            → 16 ADRs (read these before changing behavior)
```

## Branch strategy

```
main                            clean baseline (monorepo + upload-core + docs)
└─ dev                          integration; all features merged --no-ff
   ├─ feature/backend           apps/server
   ├─ feature/web               apps/web
   ├─ feature/mobile            apps/mobile
   ├─ feature/quick-wins        spec gaps batch (rate limit, audit logs, …)
   ├─ feature/background-upload mobile BG via TaskManager + AsyncStorage
   ├─ feature/mobile-tests      jest-expo suite for mobile
   ├─ feature/test-coverage     v8 / jest coverage with thresholds
   ├─ feature/e2e-playwright    web E2E happy paths
   ├─ feature/network-resilience-tests   Playwright route() failure injection
   ├─ feature/web-resumable     web persisted queue + re-pick resume
   └─ feature/redis-chunks      opt-in Redis ChunkStateRepository
```

The brief requires each tier on its own branch. Cross-cutting work
(quick-wins, tests, coverage, E2E, Redis, resumable) lives in additional
short-lived feature branches that merge into `dev`. Promotion to `main`
happens only when a release boundary is intentional.

## Stack

| Tier | Stack |
|---|---|
| Backend | PHP 8.5 · Symfony 6.4 LTS · Doctrine ORM · SQLite (default) · Predis (opt-in) |
| Web | React 19 · Vite 8 (Rolldown) · React Compiler · Tailwind CSS v4 · Zustand · TS strict |
| Mobile | Expo SDK 56 · React Native 0.85 · expo-router (typed routes) · React Compiler · jest-expo |
| Shared client | TypeScript-only (`packages/upload-core`) — semaphore, retry-with-backoff, RFC-1321 MD5 |
| Package manager | pnpm 9 (monorepo) · Composer 2 (PHP) |
| Test runners | PHPUnit 13 · Vitest 4 · Jest 29 · Playwright 1.49 |

## Development setup

### Backend (`apps/server`)

```bash
cd apps/server
composer install
cp .env.example .env.local                                # APP_SECRET, overrides
php bin/console doctrine:migrations:migrate --no-interaction
php -S 127.0.0.1:8000 -t public                           # or `symfony serve`
```

### Web (`apps/web`)

```bash
pnpm install                                              # from repo root
pnpm --filter web dev                                     # http://localhost:3000
```

### Mobile (`apps/mobile`)

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env              # set LAN IP for device
pnpm --filter mobile start                                # scan QR with Expo Go
```

For Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000`.
For iOS Simulator: `http://localhost:8000`.
For a physical device on the same Wi-Fi: `http://<your-LAN-IP>:8000` and
the backend must bind to `0.0.0.0` (`symfony serve --allow-all-ip`).

## Running tests

```bash
# All JS suites in parallel
pnpm test

# All JS coverage reports
pnpm coverage

# Playwright web E2E (boots vite + symfony automatically)
pnpm e2e:install                                          # one-time: chromium
pnpm e2e

# Per package
pnpm --filter @repo/upload-core test                      # 61 Vitest
pnpm --filter web test                                    # 51 Vitest
pnpm --filter mobile test                                 # 36 Jest

# Server
cd apps/server && php bin/phpunit --testdox               # 34 PHPUnit, 80 assertions
cd apps/server && composer coverage                       # needs xdebug or pcov
```

**Current test totals: 190+ automated tests across the workspace.**

## Environment variables

### Backend (`apps/server/.env` and `.env.local`)

```ini
APP_ENV=dev
APP_SECRET=...                          # in .env.local only — keep out of git
DATABASE_URL="sqlite:///%kernel.project_dir%/var/data_%kernel.environment%.db"
CORS_ALLOW_ORIGIN='^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$'

MAX_UPLOAD_SIZE=524288000               # 500 MiB
CHUNK_SIZE=1048576                      # 1 MiB
RATE_LIMIT_INIT=10                      # per X-User-Id, per minute (spec)
RATE_LIMIT_CHUNK=600                    # per X-User-Id, per minute

CHUNK_STATE_BACKEND=filesystem          # or 'redis' (see ADR-016)
# REDIS_DSN=redis://localhost:6379
```

### Web (`apps/web/.env.local`, all `VITE_*` inlined at build time)

```ini
VITE_API_URL=http://localhost:8000
VITE_USER_ID=web-demo-user
VITE_CHUNK_SIZE=1048576
VITE_CONCURRENCY=3
VITE_MAX_RETRIES=3
```

### Mobile (`apps/mobile/.env`, all `EXPO_PUBLIC_*` inlined at bundle time)

```ini
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000        # Android emulator alias
EXPO_PUBLIC_USER_ID=mobile-demo-user
EXPO_PUBLIC_CHUNK_SIZE=1048576
EXPO_PUBLIC_CONCURRENCY=3
EXPO_PUBLIC_MAX_RETRIES=3
```

## Key architecture decisions

See [`docs/decisions.md`](docs/decisions.md) for the full 16 ADRs. Quick summary:

- **ADR-001 — SQLite over MySQL/Postgres** at MVP scale; one env-var migration to Postgres.
- **ADR-002 / -016 — Filesystem chunk index default + opt-in Redis** (`CHUNK_STATE_BACKEND=redis` swaps in a predis-backed SET with 24h TTL for multi-host deployments).
- **ADR-003 — `X-User-Id` header instead of real auth**; one EventSubscriber away from JWT/OAuth.
- **ADR-009 — Storage layout** `var/storage/{userId}/{Y/M/D}/{md5}_{filename}` (by user + date, with cross-user dedup at the DB level).
- **ADR-010 — Two rate-limiter buckets** (`init` 10/min, `chunk` 600/min) so the spec's anti-abuse ceiling on session creation doesn't break large-file traffic.
- **ADR-011 — Shared `categorizeError()`** in upload-core so web and mobile show the same error category for the same backend response.
- **ADR-012 — Mobile binary chunks bypass `fetch`** via Expo's native `File.upload(BINARY_CONTENT)` — RN's fetch doesn't send `ArrayBuffer` bodies byte-for-byte.
- **ADR-013 — Mobile background upload** = native `sessionType: 'background'` + AsyncStorage-persisted queue + `TaskManager` resume on foreground / OS wake-up.
- **ADR-014 — Playwright E2E against the real backend** (no MSW mocks — the integration points are the bugs we want to catch).
- **ADR-015 — Web resumable upload** via persisted queue + "re-select file to continue" affordance (browsers can't preserve File handles across reloads).

## API endpoints

Base URL: `http://localhost:8000`. All require `X-User-Id: <user-id>` header.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/uploads/init` | Initialize a new upload session (optional early MD5 dedup) |
| `PUT`  | `/api/uploads/{id}/chunks/{idx}` | Upload a single binary chunk |
| `POST` | `/api/uploads/{id}/finalize` | Reassemble, verify MD5, dedup, commit |
| `GET`  | `/api/uploads/{id}/status` | Resume / poll — returns `uploadedChunks[]` |

Full request/response shapes + error codes in [`docs/api.md`](docs/api.md).

## Commit conventions

```
feat(backend): add chunk upload endpoint
fix(web): handle pause during active chunk transfer
test(e2e): network-failure suite with route() interception
chore: update gitignore for symfony var/
docs(decisions): ADR-016 — Redis chunk index opt-in
```

Per the brief (separate branches per tier), feature commits are scoped
by tier in the message subject (`feat(backend|web|mobile|upload-core)`).
Tests use `test(<scope>)`. Cross-cutting infrastructure uses `chore:`.

## Out of scope (kept simple by design — each has a documented ADR)

- **ClamAV antimalware sandbox** — MIME whitelist + magic-number sniff
  on chunk 0 is the layer we ship.
- **Real-time monitoring dashboard** — JSON logs through the existing
  `uploads` Monolog channel are sufficient for the assessment scope.
- **Mobile Detox E2E** — Jest unit tests cover the bridge; a manual
  on-device pass is the documented gate.
- **Stress test execution (100 concurrent uploads)** — a k6 plan would
  be the follow-up.

## When making changes

1. Branch off the right tier (`feature/{tier}`) and stay within that
   tier's apps/ directory. Cross-cutting changes go on a dedicated
   `feature/<name>` branch off `dev`.
2. Tests live next to the code they cover, never inline with
   production sources.
3. Any behavior the spec calls out gets an ADR entry; any deferral
   gets a documented justification.
4. The rate-limit defaults in `apps/server/.env` follow the spec. If
   you need to relax them for a test pass, do it via env (Playwright's
   webServer config already does this).
