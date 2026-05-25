/**
 * Minimal MD5 implementation. We need MD5 client-side to send the final
 * hash to /finalize for integrity verification (and optionally to enable
 * early dedup via /init). It is intentionally pure: no Web Crypto, no
 * Node crypto dependency, so the package runs identically on web,
 * React Native, and Node test environments.
 *
 * Algorithm: RFC 1321. Adapted to TypeScript with explicit Uint32 wrapping.
 *
 * NOTE: MD5 is NOT a security primitive — it's purely for upload integrity
 * and deduplication, both non-adversarial uses.
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
}

function leftRotate(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0;
}

/** Streaming MD5. Feed Uint8Array chunks via update(), then call digest(). */
export class Md5Hasher {
  private a0 = 0x67452301;
  private b0 = 0xefcdab89;
  private c0 = 0x98badcfe;
  private d0 = 0x10325476;
  private length = 0;
  private buffer = new Uint8Array(64);
  private bufferLength = 0;

  update(data: Uint8Array): void {
    this.length += data.length;
    let i = 0;
    // Fill any leftover partial block.
    if (this.bufferLength > 0) {
      const need = 64 - this.bufferLength;
      const take = Math.min(need, data.length);
      this.buffer.set(data.subarray(0, take), this.bufferLength);
      this.bufferLength += take;
      i = take;
      if (this.bufferLength === 64) {
        this.processBlock(this.buffer);
        this.bufferLength = 0;
      }
    }
    // Process full 64-byte blocks.
    while (data.length - i >= 64) {
      this.processBlock(data.subarray(i, i + 64));
      i += 64;
    }
    // Stash trailing bytes.
    if (i < data.length) {
      this.buffer.set(data.subarray(i), 0);
      this.bufferLength = data.length - i;
    }
  }

  digest(): string {
    const finalBuf = new Uint8Array(64 + 64);
    finalBuf.set(this.buffer.subarray(0, this.bufferLength), 0);
    finalBuf[this.bufferLength] = 0x80;
    let padEnd = this.bufferLength + 1;
    // Pad so message length ≡ 56 (mod 64); leave 8 bytes for length.
    if (padEnd > 56) {
      // Need extra block.
      padEnd = 64;
    } else {
      padEnd = 56;
    }
    // Write length in bits as 64-bit little-endian.
    const bitLen = BigInt(this.length) * 8n;
    const view = new DataView(finalBuf.buffer);
    view.setUint32(padEnd, Number(bitLen & 0xffffffffn), true);
    view.setUint32(padEnd + 4, Number((bitLen >> 32n) & 0xffffffffn), true);

    this.processBlock(finalBuf.subarray(0, 64));
    if (padEnd === 64) {
      this.processBlock(finalBuf.subarray(64, 128));
    }

    const result = new Uint8Array(16);
    const out = new DataView(result.buffer);
    out.setUint32(0, this.a0, true);
    out.setUint32(4, this.b0, true);
    out.setUint32(8, this.c0, true);
    out.setUint32(12, this.d0, true);

    let hex = '';
    for (let i = 0; i < 16; i++) {
      const b = result[i] as number;
      hex += b.toString(16).padStart(2, '0');
    }
    return hex;
  }

  private processBlock(block: Uint8Array): void {
    const M = new Uint32Array(16);
    const view = new DataView(block.buffer, block.byteOffset, 64);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(i * 4, true);

    let A = this.a0, B = this.b0, C = this.c0, D = this.d0;

    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + (K[i] as number) + (M[g] as number)) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + leftRotate(F, S[i] as number)) >>> 0;
    }

    this.a0 = (this.a0 + A) >>> 0;
    this.b0 = (this.b0 + B) >>> 0;
    this.c0 = (this.c0 + C) >>> 0;
    this.d0 = (this.d0 + D) >>> 0;
  }
}

/** One-shot helper: returns 32-char lowercase hex digest. */
export function md5(data: Uint8Array): string {
  const h = new Md5Hasher();
  h.update(data);
  return h.digest();
}
