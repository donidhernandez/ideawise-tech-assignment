import type { UploadEvent } from '@repo/upload-core';
import { categorizeError } from '@repo/upload-core';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { env } from '@/lib/env';
import { assetToSource } from '@/lib/expoFileSource';
import { deriveName, inferMime, makeLocalId, type InferenceAsset } from '@/lib/inference';
import { getUploadManager } from '@/lib/manager';
import { useUploadStore, type UploadItem } from '@/store/uploadStore';

interface PickedAsset extends InferenceAsset {
  fileSize?: number;
}

export function useUpload(): {
  startUpload: (asset: PickedAsset) => string | null;
  pause: (localId: string) => void;
  resume: (localId: string) => void;
  cancel: (localId: string) => Promise<void>;
  remove: (localId: string) => void;
} {
  const addItem = useUploadStore((s) => s.addItem);
  const patchItem = useUploadStore((s) => s.patchItem);
  const removeItem = useUploadStore((s) => s.removeItem);
  const getHandle = useUploadStore((s) => s.getHandle);

  const startUpload = useCallback(
    (raw: PickedAsset): string | null => {
      const mimeType = inferMime(raw);
      const asset = { ...raw, mimeType };

      if (asset.fileSize === undefined || asset.fileSize === 0) {
        Alert.alert('Skipped', `${asset.fileName ?? 'file'} has zero size.`);
        return null;
      }

      const localId = makeLocalId();
      const manager = getUploadManager();
      let handle;
      try {
        handle = manager.upload(assetToSource(asset));
      } catch (e) {
        Alert.alert('Upload error', e instanceof Error ? e.message : String(e));
        return null;
      }

      const initial: UploadItem = {
        localId,
        name: asset.fileName ?? deriveName(asset.uri),
        size: asset.fileSize,
        mimeType,
        sourceUri: asset.uri,
        uploadId: null,
        status: 'idle',
        uploadedBytes: 0,
        ratio: 0,
        url: null,
        error: null,
        errorCategory: null,
        deduplicated: false,
        retryInfo: null,
      };

      addItem(initial, handle);

      handle.on((event: UploadEvent) => {
        switch (event.type) {
          case 'statusChange':
            patchItem(localId, { status: event.status, uploadId: handle.uploadId });
            break;
          case 'progress':
            patchItem(localId, {
              uploadedBytes: event.progress.uploadedBytes,
              ratio: event.progress.ratio,
              retryInfo: null,
            });
            break;
          case 'chunkComplete':
            patchItem(localId, { retryInfo: null });
            break;
          case 'complete':
            patchItem(localId, {
              status: 'complete',
              ratio: 1,
              url: event.result.url,
              deduplicated: event.result.deduplicated,
              retryInfo: null,
            });
            break;
          case 'error': {
            const cat = categorizeError(event.error);
            patchItem(localId, {
              error: cat.message,
              errorCategory: cat.category,
              status: 'failed',
              retryInfo: null,
            });
            break;
          }
          case 'chunkError': {
            const cat = categorizeError(event.error);
            const willRetry = event.attempt < env.maxRetries;
            patchItem(localId, {
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

      return localId;
    },
    [addItem, patchItem]
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

  return { startUpload, pause, resume, cancel, remove };
}
