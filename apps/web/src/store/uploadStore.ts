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
  pushHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
  getHandle: (localId: string) => UploadHandle | undefined;
}

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

      pushHistory: (entry) =>
        set((s) => ({ history: [entry, ...s.history].slice(0, 20) })),

      clearHistory: () => set({ history: [] }),

      getHandle: (localId) => get()._handles.get(localId),
    }),
    {
      name: 'media-uploader-history',
      // Persist only the history slice — live items + handles are session-only.
      partialize: (state) => ({ history: state.history }),
    }
  )
);
