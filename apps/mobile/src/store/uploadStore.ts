import type { UploadHandle, UploadStatus } from '@repo/upload-core';
import { create } from 'zustand';

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
  error: string | null;
  deduplicated: boolean;
}

interface UploadStoreState {
  items: UploadItem[];
  _handles: Map<string, UploadHandle>;
}

interface UploadStoreActions {
  addItem: (item: UploadItem, handle: UploadHandle) => void;
  patchItem: (localId: string, patch: Partial<UploadItem>) => void;
  removeItem: (localId: string) => void;
  getHandle: (localId: string) => UploadHandle | undefined;
}

export const useUploadStore = create<UploadStoreState & UploadStoreActions>((set, get) => ({
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

  getHandle: (localId) => get()._handles.get(localId),
}));
