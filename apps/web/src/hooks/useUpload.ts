import type { UploadEvent } from '@repo/upload-core';
import { categorizeError } from '@repo/upload-core';
import { useCallback } from 'react';
import { toast } from 'sonner';
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

export function useUpload(): {
  startUpload: (file: File) => string;
  pause: (localId: string) => void;
  resume: (localId: string) => void;
  cancel: (localId: string) => Promise<void>;
  remove: (localId: string) => void;
  retry: (localId: string, file: File) => string;
} {
  const addItem = useUploadStore((s) => s.addItem);
  const patchItem = useUploadStore((s) => s.patchItem);
  const removeItem = useUploadStore((s) => s.removeItem);
  const pushHistory = useUploadStore((s) => s.pushHistory);
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
      };

      addItem(initial, handle);

      handle.on((event: UploadEvent) => {
        switch (event.type) {
          case 'statusChange':
            patchItem(localId, {
              status: event.status,
              uploadId: handle.uploadId,
            });
            break;
          case 'progress':
            patchItem(localId, {
              uploadedBytes: event.progress.uploadedBytes,
              ratio: event.progress.ratio,
            });
            break;
          case 'complete':
            patchItem(localId, {
              status: 'complete',
              ratio: 1,
              url: event.result.url,
              deduplicated: event.result.deduplicated,
            });
            pushHistory({
              localId,
              name: file.name,
              size: file.size,
              mimeType: file.type || 'application/octet-stream',
              url: event.result.url,
              deduplicated: event.result.deduplicated,
              uploadedAt: Date.now(),
            });
            toast.success(
              event.result.deduplicated
                ? `${file.name} matched an existing file (deduplicated)`
                : `${file.name} uploaded`
            );
            break;
          case 'error': {
            const cat = categorizeError(event.error);
            patchItem(localId, {
              error: cat.message,
              errorCategory: cat.category,
              status: 'failed',
            });
            toast.error(`${file.name}: ${cat.message}`);
            break;
          }
          case 'chunkError': {
            // Surface the most recent transient error inline; not toasted
            // because the retry loop may still recover.
            const cat = categorizeError(event.error);
            patchItem(localId, { error: cat.message, errorCategory: cat.category });
            break;
          }
        }
      });

      return localId;
    },
    [addItem, patchItem, pushHistory]
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

  return { startUpload, pause, resume, cancel, remove, retry };
}
