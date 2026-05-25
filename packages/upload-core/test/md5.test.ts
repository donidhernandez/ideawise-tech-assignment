import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Md5Hasher, md5 } from '../src/md5.js';

function nodeMd5(buf: Uint8Array): string {
  return createHash('md5').update(buf).digest('hex');
}

describe('Md5Hasher', () => {
  it('matches Node crypto for empty input', () => {
    const buf = new Uint8Array(0);
    expect(md5(buf)).toBe(nodeMd5(buf));
  });

  it('matches Node crypto for "hello"', () => {
    const buf = new TextEncoder().encode('hello');
    expect(md5(buf)).toBe(nodeMd5(buf));
  });

  it('matches Node crypto across 1 MiB block boundary', () => {
    const buf = new Uint8Array(1024 * 1024 + 17);
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 7) & 0xff;
    expect(md5(buf)).toBe(nodeMd5(buf));
  });

  it('streaming digest equals one-shot digest', () => {
    const buf = new Uint8Array(50_000);
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 13) & 0xff;
    const h = new Md5Hasher();
    h.update(buf.subarray(0, 17));
    h.update(buf.subarray(17, 1024));
    h.update(buf.subarray(1024, 50_000));
    expect(h.digest()).toBe(md5(buf));
  });

  it('matches RFC 1321 vector for "abc"', () => {
    expect(md5(new TextEncoder().encode('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});
