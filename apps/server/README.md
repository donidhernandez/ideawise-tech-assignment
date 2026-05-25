# Media Upload Backend — Symfony 6.4

REST API for chunked upload of images and videos.

## Requirements

- PHP 8.2+ (tested on 8.5)
- Composer 2
- SQLite (bundled with PHP)
- Symfony CLI (optional, for `symfony serve`)

## Setup

```bash
cd apps/server
composer install
cp .env.example .env.local                    # adjust if needed
php bin/console doctrine:database:create      # SQLite — safe to ignore "not supported" warning
php bin/console doctrine:migrations:migrate --no-interaction
symfony serve                                 # http://localhost:8000
# or: php -S 127.0.0.1:8000 -t public
```

## Running tests

```bash
php bin/phpunit --testdox
```

Expected: **23 tests, 54 assertions, all green.**

The test suite drops and recreates the SQLite test database (`var/data_test.db`)
on every run, so it is fully deterministic.

### Coverage

PHPUnit 13 only recognizes **Xdebug** or **PCOV** as coverage drivers
(`phpdbg` support was removed). Install one of them, then:

```bash
composer coverage
# or directly:
vendor/bin/phpunit --coverage-text --coverage-html=var/coverage
```

PCOV is the lightweight option (no debug overhead, ~1s on this suite):

- **Windows (chocolatey PHP):** download the matching pre-built DLL from
  https://pecl.php.net/package/pcov, place under `C:\tools\php85\ext\`,
  then add `extension=pcov` to `C:\tools\php85\php.ini`.
- **macOS / Linux:** `pecl install pcov` then enable in `php.ini`.

If neither is installed the script still runs but PHPUnit prints
"No code coverage driver available" and reports nothing. The 23 tests
themselves are unaffected.

## Routes

```bash
php bin/console debug:router
```

| Method | Path |
|--------|------|
| POST | `/api/uploads/init` |
| PUT | `/api/uploads/{uploadId}/chunks/{index}` |
| POST | `/api/uploads/{uploadId}/finalize` |
| GET | `/api/uploads/{uploadId}/status` |

See [`docs/api.md`](../../docs/api.md) for the full request/response spec.

## Cleanup

```bash
php bin/console app:uploads:cleanup           # production
php bin/console app:uploads:cleanup --dry-run # preview
```

## Architecture

- `src/Controller/Api/*` — 4 thin controllers
- `src/Service/` — `ChunkStorage`, `MagicNumberValidator`, `FileAssembler`, `DedupService`
- `src/EventSubscriber/` — `UserIdSubscriber` (auth), `RateLimitSubscriber` (60/min)
- `src/Command/CleanupUploadsCommand.php` — cron-friendly cleanup
- `src/Entity/Upload.php` — Doctrine entity
- `tests/Service/` — pure unit tests (no Kernel)
- `tests/Controller/` — `WebTestCase`-based functional tests

See [`docs/decisions.md`](../../docs/decisions.md) for ADRs.
