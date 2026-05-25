import { describe, expect, it } from 'vitest';
import { formatBytes, formatRelativeTime } from '../src/lib/format.ts';

describe('formatBytes', () => {
  it('handles zero and negative as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
  });

  it('scales correctly across units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });
});

describe('formatRelativeTime', () => {
  it('returns seconds for <1min', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 5_000, now)).toBe('5s ago');
  });

  it('returns minutes / hours / days at each threshold', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 90_000, now)).toBe('1m ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});
