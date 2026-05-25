/**
 * Maps the API's machine-readable `error` codes (and the platform-level
 * errors that surface during upload) to user-facing categories and copy.
 *
 * Categories are deliberately coarse — the UI only needs to know
 * "what bucket is this" so it can pick an icon / tone / retry action.
 */

export type ErrorCategory =
  | 'invalid_type'
  | 'file_too_large'
  | 'network'
  | 'rate_limited'
  | 'integrity'
  | 'auth'
  | 'server'
  | 'unknown';

export interface CategorizedError {
  category: ErrorCategory;
  /** Short user-facing message — fits in a toast or row. */
  message: string;
  /** True if a retry has a chance of succeeding without user intervention. */
  retryable: boolean;
}

/**
 * Inspects an Error / HttpError-ish object and produces a category + message.
 * Accepts either a plain Error (e.g. from a network failure) or an object
 * shaped like `{ status, body }` where body may include an `error` code.
 */
export function categorizeError(input: unknown): CategorizedError {
  // HttpError or similar { status, body: { error } }
  if (typeof input === 'object' && input !== null && 'status' in input) {
    const status = (input as { status: unknown }).status;
    const body = (input as { body?: unknown }).body;
    const code = bodyErrorCode(body);

    if (typeof status === 'number') {
      if (code) {
        const byCode = byErrorCode(code);
        if (byCode) return byCode;
      }
      return byHttpStatus(status, code);
    }
  }

  // Plain Error / unknown — heuristics on the message.
  const message = input instanceof Error ? input.message : String(input);
  if (/network|fetch|connect|timeout|offline/i.test(message)) {
    return {
      category: 'network',
      message: 'Connection problem — check your network and try again.',
      retryable: true,
    };
  }
  if (/canceled|cancelled|abort/i.test(message)) {
    return { category: 'unknown', message: 'Upload canceled.', retryable: false };
  }
  return { category: 'unknown', message: message || 'Something went wrong.', retryable: true };
}

function bodyErrorCode(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === 'string') return e;
  }
  return null;
}

function byErrorCode(code: string): CategorizedError | null {
  switch (code) {
    case 'unsupported_mime_type':
    case 'mime_type_mismatch':
      return {
        category: 'invalid_type',
        message: "That file type isn't allowed. Please pick an image or a video.",
        retryable: false,
      };

    case 'size_too_large':
      return {
        category: 'file_too_large',
        message: 'That file exceeds the 500 MB limit.',
        retryable: false,
      };

    case 'rate_limited':
      return {
        category: 'rate_limited',
        message: 'Too many requests — wait a moment and try again.',
        retryable: true,
      };

    case 'md5_mismatch':
    case 'chunk_md5_mismatch':
      return {
        category: 'integrity',
        message: 'The file was corrupted in transit. Retrying may help.',
        retryable: true,
      };

    case 'missing_user_id':
      return {
        category: 'auth',
        message: 'Not signed in. Please reload the app.',
        retryable: false,
      };

    case 'missing_chunks':
    case 'assembly_failed':
      return {
        category: 'server',
        message: 'The server could not finalize the upload. Retrying may help.',
        retryable: true,
      };

    case 'invalid_total_chunks':
    case 'chunk_count_mismatch':
    case 'invalid_chunk_size':
    case 'last_chunk_too_large':
    case 'chunk_index_out_of_range':
    case 'invalid_md5':
    case 'invalid_filename':
    case 'invalid_size':
    case 'invalid_upload_id':
    case 'invalid_json':
      return {
        category: 'server',
        message: 'Unexpected protocol error. Please retry the upload.',
        retryable: true,
      };

    case 'upload_not_found':
      return {
        category: 'server',
        message: 'Upload session expired. Please start over.',
        retryable: false,
      };

    case 'empty_chunk':
      return {
        category: 'integrity',
        message: 'Empty data received. Please retry.',
        retryable: true,
      };
  }
  return null;
}

function byHttpStatus(status: number, code: string | null): CategorizedError {
  if (status === 401 || status === 403) {
    return { category: 'auth', message: 'Not authorized.', retryable: false };
  }
  if (status === 413) {
    return { category: 'file_too_large', message: 'That file exceeds the size limit.', retryable: false };
  }
  if (status === 415) {
    return { category: 'invalid_type', message: "That file type isn't allowed.", retryable: false };
  }
  if (status === 429) {
    return { category: 'rate_limited', message: 'Too many requests — wait a moment.', retryable: true };
  }
  if (status >= 500) {
    return { category: 'server', message: `Server error (${status}). Retrying may help.`, retryable: true };
  }
  if (status >= 400) {
    return {
      category: 'server',
      message: code ? `Request rejected: ${code}` : `Request rejected (${status}).`,
      retryable: false,
    };
  }
  return { category: 'unknown', message: 'Something went wrong.', retryable: true };
}
