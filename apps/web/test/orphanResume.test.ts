import { describe, expect, it, beforeEach } from 'vitest';
import { useUploadStore, type UploadItem } from '../src/store/uploadStore';

function makeItem(overrides: Partial<UploadItem>): UploadItem {
  return {
    localId: 'a',
    name: 'photo.jpg',
    size: 1000,
    mimeType: 'image/jpeg',
    uploadId: 'srv-1',
    status: 'uploading',
    uploadedBytes: 400,
    ratio: 0.4,
    url: null,
    error: null,
    errorCategory: null,
    previewUrl: 'blob:something',
    deduplicated: false,
    orphaned: false,
    retryInfo: null,
    speedBps: null,
    ...overrides,
  };
}

beforeEach(() => {
  useUploadStore.setState({ items: [], history: [], _handles: new Map() });
  localStorage.clear();
});

describe('rehydrateAsOrphans', () => {
  it('demotes uploading + initializing + paused + finalizing rows to paused+orphaned', () => {
    useUploadStore.setState({
      items: [
        makeItem({ localId: 'a', status: 'uploading' }),
        makeItem({ localId: 'b', status: 'initializing' }),
        makeItem({ localId: 'c', status: 'paused' }),
        makeItem({ localId: 'd', status: 'finalizing' }),
        makeItem({ localId: 'e', status: 'idle' }),
      ],
    });

    useUploadStore.getState().rehydrateAsOrphans();

    const items = useUploadStore.getState().items;
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      const row = items.find((i) => i.localId === id);
      expect(row?.status).toBe('paused');
      expect(row?.orphaned).toBe(true);
      // The blob URL cannot survive a reload, so we null it.
      expect(row?.previewUrl).toBeNull();
    }
  });

  it('does not touch terminal rows (complete / failed / canceled)', () => {
    useUploadStore.setState({
      items: [
        makeItem({ localId: 'c1', status: 'complete', ratio: 1, url: '/u/c1' }),
        makeItem({ localId: 'c2', status: 'failed', error: 'bad' }),
        makeItem({ localId: 'c3', status: 'canceled' }),
      ],
    });

    useUploadStore.getState().rehydrateAsOrphans();

    const items = useUploadStore.getState().items;
    expect(items.find((i) => i.localId === 'c1')?.status).toBe('complete');
    expect(items.find((i) => i.localId === 'c1')?.orphaned).toBe(false);
    expect(items.find((i) => i.localId === 'c2')?.status).toBe('failed');
    expect(items.find((i) => i.localId === 'c3')?.status).toBe('canceled');
  });
});

describe('replaceItem', () => {
  it('swaps an existing row with a fresh one, attaching a new handle', () => {
    const store = useUploadStore.getState();
    const oldHandle = {} as never; // UploadHandle shape isn't exercised here
    const newHandle = {} as never;

    const original = makeItem({ localId: 'a', orphaned: true, status: 'paused' });
    store.addItem(original, oldHandle);

    const fresh = makeItem({ localId: 'a', name: 'new-name.jpg', orphaned: false, status: 'idle' });
    store.replaceItem('a', fresh, newHandle);

    const row = useUploadStore.getState().items.find((i) => i.localId === 'a');
    expect(row?.name).toBe('new-name.jpg');
    expect(row?.orphaned).toBe(false);
    expect(useUploadStore.getState().getHandle('a')).toBe(newHandle);
  });
});
