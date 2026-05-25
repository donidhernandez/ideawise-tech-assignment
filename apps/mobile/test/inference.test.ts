import { deriveName, inferMime, makeLocalId } from '@/lib/inference';

describe('makeLocalId', () => {
  it('is deterministic given fixed time + random inputs', () => {
    // 0.123456789.toString(36) === '0.4fzzzxjy...'; slice(2,8) → '4fzzzx'
    expect(makeLocalId(1700000000000, 0.123456789)).toBe('upl-1700000000000-4fzzzx');
  });

  it('produces unique ids when fed the real clock and Math.random', () => {
    const a = makeLocalId();
    const b = makeLocalId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^upl-\d+-[a-z0-9]+$/);
  });
});

describe('inferMime', () => {
  it('returns the explicit mimeType when present', () => {
    expect(inferMime({ uri: 'x', mimeType: 'image/png' })).toBe('image/png');
  });

  it('falls back to image/jpeg for image-typed assets', () => {
    expect(inferMime({ uri: 'x', type: 'image' })).toBe('image/jpeg');
  });

  it('falls back to image/jpeg for livePhoto (iOS) assets', () => {
    expect(inferMime({ uri: 'x', type: 'livePhoto' })).toBe('image/jpeg');
  });

  it('falls back to video/mp4 for video-typed assets', () => {
    expect(inferMime({ uri: 'x', type: 'video' })).toBe('video/mp4');
  });

  it('falls back to video/mp4 for pairedVideo assets', () => {
    expect(inferMime({ uri: 'x', type: 'pairedVideo' })).toBe('video/mp4');
  });

  it('falls back to application/octet-stream for unknown assets', () => {
    expect(inferMime({ uri: 'x' })).toBe('application/octet-stream');
  });
});

describe('deriveName', () => {
  it('extracts the last path segment from a file URI', () => {
    expect(deriveName('file:///var/mobile/Containers/Data/foo.jpg')).toBe('foo.jpg');
  });

  it('decodes percent-encoded path segments', () => {
    expect(deriveName('file:///tmp/My%20Photo.jpg')).toBe('My Photo.jpg');
  });

  it('falls back to a timestamped name when the URI has no segment', () => {
    expect(deriveName('', 12345)).toBe('capture-12345');
  });

  it('returns the raw tail if percent decoding fails', () => {
    // Malformed escape sequence → decodeURIComponent throws; we keep the tail.
    expect(deriveName('file:///broken%E0%A4.jpg')).toBe('broken%E0%A4.jpg');
  });
});
