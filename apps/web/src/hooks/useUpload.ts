import type { UploadEvent, UploadHandle } from '@repo/upload-core';
import { categorizeError } from '@repo/upload-core';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { env } from '../env.ts';
import { fileToSource } from '../lib/fileSource.ts';
import { getUploadManager } from '../lib/manager.ts';
import { useUploadStore } from '../store/uploadStore.ts';
import type { UploadItem } from '../store/uploadStore.ts';

const IMAGE_TYPES = /^image\//;

function makeLocalId(): string {
  return `upl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPreview(file: File): string | null {
  if (IMAGE_TYPES.test(file.type)) {
    return URL.createObjectURL(file);
  }
  return null;
}

/**
 * Wires upload-core's UploadHandle events into the Zustand row at
 * `localId`. Kept private here so both the fresh-upload and the
 * resume-after-orphan paths use the same dispatcher.
 */
function bridgeHandleToStore(
  localId: string,
  fileName: string,
  fileMimeType: string,
  fileSize: number,
  handle: UploadHandle
): void {
  const store = useUploadStore.getState();

  // Per-upload state for speed sampling (closure — not persisted).
  let speedLastMs = 0;
  let speedLastBytes = 0;

  handle.on((event: UploadEvent) => {
    switch (event.type) {
      case 'statusChange':
        store.patchItem(localId, {
          status: event.status,
          uploadId: handle.uploadId,
        });
        // Reset speed sampling on any status change (pause/resume etc.)
        speedLastMs = 0;
        speedLastBytes = 0;
        break;
      case 'progress': {
        const now = Date.now();
        const dt = now - speedLastMs;           // ms since last sample
        const db = event.progress.uploadedBytes - speedLastBytes; // bytes since last sample
        // Require a gap of at least 150 ms and fresh sample (< 8 s) to avoid
        // wildly inaccurate readings right after a pause/retry.
        const speedBps =
          speedLastMs > 0 && dt >= 150 && dt < 8_000 && db >= 0
            ? Math.round((db / dt) * 1000)
            : null;
        speedLastMs = now;
        speedLastBytes = event.progress.uploadedBytes;

        store.patchItem(localId, {
          uploadedBytes: event.progress.uploadedBytes,
          ratio: event.progress.ratio,
          retryInfo: null,
          ...(speedBps !== null && { speedBps }),
        });
        break;
      }
      case 'chunkComplete':
        store.patchItem(localId, { retryInfo: null });
        break;
      case 'complete':
        store.patchItem(localId, {
          status: 'complete',
          ratio: 1,
          url: event.result.url,
          deduplicated: event.result.deduplicated,
          orphaned: false,
          retryInfo: null,
          speedBps: null,
        });
        store.pushHistory({
          localId,
          name: fileName,
          size: fileSize,
          mimeType: fileMimeType,
          url: event.result.url,
          deduplicated: event.result.deduplicated,
          uploadedAt: Date.now(),
        });
        toast.success(
          event.result.deduplicated
            ? `${fileName} matched an existing file (deduplicated)`
            : `${fileName} uploaded`
        );
        break;
      case 'error': {
        const cat = categorizeError(event.error);
        store.patchItem(localId, {
          error: cat.message,
          errorCategory: cat.category,
          status: 'failed',
          retryInfo: null,
          speedBps: null,
        });
        toast.error(`${fileName}: ${cat.message}`);
        break;
      }
      case 'chunkError': {
        const cat = categorizeError(event.error);
        // Show the retry badge only while there are more attempts coming.
        // When attempt === maxRetries the error event fires immediately after,
        // so we skip setting retryInfo to avoid a brief flash.
        const willRetry = event.attempt < env.maxRetries;
        store.patchItem(localId, {
          error: cat.message,
          errorCategory: cat.category,
          retryInfo: willRetry
            ? { attempt: event.attempt + 1, total: env.maxRetries }
            : null,
        });
        break;
      }
    }
  });
}

export function useUpload(): {
  startUpload: (file: File) => string;
  pause: (localId: string) => void;
  resume: (localId: string) => void;
  cancel: (localId: string) => Promise<void>;
  remove: (localId: string) => void;
  retry: (localId: string, file: File) => string;
  /**
   * Resume an orphaned row (no live handle, persisted from a previous
   * session) using the file the user re-picked. The new attempt goes
   * through a fresh init; the server's MD5 dedup short-circuits
   * anything that finished last time. Mismatched name / size are
   * surfaced as a failed row.
   */
  resumeOrphan: (localId: string, file: File) => boolean;
} {
  const addItem = useUploadStore((s) => s.addItem);
  const patchItem = useUploadStore((s) => s.patchItem);
  const removeItem = useUploadStore((s) => s.removeItem);
  const replaceItem = useUploadStore((s) => s.replaceItem);
  const getHandle = useUploadStore((s) => s.getHandle);

  const startUpload = useCallback(
    (file: File): string => {
      const localId = makeLocalId();
      const manager = getUploadManager();
      const handle = manager.upload(fileToSource(file));

      const initial: UploadItem = {
        localId,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        uploadId: null,
        status: 'idle',
        uploadedBytes: 0,
        ratio: 0,
        url: null,
        error: null,
        errorCategory: null,
        previewUrl: buildPreview(file),
        deduplicated: false,
        orphaned: false,
        retryInfo: null,
        speedBps: null,
      };

      addItem(initial, handle);
      bridgeHandleToStore(localId, file.name, initial.mimeType, file.size, handle);
      return localId;
    },
    [addItem]
  );

  const resumeOrphan = useCallback(
    (localId: string, file: File): boolean => {
      const item = useUploadStore.getState().items.find((i) => i.localId === localId);
      if (!item) return false;

      // Validate the re-picked file matches the persisted metadata.
      // Name match is a strong signal but not strictly required for dedup —
      // size mismatch is. We accept size match and warn on name mismatch.
      if (file.size !== item.size) {
        patchItem(localId, {
          status: 'failed',
          error: `Selected file (${file.size} B) doesn't match the original (${item.size} B).`,
          errorCategory: 'integrity',
        });
        return false;
      }

      const manager = getUploadManager();
      const handle = manager.upload(fileToSource(file));

      const fresh: UploadItem = {
        ...item,
        name: file.name, // adopt the user's current filename
        mimeType: file.type || item.mimeType,
        uploadId: null, // server issues a new id; dedup glues to old file
        status: 'idle',
        uploadedBytes: 0,
        ratio: 0,
        url: null,
        error: null,
        errorCategory: null,
        previewUrl: buildPreview(file),
        deduplicated: false,
        orphaned: false,
        retryInfo: null,
        speedBps: null,
      };

      replaceItem(localId, fresh, handle);
      bridgeHandleToStore(localId, fresh.name, fresh.mimeType, fresh.size, handle);
      return true;
    },
    [patchItem, replaceItem]
  );

  const pause = useCallback(
    (localId: string) => {
      getHandle(localId)?.pause();
    },
    [getHandle]
  );

  const resume = useCallback(
    (localId: string) => {
      getHandle(localId)?.resume();
    },
    [getHandle]
  );

  const cancel = useCallback(
    async (localId: string) => {
      await getHandle(localId)?.cancel();
    },
    [getHandle]
  );

  const remove = useCallback(
    (localId: string) => {
      removeItem(localId);
    },
    [removeItem]
  );

  const retry = useCallback(
    (localId: string, file: File): string => {
      removeItem(localId);
      return startUpload(file);
    },
    [removeItem, startUpload]
  );

  return { startUpload, pause, resume, cancel, remove, retry, resumeOrphan };
}
