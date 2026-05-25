import { describe, expect, it } from 'vitest';
import { MAX_FILE_SIZE, MAX_FILES, validateSelection } from '../src/lib/validation.ts';

function file(name: string, type: string, size: number): File {
  // Construct a File with a content of the right size — Buffer-of-zeros via a
  // single-segment Blob avoids holding a huge string in memory for the >500MB case.
  return new File([new Blob([new Uint8Array(size)])], name, { type });
}

describe('validateSelection', () => {
  it('accepts images and videos within the size limit', () => {
    const f1 = file('a.jpg', 'image/jpeg', 1000);
    const f2 = file('b.mp4', 'video/mp4', 2000);
    const { accepted, rejected } = validateSelection([f1, f2]);
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });

  it('rejects non-image/video MIME types', () => {
    const f = file('script.exe', 'application/x-msdownload', 100);
    const { accepted, rejected } = validateSelection([f]);
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatch(/unsupported/);
  });

  it('rejects empty files', () => {
    const f = file('empty.jpg', 'image/jpeg', 0);
    const { rejected } = validateSelection([f]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatch(/empty/);
  });

  it('rejects files over MAX_FILE_SIZE', () => {
    const f = file('huge.mp4', 'video/mp4', MAX_FILE_SIZE + 1);
    const { rejected } = validateSelection([f]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatch(/500 MB/);
  });

  it('trims the selection to MAX_FILES and reports overflow', () => {
    const files = Array.from({ length: MAX_FILES + 3 }, (_, i) =>
      file(`f${i}.jpg`, 'image/jpeg', 100)
    );
    const { accepted, rejected } = validateSelection(files);
    expect(accepted).toHaveLength(MAX_FILES);
    expect(rejected).toHaveLength(3);
    expect(rejected.every((r) => r.reason.includes(`over ${MAX_FILES}`))).toBe(true);
  });
});
