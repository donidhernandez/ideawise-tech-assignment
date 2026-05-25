import { render, screen } from '@testing-library/react';
import type { UploadHandle } from '@repo/upload-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadQueue } from '../src/components/UploadQueue';
import { useUploadStore, type UploadItem } from '../src/store/uploadStore';

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

function makeItem(overrides: Partial<UploadItem>): UploadItem {
  return {
    localId: 'a',
    name: 'a.jpg',
    size: 1000,
    mimeType: 'image/jpeg',
    uploadId: null,
    status: 'uploading',
    uploadedBytes: 500,
    ratio: 0.5,
    url: null,
    error: null,
    errorCategory: null,
    previewUrl: null,
    deduplicated: false,
    orphaned: false,
    retryInfo: null,
    ...overrides,
  };
}

describe('<UploadQueue />', () => {
  beforeEach(() => {
    useUploadStore.setState({ items: [], history: [], _handles: new Map() });
  });

  it('shows the empty state when the queue is empty', () => {
    render(<UploadQueue />);
    expect(screen.getByText(/no uploads yet/i)).toBeInTheDocument();
  });

  it('renders the queue summary with completed and active counts', () => {
    useUploadStore.getState().addItem(makeItem({ localId: 'a', status: 'complete', ratio: 1, uploadedBytes: 1000 }), makeHandle());
    useUploadStore.getState().addItem(makeItem({ localId: 'b', status: 'uploading', ratio: 0.5, uploadedBytes: 500 }), makeHandle());
    useUploadStore.getState().addItem(makeItem({ localId: 'c', status: 'paused', ratio: 0.2, uploadedBytes: 200 }), makeHandle());

    render(<UploadQueue />);
    expect(screen.getByText(/queue · 3 files/i)).toBeInTheDocument();
    expect(screen.getByText(/1 complete · 1 active/i)).toBeInTheDocument();
  });

  it('singularizes the file count when there is only one item', () => {
    useUploadStore.getState().addItem(makeItem({ localId: 'a' }), makeHandle());
    render(<UploadQueue />);
    expect(screen.getByText(/queue · 1 file/i)).toBeInTheDocument();
  });

  it('renders one upload-item row per queued item', () => {
    useUploadStore.getState().addItem(makeItem({ localId: 'a', name: 'first.jpg' }), makeHandle());
    useUploadStore.getState().addItem(makeItem({ localId: 'b', name: 'second.jpg' }), makeHandle());
    render(<UploadQueue />);
    expect(screen.getAllByTestId('upload-item')).toHaveLength(2);
  });
});
