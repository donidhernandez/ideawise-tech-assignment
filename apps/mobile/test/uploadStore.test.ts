import type { UploadHandle } from '@repo/upload-core';
import { useUploadStore, type UploadItem } from '@/store/uploadStore';

function makeHandle(): UploadHandle {
  return {
    uploadId: null,
    status: 'idle',
    pause: jest.fn(),
    resume: jest.fn(),
    cancel: jest.fn().mockResolvedValue(undefined),
    on: jest.fn().mockReturnValue(() => {}),
    done: jest.fn().mockResolvedValue({ fileId: 'x', url: '/x', deduplicated: false }),
  };
}

function makeItem(localId: string, overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    localId,
    name: `${localId}.jpg`,
    size: 1024,
    mimeType: 'image/jpeg',
    sourceUri: 'file:///tmp/x.jpg',
    uploadId: null,
    status: 'idle',
    uploadedBytes: 0,
    ratio: 0,
    url: null,
    error: null,
    errorCategory: null,
    deduplicated: false,
    ...overrides,
  };
}

describe('useUploadStore', () => {
  beforeEach(() => {
    useUploadStore.setState({ items: [], _handles: new Map() });
  });

  it('addItem stores both the item and its handle', () => {
    const handle = makeHandle();
    useUploadStore.getState().addItem(makeItem('a'), handle);

    const state = useUploadStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.localId).toBe('a');
    expect(state.getHandle('a')).toBe(handle);
  });

  it('patchItem only touches the targeted item', () => {
    const { addItem, patchItem } = useUploadStore.getState();
    addItem(makeItem('a'), makeHandle());
    addItem(makeItem('b'), makeHandle());

    patchItem('a', { status: 'complete', ratio: 1 });

    const items = useUploadStore.getState().items;
    expect(items.find((i) => i.localId === 'a')?.status).toBe('complete');
    expect(items.find((i) => i.localId === 'b')?.status).toBe('idle');
  });

  it('removeItem drops the row and its handle', () => {
    const { addItem, removeItem } = useUploadStore.getState();
    addItem(makeItem('a'), makeHandle());
    addItem(makeItem('b'), makeHandle());

    removeItem('a');

    const state = useUploadStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.localId).toBe('b');
    expect(state.getHandle('a')).toBeUndefined();
  });

  it('rehydrateAsOrphans demotes active rows to paused but keeps terminal rows', () => {
    const { addItem, rehydrateAsOrphans } = useUploadStore.getState();
    addItem(makeItem('uploading-row', { status: 'uploading', ratio: 0.4 }), makeHandle());
    addItem(makeItem('initializing-row', { status: 'initializing' }), makeHandle());
    addItem(makeItem('paused-row', { status: 'paused' }), makeHandle());
    addItem(makeItem('complete-row', { status: 'complete', ratio: 1 }), makeHandle());
    addItem(makeItem('failed-row', { status: 'failed' }), makeHandle());

    rehydrateAsOrphans();

    const items = useUploadStore.getState().items;
    const byId = (id: string) => items.find((i) => i.localId === id);
    expect(byId('uploading-row')?.status).toBe('paused');
    expect(byId('initializing-row')?.status).toBe('paused');
    expect(byId('paused-row')?.status).toBe('paused');
    expect(byId('complete-row')?.status).toBe('complete'); // unchanged
    expect(byId('failed-row')?.status).toBe('failed');     // unchanged
  });

  it('getHandle returns undefined for unknown ids', () => {
    expect(useUploadStore.getState().getHandle('nope')).toBeUndefined();
  });

  it('handle map is not exposed via items (session-only invariant)', () => {
    const { addItem } = useUploadStore.getState();
    addItem(makeItem('a'), makeHandle());

    // Serializing the items should never leak a function-bearing UploadHandle.
    const items = useUploadStore.getState().items;
    const serialized = JSON.parse(JSON.stringify(items));
    expect(JSON.stringify(serialized)).not.toContain('UploadHandle');
    expect(serialized[0]).not.toHaveProperty('handle');
  });
});
