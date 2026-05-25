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

## ADR-009: Storage layout — `var/storage/{userId}/{YYYY/MM/DD}/{md5}_{filename}`

**Decision:** Final files are stored under per-user, date-partitioned
directories with the MD5 prefixed to the filename.

**Why:**

1. The spec explicitly asks for storage "organized by date/user" — the path
   structure satisfies the literal requirement and makes it trivial to list
   one user's uploads from disk if the DB is unavailable.
2. Date partitioning keeps any single directory small.
3. The MD5 prefix makes per-user deduplication trivial.
4. The original filename is preserved (sanitized) so HTTP downloads carry a
   meaningful `Content-Disposition`.

**Cross-user dedup:** still works at the DB level. When an upload finalizes
with an MD5 that already exists for *any* user, the new DB row points to the
original file's `storagePath` rather than writing a second copy. The path
prefix in that case is the *original* uploader's user id; from the API's
standpoint this is invisible (each user only ever sees URLs the server
hands back to them).

---

## ADR-010: Rate limiter split into two buckets (10/min init, 600/min chunk)

**Decision:** Two rate-limiter buckets keyed off `X-User-Id`:
- `api_upload_init`: 10 requests/minute (matches the literal spec)
- `api_upload_chunk`: 600 requests/minute (everything else under `/api/`)

**Why:** A single global `10 requests/minute` bucket would make any upload
of more than ~7 MiB impossible (a 7 MiB file at 1 MiB chunks plus `init` +
`finalize` + a status check already exceeds 10). The spec's "upload rate
limiting" is clearly aimed at session creation (preventing abuse of
`/init`) rather than the chunk traffic *inside* an authorized session.
Splitting the buckets honors both intents.

**Trade-off:** A misbehaving client can still exhaust the chunk quota
(600/min ≈ 10 chunks/second per user). For the MVP that's acceptable.
Production-grade hardening would add a per-IP bucket and a sliding-window
size limit (e.g. bytes/minute).

---

## ADR-011: Error categorization shared between web and mobile

**Decision:** `@repo/upload-core` ships a `categorizeError(err)` helper
that maps API error codes (`unsupported_mime_type`, `size_too_large`,
`md5_mismatch`, …) and platform-level errors (network, timeout) to a
coarse category enum and a user-facing message.

**Why:** The spec asks for "categorized error messages (file too
large / invalid type / network issues)". Centralizing the mapping in
upload-core ensures the web and mobile clients show the *same* category
for the same backend response, which matters when triaging support
tickets. The UI layer keeps full control over icon, color, and copy by
keying off the returned `category` enum.

---

## ADR-012: Mobile binary uploads bypass `fetch` (Expo native upload API)

**Decision:** On Expo (RN 0.85), binary chunk PUTs go through
`File.upload(url, { uploadType: BINARY_CONTENT })` instead of `fetch()`.
Each chunk is materialized to a temp file in `Paths.cache`, uploaded, and
deleted.

**Why:** React Native's `fetch` does not send `ArrayBuffer` request
bodies byte-for-byte — the upload succeeds at the HTTP layer but the
server's reassembled MD5 never matches the client's. Wrapping in
`new Blob([new Uint8Array(buf)])` is not a workaround either: RN throws
*"Creating blobs from ArrayBuffer and ArrayBufferView are not supported"*.
Expo's native upload API streams bytes directly off disk and arrives
intact. The temp-file write is the cost of using a binary-safe transport
without rewriting upload-core's chunk-driven flow.

**Cancellation trade-off:** Expo's `UploadOptions` does not accept an
`AbortSignal`. Cancel/pause during an in-flight *chunk* therefore cannot
interrupt the native upload; the next chunk slot will see the abort and
stop dispatching. For the MVP this is acceptable — pause/resume between
chunks is the user-facing guarantee, not mid-chunk.

---

## ADR-013: Mobile background upload — `sessionType: 'background'` + TaskManager + persisted queue

**Decision:** Background upload support is a layered concession to OS
realities rather than a single switch:

1. **In-flight chunks survive backgrounding** because the underlying
   `File.upload(...)` call passes `sessionType: 'background'` (the SDK 56
   default). On iOS this hands the transfer to a background
   `NSURLSession`; on Android the in-process upload also survives a
   home-button press while the process is alive.

2. **Queue state survives app termination** via Zustand's `persist`
   middleware backed by AsyncStorage (`mobile-upload-queue`). On
   rehydrate, any item that was "in flight" the last time the app ran is
   demoted to `paused` because its in-memory `UploadHandle` is gone.

3. **Resume happens on three triggers:** initial mount, app foreground
   (via `AppState.addEventListener('change')`), and an OS-scheduled
   `BackgroundTask` registered with `expo-background-task`. All three
   call the same `resumePendingUploads()` helper, which re-issues each
   paused upload with the original `sourceUri`. The server's MD5 dedup
   short-circuits anything that already finalized in the previous
   session.

**Why not a true byte-range resume:** Restarting the upload from chunk 0
with dedup is functionally equivalent to "resume from byte N" for the
end user when the file already exists on the server; it costs one
init+finalize round trip if it doesn't. Implementing real byte-range
resume would require the backend's `/init` to accept an existing
`uploadId` and return `existingChunks` populated from the filesystem —
small change, deferred until the assessment proves we need it.

**Known limits (documented in apps/mobile/README.md):**
- iOS `BGTaskScheduler` is OS-discretionary. The 15-minute "minimum"
  in our `registerTaskAsync` call is a hint, not a guarantee.
- `expo-background-task` only fires reliably in a dev client or
  production build. In Expo Go the registration silently no-ops.
- Android transfers can survive backgrounding but are killed if the OS
  reclaims the process. WorkManager-backed continuation would require
  a custom native module beyond the v56 surface.
