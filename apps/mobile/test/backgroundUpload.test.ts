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
import {
  BACKGROUND_UPLOAD_TASK,
  defineBackgroundUploadTask,
  registerBackgroundUploadTask,
  resumePendingUploads,
} from '@/lib/backgroundUpload';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { useUploadStore, type UploadItem } from '@/store/uploadStore';
import type { UploadEvent } from '@repo/upload-core';

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

  describe('resumed-item event bridging', () => {
    let listener: ((event: UploadEvent) => void) | null = null;

    beforeEach(() => {
      listener = null;
      mockUploadSpy.mockImplementation(() => ({
        uploadId: 'srv-1',
        status: 'idle',
        pause: jest.fn(),
        resume: jest.fn(),
        cancel: jest.fn(),
        on: jest.fn().mockImplementation((cb: (e: UploadEvent) => void) => {
          listener = cb;
          return () => {};
        }),
        done: jest.fn(),
      }));
    });

    it('propagates statusChange events into the store row', async () => {
      useUploadStore.getState().items = [makeItem({ localId: 'a' })];
      await resumePendingUploads();
      listener?.({ type: 'statusChange', status: 'uploading' });
      const row = useUploadStore.getState().items.find((i) => i.localId === 'a');
      expect(row?.status).toBe('uploading');
      expect(row?.uploadId).toBe('srv-1');
    });

    it('propagates progress events', async () => {
      useUploadStore.getState().items = [makeItem({ localId: 'a' })];
      await resumePendingUploads();
      listener?.({
        type: 'progress',
        progress: { uploadedBytes: 1500, totalBytes: 2000, uploadedChunks: 1, totalChunks: 2, ratio: 0.75 },
      });
      const row = useUploadStore.getState().items.find((i) => i.localId === 'a');
      expect(row?.uploadedBytes).toBe(1500);
      expect(row?.ratio).toBe(0.75);
    });

    it('propagates complete events with dedup flag', async () => {
      useUploadStore.getState().items = [makeItem({ localId: 'a' })];
      await resumePendingUploads();
      listener?.({
        type: 'complete',
        result: { fileId: 'f1', url: '/u/f1', deduplicated: true },
      });
      const row = useUploadStore.getState().items.find((i) => i.localId === 'a');
      expect(row?.status).toBe('complete');
      expect(row?.ratio).toBe(1);
      expect(row?.url).toBe('/u/f1');
      expect(row?.deduplicated).toBe(true);
    });

    it('maps error events through categorizeError', async () => {
      useUploadStore.getState().items = [makeItem({ localId: 'a' })];
      await resumePendingUploads();
      listener?.({ type: 'error', error: new Error('TypeError: Network request failed') });
      const row = useUploadStore.getState().items.find((i) => i.localId === 'a');
      expect(row?.status).toBe('failed');
      expect(row?.errorCategory).toBe('network');
    });
  });
});

describe('defineBackgroundUploadTask', () => {
  beforeEach(() => {
    (TaskManager.isTaskDefined as jest.Mock).mockReturnValue(false);
    (TaskManager.defineTask as jest.Mock).mockClear();
  });

  it('registers the task with TaskManager exactly once', () => {
    defineBackgroundUploadTask();
    expect(TaskManager.defineTask).toHaveBeenCalledWith(
      BACKGROUND_UPLOAD_TASK,
      expect.any(Function)
    );
  });

  it('is idempotent — does not redefine when already present', () => {
    (TaskManager.isTaskDefined as jest.Mock).mockReturnValue(true);
    defineBackgroundUploadTask();
    expect(TaskManager.defineTask).not.toHaveBeenCalled();
  });
});

describe('registerBackgroundUploadTask', () => {
  beforeEach(() => {
    (BackgroundTask.getStatusAsync as jest.Mock).mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Available
    );
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(false);
    (BackgroundTask.registerTaskAsync as jest.Mock).mockClear();
  });

  it('registers with a 15-minute minimum interval when not yet registered', async () => {
    await registerBackgroundUploadTask();
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(
      BACKGROUND_UPLOAD_TASK,
      expect.objectContaining({ minimumInterval: 15 })
    );
  });

  it('skips re-registration when already registered', async () => {
    (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true);
    await registerBackgroundUploadTask();
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });

  it('no-ops when the device reports background tasks are restricted', async () => {
    (BackgroundTask.getStatusAsync as jest.Mock).mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Restricted
    );
    await registerBackgroundUploadTask();
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });

  it('swallows errors so callers do not need a try/catch', async () => {
    (BackgroundTask.getStatusAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(registerBackgroundUploadTask()).resolves.toBeUndefined();
  });
});
