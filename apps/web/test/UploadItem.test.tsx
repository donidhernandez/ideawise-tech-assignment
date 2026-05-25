import { render, screen, fireEvent } from '@testing-library/react';
import type { UploadHandle } from '@repo/upload-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadItem } from '../src/components/UploadItem';
import { useUploadStore, type UploadItem as UploadItemModel } from '../src/store/uploadStore';

function makeHandle(): UploadHandle {
  return {
    uploadId: null,
    status: 'idle',
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnValue(() => {}),
    done: vi.fn().mockResolvedValue({ fileId: 'x', url: '/x', deduplicated: false }),
  } as unknown as UploadHandle;
}

function makeItem(overrides: Partial<UploadItemModel>): UploadItemModel {
  return {
    localId: 'a',
    name: 'photo.jpg',
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
    speedBps: null,
    ...overrides,
  };
}

beforeEach(() => {
  useUploadStore.setState({ items: [], history: [], _handles: new Map() });
});

describe('<UploadItem /> — actions during active states', () => {
  it('clicking Pause calls handle.pause()', () => {
    const handle = makeHandle();
    const item = makeItem({});
    useUploadStore.getState().addItem(item, handle);

    render(<UploadItem item={item} />);
    fireEvent.click(screen.getByText('Pause'));
    expect(handle.pause).toHaveBeenCalledTimes(1);
  });

  it('paused items expose Resume + Cancel; clicking Resume calls handle.resume()', () => {
    const handle = makeHandle();
    const item = makeItem({ status: 'paused' });
    useUploadStore.getState().addItem(item, handle);

    render(<UploadItem item={item} />);
    expect(screen.getByText('Resume')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Resume'));
    expect(handle.resume).toHaveBeenCalledTimes(1);
  });

  it('clicking Cancel calls handle.cancel()', () => {
    const handle = makeHandle();
    const item = makeItem({});
    useUploadStore.getState().addItem(item, handle);

    render(<UploadItem item={item} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(handle.cancel).toHaveBeenCalledTimes(1);
  });
});

describe('<UploadItem /> — terminal states', () => {
  it('complete items show only Remove; clicking it drops the row from the store', () => {
    const handle = makeHandle();
    const item = makeItem({ status: 'complete', ratio: 1, uploadedBytes: 1000, url: '/uploads/a' });
    useUploadStore.getState().addItem(item, handle);

    render(<UploadItem item={item} />);
    expect(screen.queryByText('Pause')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
    fireEvent.click(screen.getByText('Remove'));
    expect(useUploadStore.getState().items.find((i) => i.localId === 'a')).toBeUndefined();
  });

  it('failed items show the error category badge + message', () => {
    const item = makeItem({
      status: 'failed',
      error: 'That file type is not allowed.',
      errorCategory: 'invalid_type',
    });
    useUploadStore.getState().addItem(item, makeHandle());

    render(<UploadItem item={item} />);
    expect(screen.getByText('Invalid type')).toBeInTheDocument();
    expect(screen.getByText(/that file type is not allowed/i)).toBeInTheDocument();
  });

  it('shows the retry banner while retryInfo is set', () => {
    const item = makeItem({
      status: 'uploading',
      retryInfo: { attempt: 2, total: 3 },
    });
    useUploadStore.getState().addItem(item, makeHandle());

    render(<UploadItem item={item} />);
    expect(screen.getByTestId('retry-notice')).toBeInTheDocument();
    expect(screen.getByText(/attempt 2 of 3/i)).toBeInTheDocument();
  });

  it('hides the retry banner when retryInfo is null', () => {
    const item = makeItem({ status: 'uploading', retryInfo: null });
    useUploadStore.getState().addItem(item, makeHandle());

    render(<UploadItem item={item} />);
    expect(screen.queryByTestId('retry-notice')).toBeNull();
  });

  it('renders a "View uploaded file" link for complete items with a url', () => {
    // The backend returns a relative path; the component prepends env.apiUrl.
    const item = makeItem({ status: 'complete', ratio: 1, url: '/uploads/a.jpg' });
    useUploadStore.getState().addItem(item, makeHandle());

    render(<UploadItem item={item} />);
    const link = screen.getByText(/view file/i).closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('http://localhost:8000/uploads/a.jpg');
  });
});
