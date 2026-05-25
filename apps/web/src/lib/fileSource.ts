import type { FileSource } from '@repo/upload-core';

/**
 * Adapts a browser `File` to the upload-core `FileSource` interface.
 * Uses Blob.arrayBuffer() so the reader never materializes the whole file
 * in memory at once.
 */
export function fileToSource(file: File): FileSource {
  return {
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    slice: (start, end) => file.slice(start, end).arrayBuffer(),
  };
}
