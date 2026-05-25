import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ErrorCategory, UploadHandle, UploadStatus } from '@repo/upload-core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface UploadItem {
  localId: string;
  name: string;
  size: number;
  mimeType: string;
  /** Local file URI of the source (used for thumbnails). */
  sourceUri: string;
  uploadId: string | null;
  status: UploadStatus;
  uploadedBytes: number;
  ratio: number;
  url: string | null;
  /** User-facing error message if status === 'failed'. */
  error: string | null;
  /** Coarse error bucket for the UI. */
  errorCategory: ErrorCategory | null;
  deduplicated: boolean;
  /**
   * Set while a chunk is waiting in the backoff delay between retry attempts.
   * `attempt` is the next attempt number; `total` is the configured max.
   * Null when not retrying.
   */
  retryInfo: { attempt: number; total: number } | null;
}

interface UploadStoreState {
  items: UploadItem[];
  /** Map of live handles — session-only, never persisted. */
  _handles: Map<string, UploadHandle>;
}

interface UploadStoreActions {
  addItem: (item: UploadItem, handle: UploadHandle) => void;
  patchItem: (localId: string, patch: Partial<UploadItem>) => void;
  removeItem: (localId: string) => void;
  /**
   * Marks a previously-persisted item as orphaned after a relaunch — there
   * is no live handle for it, so the UI offers Resume (via /status check)
   * or Remove. Status is forced to `paused` so the user sees the choice.
   */
  rehydrateAsOrphans: () => void;
  getHandle: (localId: string) => UploadHandle | undefined;
}

const ACTIVE_STATUSES: ReadonlyArray<UploadStatus> = [
  'idle',
  'initializing',
  'uploading',
  'paused',
  'finalizing',
];

export const useUploadStore = create<UploadStoreState & UploadStoreActions>()(
  persist(
    (set, get) => ({
      items: [],
      _handles: new Map(),

      addItem: (item, handle) =>
        set((s) => {
          const handles = new Map(s._handles);
          handles.set(item.localId, handle);
          return { items: [...s.items, item], _handles: handles };
        }),

      patchItem: (localId, patch) =>
        set((s) => ({
          items: s.items.map((it) => (it.localId === localId ? { ...it, ...patch } : it)),
        })),

      removeItem: (localId) =>
        set((s) => {
          const handles = new Map(s._handles);
          handles.delete(localId);
          return {
            items: s.items.filter((i) => i.localId !== localId),
            _handles: handles,
          };
        }),

      rehydrateAsOrphans: () =>
        set((s) => ({
          items: s.items.map((it) =>
            ACTIVE_STATUSES.includes(it.status) ? { ...it, status: 'paused' as const } : it
          ),
        })),

      getHandle: (localId) => get()._handles.get(localId),
    }),
    {
      name: 'mobile-upload-queue',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the items array; handles are session-only by design.
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        // After persisted items load back, mark active-but-handle-less rows as paused.
        state?.rehydrateAsOrphans();
      },
    }
  )
);
