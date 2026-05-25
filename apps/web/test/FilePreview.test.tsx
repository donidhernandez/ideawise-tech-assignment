import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilePreview } from '../src/components/FilePreview';
import type { UploadItem } from '../src/store/uploadStore';

function makeItem(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    localId: 'a',
    name: 'photo.jpg',
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
    ...overrides,
  };
}

describe('<FilePreview />', () => {
  it('renders an <img> when the item is an image with a previewUrl', () => {
    const { container } = render(
      <FilePreview item={makeItem({ mimeType: 'image/png', previewUrl: 'blob:abc' })} />
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('blob:abc');
    expect(img?.getAttribute('alt')).toBe('photo.jpg');
  });

  it('renders a video badge when the item is video', () => {
    const { container } = render(
      <FilePreview item={makeItem({ mimeType: 'video/mp4', previewUrl: null })} />
    );
    // Video icon variant — SVG <polygon> only present in the video branch
    expect(container.querySelector('polygon')).not.toBeNull();
  });

  it('renders the file-icon variant for unknown mime types', () => {
    const { container } = render(
      <FilePreview item={makeItem({ mimeType: 'application/octet-stream', previewUrl: null })} />
    );
    // Generic file icon path — distinct from the video <polygon>
    expect(container.querySelector('polygon')).toBeNull();
    expect(container.querySelector('polyline')).not.toBeNull();
  });

  it('does not use the image branch when previewUrl is null even for image mime', () => {
    const { container } = render(
      <FilePreview item={makeItem({ mimeType: 'image/png', previewUrl: null })} />
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
