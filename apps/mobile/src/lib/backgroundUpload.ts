import type { UploadEvent } from '@repo/upload-core';
import { categorizeError } from '@repo/upload-core';
import * as BackgroundTask from 'expo-background-task';
import { File } from 'expo-file-system';
import * as TaskManager from 'expo-task-manager';
import { assetToSource } from './expoFileSource';
import { getUploadManager } from './manager';
import { useUploadStore, type UploadItem } from '../store/uploadStore';

/** Internal task name registered with TaskManager. */
export const BACKGROUND_UPLOAD_TASK = 'app/background-upload-resume';

/**
 * Statuses where it makes sense to attempt resume.
 * - `paused` items came from the rehydrate-as-orphans pass after a relaunch.
 * - `failed` items are not retried automatically; the user explicitly retries.
 * - `idle`/`initializing`/`uploading`/`finalizing` shouldn't survive into
 *   a fresh session because the rehydrate pass demotes them to `paused`.
 */
const RESUMABLE_STATUSES = new Set<UploadItem['status']>(['paused']);

/**
 * For every item in the persisted queue that lacks a live handle but is
 * resumable, re-issue the upload from scratch against the same source URI.
 * The server's MD5 dedup will short-circuit anything that finished in a
 * previous session.
 *
 * Items whose `sourceUri` no longer points to a readable file (OS purged
 * the cache, user deleted from gallery) are marked as failed.
 */
export async function resumePendingUploads(): Promise<{ resumed: number; dropped: number }> {
  const store = useUploadStore.getState();
  const candidates = store.items.filter(
    (it) => RESUMABLE_STATUSES.has(it.status) && !store.getHandle(it.localId)
  );

  let resumed = 0;
  let dropped = 0;

  for (const item of candidates) {
    const fileExists = await safeExists(item.sourceUri);
    if (!fileExists) {
      store.patchItem(item.localId, {
        status: 'failed',
        error: 'Source file is no longer available.',
        errorCategory: 'unknown',
      });
      dropped++;
      continue;
    }

    try {
      const manager = getUploadManager();
      const handle = manager.upload(
        assetToSource({
          uri: item.sourceUri,
          fileName: item.name,
          mimeType: item.mimeType,
          fileSize: item.size,
        })
      );

      // Attach a fresh listener so the persisted row keeps updating.
      handle.on((event: UploadEvent) => bridgeEvent(item.localId, item.name, event, handle));

      // Replace the (missing) handle entry by adding the item again would
      // duplicate the row, so we patch instead and re-register the handle
      // via the store's internal handles map.
      store.removeItem(item.localId);
      store.addItem({ ...item, status: 'idle', uploadedBytes: 0, ratio: 0, error: null }, handle);
      resumed++;
    } catch (e) {
      const cat = categorizeError(e);
      store.patchItem(item.localId, {
        status: 'failed',
        error: cat.message,
        errorCategory: cat.category,
      });
      dropped++;
    }
  }

  return { resumed, dropped };
}

/**
 * Mirrors what useUpload.startUpload does — kept here so the resume path
 * doesn't need to depend on the React hook context.
 */
function bridgeEvent(
  localId: string,
  name: string,
  event: UploadEvent,
  handle: { uploadId: string | null }
): void {
  const store = useUploadStore.getState();
  switch (event.type) {
    case 'statusChange':
      store.patchItem(localId, { status: event.status, uploadId: handle.uploadId });
      break;
    case 'progress':
      store.patchItem(localId, {
        uploadedBytes: event.progress.uploadedBytes,
        ratio: event.progress.ratio,
      });
      break;
    case 'complete':
      store.patchItem(localId, {
        status: 'complete',
        ratio: 1,
        url: event.result.url,
        deduplicated: event.result.deduplicated,
      });
      break;
    case 'error': {
      const cat = categorizeError(event.error);
      store.patchItem(localId, {
        error: cat.message,
        errorCategory: cat.category,
        status: 'failed',
      });
      // Silence in background — no toast, no Alert.
      void name;
      break;
    }
  }
}

async function safeExists(uri: string): Promise<boolean> {
  try {
    const f = new File(uri);
    return f.exists;
  } catch {
    return false;
  }
}

/**
 * Defines the TaskManager task that the OS may invoke periodically while
 * the app is backgrounded. MUST be called at module top level so the
 * definition exists before Expo's runtime restores the task on a cold
 * launch.
 */
export function defineBackgroundUploadTask(): void {
  if (TaskManager.isTaskDefined(BACKGROUND_UPLOAD_TASK)) return;
  TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async () => {
    try {
      const { resumed } = await resumePendingUploads();
      return resumed > 0
        ? BackgroundTask.BackgroundTaskResult.Success
        : BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/**
 * Registers the task with the OS scheduler.
 *
 * NOTE on platform limits:
 *   - Android (WorkManager): minimum interval 15 minutes.
 *   - iOS (BGTaskScheduler):  the OS decides when. May not fire at all if
 *     the user force-quits the app or if the device hasn't learned the
 *     usage pattern yet.
 *
 * NOTE on Expo Go:
 *   - expo-background-task requires a development client or production
 *     build to run reliably. In Expo Go the registration silently no-ops.
 *
 * Call this once on app mount.
 */
export async function registerBackgroundUploadTask(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      return; // user/device disabled background activity
    }
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_UPLOAD_TASK)) {
      return;
    }
    await BackgroundTask.registerTaskAsync(BACKGROUND_UPLOAD_TASK, {
      minimumInterval: 15, // minutes — the floor on Android; iOS is system-decided
    });
  } catch {
    // Not fatal — foreground resume still works.
  }
}
