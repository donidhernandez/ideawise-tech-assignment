import { File, FileMode } from 'expo-file-system';
import type { FileSource } from '@repo/upload-core';

interface AssetLike {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number;
}

/**
 * Adapts an Expo ImagePicker asset (or any URI + size + mimeType) to the
 * upload-core `FileSource` interface, using the SDK 56 File / FileHandle
 * API to read byte ranges without loading the whole file into memory.
 *
 * NOTE: We open a fresh FileHandle for each slice() call. UploadManager
 * may call slice from multiple async tasks concurrently; sharing a single
 * handle would corrupt the offset.
 */
export function assetToSource(asset: AssetLike): FileSource {
  const file = new File(asset.uri);
  const size = asset.fileSize ?? file.size ?? 0;

  return {
    name: asset.fileName ?? deriveName(asset.uri),
    size,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    slice: async (start, end) => {
      const length = end - start;
      const handle = file.open(FileMode.ReadOnly);
      try {
        handle.offset = start;
        const bytes = handle.readBytes(length);
        // Make a fresh ArrayBuffer copy so the caller owns the memory.
        const out = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(out).set(bytes);
        return out;
      } finally {
        handle.close();
      }
    },
  };
}

function deriveName(uri: string): string {
  const tail = uri.split('/').pop() ?? `capture-${Date.now()}`;
  return decodeURIComponent(tail);
}
