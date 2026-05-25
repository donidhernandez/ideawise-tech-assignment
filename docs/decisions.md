# Architecture Decisions (ADRs)

Short records of the key technical decisions for the MVP. Each entry covers
the choice, the reasoning, and the migration path if the constraint changes.

---

## ADR-001: SQLite over MySQL/PostgreSQL

**Decision:** Persist uploads metadata in SQLite (`var/data_dev.db`).

**Why:** Zero setup — the database file ships with the repo and no external
service is required. The dataset for an MVP is tiny (one row per upload).
Doctrine abstracts the dialect, so the schema migrates cleanly to MySQL or
Postgres later.

**Migration path:** Change `DATABASE_URL` in `.env` and re-run
`doctrine:migrations:migrate`. No code change needed.

---

## ADR-002: Filesystem over Redis for chunk state

**Decision:** Chunk state is the presence of `var/uploads/{id}/{i}.part` files
plus the `receivedChunks` counter on the `Upload` entity.

**Why:** The advanced spec recommends Redis. For the MVP, the filesystem is
sufficient — it survives restarts, supports concurrent writes per chunk
(different files), and avoids running a Redis container. The `ChunkStorage`
service already isolates filesystem I/O, so a `RedisChunkStorage` could be
dropped in by satisfying the same public interface.

**Migration path:** Implement `App\Service\RedisChunkStorage` with the same
public surface as `ChunkStorage` and swap the binding in `services.yaml`.

---

## ADR-003: `X-User-Id` header instead of real authentication

**Decision:** Every `/api/` request must carry an `X-User-Id` header. The
backend trusts it as-is.

**Why:** The assignment doesn't require auth, and shipping JWT/OAuth in 4 days
trades against the actual core features (chunking, dedup, retry). The
`UserIdSubscriber` localizes the contract: replacing it with token validation
is one file's worth of work, and every controller already reads the user from
the request attribute (not from any session/cookie state).

**Migration path:** Replace `UserIdSubscriber` with a token-verifying
subscriber. Set `$request->attributes->set(UserIdSubscriber::ATTR_USER_ID, $verifiedUserId)`
and the rest of the application is unchanged.

---

## ADR-004: Magic-number check on chunk 0, not on every chunk

**Decision:** The MIME-type whitelist is enforced by `MagicNumberValidator`
exclusively against the first 4 KiB of chunk 0.

**Why:** Image and video container headers live in the file's leading bytes.
Sniffing every chunk would be both wasteful (chunks 1..N are payload, not
identifiable) and a false-negative source (a JPEG's middle bytes don't sniff
as `image/jpeg`). The declared MIME in `init` is treated as advisory; the
sniffed MIME on chunk 0 is authoritative.

**Trade-off:** A maliciously crafted file with a valid JPEG header but
malicious content elsewhere passes the check. Mitigating this requires an
antimalware sandbox (e.g. ClamAV), out of scope for the MVP.

---

## ADR-005: Per-chunk validation is optional

**Decision:** `Content-MD5` on `PUT /chunks/{i}` is optional. The full-file
MD5 is verified at `finalize` time.

**Why:** Per-chunk MD5 doubles client work (compute + send the hash) for
limited gain — a corrupted chunk is caught at finalize anyway. Making it
optional lets clients enable it for high-stakes transfers without forcing it
on simple ones.

---

## ADR-006: No WebSockets / SSE for progress

**Decision:** Progress is computed entirely client-side from chunk counts.

**Why:** The client knows exactly which chunks it has dispatched and which
have been acknowledged. A server push channel adds infrastructure (sticky
sessions, persistent connections) for information the client already owns.

---

## ADR-007: 1 MiB chunk size, 3 parallel uploads

**Decision:** Default `CHUNK_SIZE=1048576` (1 MiB), client concurrency = 3.

**Why:** 1 MiB is the sweet spot — small enough that retries are cheap on
mobile networks, large enough that HTTP overhead is amortized. Concurrency of
3 matches typical HTTP/1.1 browser behavior without saturating constrained
links.

Both values are configurable: chunk size in `.env`, concurrency in the
`upload-core` client constructor.

---

## ADR-008: Symfony 6.4 LTS, not 7.x

**Decision:** Symfony 6.4 LTS.

**Why:** The assignment explicitly calls out Symfony 6 (not 7). 6.4 is the LTS
that runs on PHP 8.2+ and has the longest support window. Symfony 7's API
differences would force unnecessary porting if the client environment is older.

---

## ADR-009: Storage layout — `var/storage/{YYYY/MM/DD}/{md5}_{filename}`

**Decision:** Final files are stored under date-partitioned directories with
the MD5 prefixed to the filename.

**Why:**

1. Date partitioning keeps any single directory small (avoiding filesystem
   degradation on millions of files).
2. The MD5 prefix makes deduplication trivial — two uploads with the same
   bytes literally point to the same file path; we don't even need symlinks.
3. The original filename is preserved (sanitized) so HTTP downloads carry a
   meaningful `Content-Disposition`.
