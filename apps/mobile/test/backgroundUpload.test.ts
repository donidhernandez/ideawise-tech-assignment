import type { UploadHandle } from '@repo/upload-core';

// Module-level mocks. These are wired BEFORE the SUT is imported so its
// own imports see the mocked surface.

const mockExistsRef = { value: true };
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    get exists() { return mockExistsRef.value; },
  })),
  FileMode: { ReadOnly: 'r', WriteOnly: 'w', ReadWrite: 'rw' },
  Paths: { cache: '/cache' },
  UploadType: { BINARY_CONTENT: 0 },
}));

const mockUploadSpy = jest.fn();
jest.mock('@/lib/manager', () => ({
  getUploadManager: () => ({ upload: mockUploadSpy }),
}));

jest.mock('@/lib/expoFileSource', () => ({
  assetToSource: jest.fn((asset) => ({
    name: asset.fileName,
    size: asset.fileSize,
    mimeType: asset.mimeType,
    slice: jest.fn(),
  })),
}));

// SUT after mocks are registered.
import { resumePendingUploads } from '@/lib/backgroundUpload';
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

function makeItem(overrides: Partial<UploadItem>): UploadItem {
  return {
    localId: 'i-1',
    name: 'photo.jpg',
    size: 2_000_000,
    mimeType: 'image/jpeg',
    sourceUri: 'file:///tmp/photo.jpg',
    uploadId: null,
    status: 'paused',
    uploadedBytes: 0,
    ratio: 0,
    url: null,
    error: null,
    errorCategory: null,
    deduplicated: false,
    ...overrides,
  };
}

describe('resumePendingUploads', () => {
  beforeEach(() => {
    useUploadStore.setState({ items: [], _handles: new Map() });
    mockUploadSpy.mockReset();
    mockUploadSpy.mockReturnValue(makeHandle());
    mockExistsRef.value = true;
  });

  it('resumes paused items whose source file still exists', async () => {
    useUploadStore.getState().items = [makeItem({ localId: 'a' })];

    const result = await resumePendingUploads();

    expect(mockUploadSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ resumed: 1, dropped: 0 });
    const item = useUploadStore.getState().items.find((i) => i.localId === 'a');
    expect(item?.status).toBe('idle');
    expect(item?.uploadedBytes).toBe(0);
    expect(item?.error).toBeNull();
  });

  it('drops paused items whose source file is gone', async () => {
    mockExistsRef.value = false;
    useUploadStore.getState().items = [makeItem({ localId: 'a' })];

    const result = await resumePendingUploads();

    expect(mockUploadSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ resumed: 0, dropped: 1 });
    const item = useUploadStore.getState().items.find((i) => i.localId === 'a');
    expect(item?.status).toBe('failed');
    expect(item?.errorCategory).toBe('unknown');
    expect(item?.error).toMatch(/no longer available/i);
  });

  it('skips items that already have a live handle', async () => {
    const liveHandle = makeHandle();
    useUploadStore.setState({
      items: [makeItem({ localId: 'has-handle' })],
      _handles: new Map([['has-handle', liveHandle]]),
    });

    const result = await resumePendingUploads();

    expect(mockUploadSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ resumed: 0, dropped: 0 });
  });

  it('skips non-paused statuses (idle, complete, failed)', async () => {
    useUploadStore.getState().items = [
      makeItem({ localId: 'a', status: 'idle' }),
      makeItem({ localId: 'b', status: 'complete' }),
      makeItem({ localId: 'c', status: 'failed' }),
    ];

    const result = await resumePendingUploads();

    expect(mockUploadSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ resumed: 0, dropped: 0 });
  });

  it('marks the item failed and counts as dropped when upload() throws', async () => {
    mockUploadSpy.mockImplementation(() => {
      throw new Error('TypeError: Network request failed');
    });
    useUploadStore.getState().items = [makeItem({ localId: 'a' })];

    const result = await resumePendingUploads();

    expect(result).toEqual({ resumed: 0, dropped: 1 });
    const item = useUploadStore.getState().items.find((i) => i.localId === 'a');
    expect(item?.status).toBe('failed');
    expect(item?.errorCategory).toBe('network');
  });
});
