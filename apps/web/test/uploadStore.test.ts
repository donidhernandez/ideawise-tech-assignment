import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadHandle } from '@repo/upload-core';
import { useUploadStore } from '../src/store/uploadStore.ts';
import type { UploadItem } from '../src/store/uploadStore.ts';

function makeHandle(): UploadHandle {
  return {
    uploadId: null,
    status: 'idle',
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnValue(() => {}),
    done: vi.fn().mockResolvedValue({ fileId: 'x', url: '/x', deduplicated: false }),
  };
}

function makeItem(localId: string): UploadItem {
  return {
    localId,
    name: `${localId}.jpg`,
    size: 1024,
    mimeType: 'image/jpeg',
    uploadId: null,
    status: 'idle',
    uploadedBytes: 0,
    ratio: 0,
    url: null,
    error: null,
    errorCategory: null,
    previewUrl: null,
    deduplicated: false,
    orphaned: false,
    retryInfo: null,
    speedBps: null,
  };
}

describe('uploadStore', () => {
  beforeEach(() => {
    useUploadStore.setState({ items: [], history: [], _handles: new Map() });
    localStorage.clear();
  });

  it('addItem stores both the item and its handle', () => {
    const handle = makeHandle();
    useUploadStore.getState().addItem(makeItem('a'), handle);
    const s = useUploadStore.getState();
    expect(s.items).toHaveLength(1);
    expect(s.getHandle('a')).toBe(handle);
  });

  it('patchItem only mutates the targeted item', () => {
    const { addItem, patchItem } = useUploadStore.getState();
    addItem(makeItem('a'), makeHandle());
    addItem(makeItem('b'), makeHandle());
    patchItem('a', { status: 'complete', ratio: 1 });
    const items = useUploadStore.getState().items;
    expect(items.find((i) => i.localId === 'a')?.status).toBe('complete');
    expect(items.find((i) => i.localId === 'b')?.status).toBe('idle');
  });

  it('removeItem drops the item and its handle', () => {
    const { addItem, removeItem } = useUploadStore.getState();
    addItem(makeItem('a'), makeHandle());
    removeItem('a');
    const s = useUploadStore.getState();
    expect(s.items).toHaveLength(0);
    expect(s.getHandle('a')).toBeUndefined();
  });

  it('pushHistory caps at 20 entries (most recent first)', () => {
    const { pushHistory } = useUploadStore.getState();
    for (let i = 0; i < 25; i++) {
      pushHistory({
        localId: `id-${i}`,
        name: `f${i}.jpg`,
        size: 100,
        mimeType: 'image/jpeg',
        url: `/u/${i}`,
        deduplicated: false,
        uploadedAt: Date.now() + i,
      });
    }
    const { history } = useUploadStore.getState();
    expect(history).toHaveLength(20);
    expect(history[0]?.localId).toBe('id-24');
  });

  it('clearHistory empties the persisted slice', () => {
    const { pushHistory, clearHistory } = useUploadStore.getState();
    pushHistory({
      localId: 'a',
      name: 'a.jpg',
      size: 1,
      mimeType: 'image/jpeg',
      url: '/a',
      deduplicated: false,
      uploadedAt: Date.now(),
    });
    clearHistory();
    expect(useUploadStore.getState().history).toHaveLength(0);
  });
});
