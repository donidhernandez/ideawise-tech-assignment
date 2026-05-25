# API Reference

Base URL: `http://localhost:8000`

All requests **must** include header `X-User-Id: <user-id>`. Requests without it
receive `401 Unauthorized`.

Rate limit: **60 requests/minute** per `X-User-Id` (sliding window). Exceeded
requests receive `429 Too Many Requests` with a `Retry-After` header.

---

## `POST /api/uploads/init`

Initialize a new chunked upload session.

### Request

```json
{
  "filename": "vacation.jpg",
  "size": 2621440,
  "mimeType": "image/jpeg",
  "totalChunks": 3,
  "md5": "optional 32-hex-char MD5 for early dedup"
}
```

- `totalChunks` must equal `ceil(size / chunkSize)` where `chunkSize` is
  returned in the response (default: 1,048,576 bytes / 1 MiB).
- If `md5` is provided and a completed upload with the same hash exists, the
  response short-circuits with `deduplicated: true` (no chunks need to be sent).

### Response — new upload (201 Created)

```json
{
  "uploadId": "01977c2d-94e3-7c10-8aab-3b8a3d6c7d11",
  "existingChunks": [],
  "chunkSize": 1048576
}
```

### Response — deduplicated (200 OK)

```json
{
  "deduplicated": true,
  "fileId": "01977c2d-94e3-7c10-8aab-3b8a3d6c7d11",
  "url": "/uploads/2026/05/25/abc...123_vacation.jpg"
}
```

### Errors

| Status | `error` code | Cause |
|--------|--------------|-------|
| 400 | `invalid_json` | Body is not valid JSON |
| 400 | `invalid_filename` | Missing or empty `filename` |
| 400 | `invalid_size` | `size` missing or ≤ 0 |
| 400 | `invalid_total_chunks` | `totalChunks` missing or ≤ 0 |
| 400 | `chunk_count_mismatch` | `totalChunks` doesn't match `ceil(size/chunkSize)` |
| 413 | `size_too_large` | `size` exceeds `MAX_UPLOAD_SIZE` |
| 415 | `unsupported_mime_type` | MIME type not in whitelist |

---

## `PUT /api/uploads/{uploadId}/chunks/{index}`

Upload a single binary chunk.

### Request

- **Content-Type:** `application/octet-stream`
- **Headers (optional):** `Content-MD5: <32-hex>` for per-chunk integrity check
- **Body:** raw chunk bytes (size = `chunkSize` for all but the last chunk)
- `index` is zero-based

### Response (200 OK)

```json
{
  "received": true,
  "index": 0,
  "receivedChunks": 1,
  "totalChunks": 3
}
```

### Notes

- Chunk 0 is sniffed via magic-number; if the detected MIME does not match the
  declared whitelist, the request is rejected with `415` and the upload moves
  to a failed state.
- Re-uploading the same `index` overwrites the chunk and does **not**
  re-increment `receivedChunks`.

### Errors

| Status | `error` code | Cause |
|--------|--------------|-------|
| 400 | `invalid_upload_id` | Malformed UUID |
| 400 | `empty_chunk` | Empty request body |
| 400 | `invalid_chunk_size` | Non-final chunk size ≠ `chunkSize` |
| 400 | `last_chunk_too_large` | Last chunk > `chunkSize` |
| 400 | `chunk_index_out_of_range` | `index` < 0 or ≥ `totalChunks` |
| 404 | `upload_not_found` | Wrong UUID or wrong user |
| 409 | `upload_not_pending` | Upload already finalized or failed |
| 415 | `mime_type_mismatch` | Chunk 0 magic-number rejected |
| 422 | `chunk_md5_mismatch` | `Content-MD5` header doesn't match body |

---

## `POST /api/uploads/{uploadId}/finalize`

Assemble all chunks, verify integrity, dedup, and commit to storage.

### Request

```json
{
  "md5": "32-hex MD5 of the full assembled file"
}
```

### Response (200 OK)

```json
{
  "fileId": "01977c2d-94e3-7c10-8aab-3b8a3d6c7d11",
  "url": "/uploads/2026/05/25/abc...123_vacation.jpg",
  "deduplicated": false
}
```

If `md5` matches a previously completed upload's hash, the current upload is
marked complete and points to the existing physical file (`deduplicated: true`).

### Errors

| Status | `error` code | Cause |
|--------|--------------|-------|
| 400 | `invalid_md5` | Missing or malformed MD5 |
| 404 | `upload_not_found` | Wrong UUID or wrong user |
| 409 | `missing_chunks` | `receivedChunks` ≠ `totalChunks` |
| 422 | `md5_mismatch` | Assembled file's MD5 ≠ declared MD5 |
| 500 | `assembly_failed` | Reassembly threw (corruption, IO error) |

---

## `GET /api/uploads/{uploadId}/status`

Returns the upload's current state. Used by the client to resume after
interruptions.

### Response (200 OK)

```json
{
  "uploadId": "01977c2d-94e3-7c10-8aab-3b8a3d6c7d11",
  "status": "pending",
  "totalChunks": 3,
  "uploadedChunks": [0, 1],
  "url": null
}
```

`status` is one of `pending`, `complete`, `failed`. `url` is populated only
when `status === "complete"`.

### Errors

| Status | `error` code | Cause |
|--------|--------------|-------|
| 400 | `invalid_upload_id` | Malformed UUID |
| 404 | `upload_not_found` | Wrong UUID or wrong user |

---

## Cleanup

Run via cron or manually:

```bash
php bin/console app:uploads:cleanup
php bin/console app:uploads:cleanup --dry-run
php bin/console app:uploads:cleanup --incomplete-minutes=60 --retention-days=7
```

Removes:
- Pending uploads older than `--incomplete-minutes` (default: 30)
- Completed uploads older than `--retention-days` (default: 30), only deleting
  the physical file when no other DB row references the same `storagePath`.
