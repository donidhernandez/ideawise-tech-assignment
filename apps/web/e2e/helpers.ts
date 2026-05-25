import type { Page } from '@playwright/test';

/**
 * The shape of args accepted by `injectFile()`. Must stay serializable
 * because it crosses the Node ↔ browser boundary via `page.evaluate`.
 */
export interface InjectArgs {
  name: string;
  mimeType: string;
  /** Total bytes to produce in the page context. */
  size: number;
  /** PRNG seed for the byte pattern — controls MD5 determinism. */
  seed: number;
  /** Valid JPEG bytes or plain text (for the invalid-type test). */
  shape: 'jpeg' | 'text';
}

/**
 * Injects a synthetic `File` into the dropzone's hidden file input and
 * dispatches the `change` event so react-dropzone picks it up. The bytes
 * are produced inside `page.evaluate` so they never have to be serialized
 * across the Node ↔ browser boundary.
 */
export async function injectFile(page: Page, args: InjectArgs): Promise<void> {
  await page.evaluate((a: InjectArgs) => {
    const buf = new Uint8Array(a.size);
    if (a.shape === 'jpeg') {
      const header = [
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
        0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      ];
      for (let i = 0; i < header.length; i++) buf[i] = header[i]!;
      // Stamp the full seed as 8 unique bytes right after the header. The
      // `(i * seed) & 0xff` filler alone only produces 256 distinct byte
      // streams (modulo seed) which collides ~1/256 across test runs;
      // embedding the full Float64-encoded seed guarantees uniqueness.
      const seedBuf = new ArrayBuffer(8);
      new DataView(seedBuf).setFloat64(0, a.seed);
      buf.set(new Uint8Array(seedBuf), header.length);
      for (let i = header.length + 8; i < a.size - 2; i++) buf[i] = (i * a.seed) & 0xff;
      buf[a.size - 2] = 0xff;
      buf[a.size - 1] = 0xd9;
    } else {
      const text = 'This is plain text content, not an image. ';
      const enc = new TextEncoder();
      const encoded = enc.encode(text.repeat(Math.ceil(a.size / text.length)).slice(0, a.size));
      buf.set(encoded, 0);
    }

    const file = new File([buf], a.name, { type: a.mimeType });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) throw new Error('file input not found');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, args);
}

/**
 * Convenience: clear persisted state before a test, then reload. Drops
 * both the queue and the history localStorage keys.
 */
export async function resetStore(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.removeItem('media-uploader-queue');
      localStorage.removeItem('media-uploader-history');
    } catch {
      // ignore — some test contexts disable localStorage
    }
  });
  await page.reload();
}
