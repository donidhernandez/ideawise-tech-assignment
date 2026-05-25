# Media File Upload System — CLAUDE.md

## Project Overview

Tech assessment for IdeaWise. Chunked file upload system supporting images and videos with
parallel queuing, exponential retry, pause/resume/cancel, and deduplication.

## Repository Structure

```
ideawise-tech-assignment/       ← Turborepo monorepo (pnpm)
├── apps/
│   ├── web/                    → React 18 + Vite (branch: feature/web)
│   ├── mobile/                 → Expo SDK 51 (branch: feature/mobile)
│   └── server/                 → Symfony 6.4 + PHP 8.2 (branch: feature/backend)
├── packages/
│   ├── upload-core/            → Shared TS upload logic (chunking, queue, retry)
│   ├── ui/                     → Shared React components
│   ├── eslint-config/
│   └── typescript-config/
└── docs/
    ├── architecture.md
    ├── api.md
    └── decisions.md
```

## Branch Strategy

| Branch | Content |
|--------|---------|
| `main` | Monorepo config + packages/upload-core + docs |
| `feature/backend` | Symfony 6.4 backend (apps/server) |
| `feature/web` | React 18 + Vite web app (apps/web) |
| `feature/mobile` | Expo mobile app (apps/mobile) |

## Stack

- **Backend:** PHP 8.2, Symfony 6.4 LTS, Doctrine ORM, SQLite
- **Web:** React 18, Vite, TypeScript, Tailwind CSS, Zustand
- **Mobile:** Expo SDK 51, React Native, TypeScript
- **Shared logic:** TypeScript (upload-core package)
- **Package manager:** pnpm 9 (monorepo), Composer (PHP)

## Development Setup

### Backend (apps/server)
```bash
cd apps/server
composer install
cp .env.example .env.local
php bin/console doctrine:migrations:migrate
symfony serve          # starts on http://localhost:8000
```

### Web (apps/web)
```bash
pnpm install           # from repo root
pnpm dev               # or: cd apps/web && pnpm dev
# starts on http://localhost:3000
```

### Mobile (apps/mobile)
```bash
pnpm install           # from repo root
cd apps/mobile
npx expo start
# scan QR with Expo Go app, or press 'a' for Android emulator
```

## Running Tests

```bash
# Backend
cd apps/server && php bin/phpunit --testdox

# Web + upload-core (from repo root)
pnpm test

# upload-core only
cd packages/upload-core && pnpm test
```

## Environment Variables

### Backend (.env.local)
```
APP_ENV=dev
APP_SECRET=change_me_in_production
DATABASE_URL=sqlite:///%kernel.project_dir%/var/data.db
CORS_ALLOW_ORIGIN=*
```

### Web (.env.local)
```
VITE_API_URL=http://localhost:8000
```

### Mobile (app.config.js or .env)
```
EXPO_PUBLIC_API_URL=http://localhost:8000
```

## Key Architecture Decisions

See `docs/decisions.md` for full ADRs. Summary:

- **SQLite over MySQL/Postgres:** Zero setup, ships with the repo. Migration to Postgres requires only changing `DATABASE_URL`.
- **Filesystem over Redis:** Chunk state stored in `var/uploads/{id}/` as `.part` files. A `ChunkStateRepository` interface makes switching to Redis trivial.
- **No real auth:** Header `X-User-Id` is required on all API calls. The system assumes an external auth layer provides the user ID. Documented as out of scope.
- **Expo over bare React Native:** Saves hours of native setup (permissions, camera, file picker solved out of the box).
- **No WebSockets:** Client knows its own progress — no server push needed for upload progress.

## API Endpoints

Base URL: `http://localhost:8000`

All endpoints require header: `X-User-Id: <user-id>`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/uploads/init` | Initialize a new upload session |
| PUT | `/api/uploads/{id}/chunks/{idx}` | Upload a single chunk |
| POST | `/api/uploads/{id}/finalize` | Finalize and assemble the file |
| GET | `/api/uploads/{id}/status` | Get upload status and received chunks |

See `docs/api.md` for full request/response documentation.

## Commit Conventions

```
feat(backend): add chunk upload endpoint
fix(web): handle pause during active chunk transfer
chore: update gitignore for symfony var/
```

## Out of Scope (MVP)

- Redis for chunk tracking
- Real authentication (JWT/OAuth)
- Background upload on mobile (iOS BGTaskScheduler / Android WorkManager)
- Real-time dashboard
- E2E tests (Playwright/Detox)
- Antimalware sandbox (ClamAV)
- Stress testing (plan documented in docs/)
