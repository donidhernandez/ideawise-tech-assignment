import type { ErrorCategory, UploadHandle, UploadStatus } from '@repo/upload-core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UploadItem {
  /** Stable client-generated id; survives re-renders. */
  localId: string;
  name: string;
  size: number;
  mimeType: string;
  /** Server-assigned id; populated after init. */
  uploadId: string | null;
  status: UploadStatus;
  uploadedBytes: number;
  /** 0..1 */
  ratio: number;
  /** Server URL of the finalized file; set on complete. */
  url: string | null;
  /** User-facing error message if status === 'failed'. */
  error: string | null;
  /** Coarse error bucket for the UI (icon / tone / retry button). */
  errorCategory: ErrorCategory | null;
  /** Object URL for image preview thumbnails; revoked on remove. */
  previewUrl: string | null;
  /** Was this upload deduplicated by the server? */
  deduplicated: boolean;
  /**
   * True when this row was rehydrated from a previous session — the
   * UploadHandle is gone (the browser can't preserve a File object
   * across reloads), so resuming requires the user to re-pick the
   * file. The UI surfaces a "Re-select file to continue" affordance.
   */
  orphaned: boolean;
}

/** Pruned shape kept in localStorage for the history panel. */
export interface HistoryEntry {
  localId: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  deduplicated: boolean;
  uploadedAt: number;
}

interface UploadStoreState {
  items: UploadItem[];
  history: HistoryEntry[];
  /** Map of live handles — kept outside the persisted state. */
  _handles: Map<string, UploadHandle>;
}

interface UploadStoreActions {
  addItem: (item: UploadItem, handle: UploadHandle) => void;
  patchItem: (localId: string, patch: Partial<UploadItem>) => void;
  removeItem: (localId: string) => void;
  /**
   * Drops the existing row entirely and re-adds it with a fresh handle.
   * Used by the orphan-resume flow when the user re-picks a file.
   */
  replaceItem: (localId: string, fresh: UploadItem, handle: UploadHandle) => void;
  pushHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
  getHandle: (localId: string) => UploadHandle | undefined;
  /**
   * Marks active rows as paused + orphaned. Runs after persist rehydrates,
   * since the in-memory _handles map is session-only.
   */
  rehydrateAsOrphans: () => void;
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
      history: [],
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
          const it = s.items.find((i) => i.localId === localId);
          if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
          const handles = new Map(s._handles);
          handles.delete(localId);
          return {
            items: s.items.filter((i) => i.localId !== localId),
            _handles: handles,
          };
        }),

      replaceItem: (localId, fresh, handle) =>
        set((s) => {
          const existing = s.items.find((i) => i.localId === localId);
          if (existing?.previewUrl && existing.previewUrl !== fresh.previewUrl) {
            URL.revokeObjectURL(existing.previewUrl);
          }
          const handles = new Map(s._handles);
          handles.set(localId, handle);
          return {
            items: s.items.map((it) => (it.localId === localId ? fresh : it)),
            _handles: handles,
          };
        }),

      pushHistory: (entry) =>
        set((s) => ({ history: [entry, ...s.history].slice(0, 20) })),

      clearHistory: () => set({ history: [] }),

      getHandle: (localId) => get()._handles.get(localId),

      rehydrateAsOrphans: () =>
        set((s) => ({
          items: s.items.map((it) =>
            ACTIVE_STATUSES.includes(it.status)
              ? {
                  ...it,
                  status: 'paused' as const,
                  // File handles + Blob URLs can't survive a reload.
                  previewUrl: null,
                  orphaned: true,
                }
              : it
          ),
        })),
    }),
    {
      name: 'media-uploader-queue',
      // Persist both items and history. _handles is session-only by design.
      partialize: (state) => ({ items: state.items, history: state.history }),
      onRehydrateStorage: () => (state) => {
        state?.rehydrateAsOrphans();
      },
    }
  )
);
