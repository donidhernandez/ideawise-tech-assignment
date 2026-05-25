export const MAX_FILES = 10;
export const MIN_FILES = 1;
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MiB — matches backend default

const ACCEPTED_PREFIXES = ['image/', 'video/'];

export interface FileRejection {
  file: File;
  reason: string;
}

export function validateSelection(files: File[]): { accepted: File[]; rejected: FileRejection[] } {
  const accepted: File[] = [];
  const rejected: FileRejection[] = [];

  for (const f of files) {
    if (!ACCEPTED_PREFIXES.some((p) => f.type.startsWith(p))) {
      rejected.push({ file: f, reason: `unsupported type: ${f.type || 'unknown'}` });
      continue;
    }
    if (f.size === 0) {
      rejected.push({ file: f, reason: 'empty file' });
      continue;
    }
    if (f.size > MAX_FILE_SIZE) {
      rejected.push({
        file: f,
        reason: `exceeds 500 MB (${(f.size / 1024 / 1024).toFixed(1)} MB)`,
      });
      continue;
    }
    accepted.push(f);
  }

  if (accepted.length > MAX_FILES) {
    const trimmed = accepted.splice(MAX_FILES);
    for (const f of trimmed) {
      rejected.push({ file: f, reason: `over ${MAX_FILES}-file limit` });
    }
  }

  return { accepted, rejected };
}
