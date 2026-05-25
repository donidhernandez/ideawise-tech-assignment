/**
 * Pure helpers reused by useUpload and the background resume path.
 * Kept in their own module so the tests don't have to spin up the
 * React Native bridge to verify them.
 */

export interface InferenceAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo' | null;
}

/** Stable client-side identifier for an upload row. Length: ~16-18 chars. */
export function makeLocalId(now: number = Date.now(), rand: number = Math.random()): string {
  return `upl-${now}-${rand.toString(36).slice(2, 8)}`;
}

/**
 * Picks a MIME type for an asset that may or may not declare one. Falls back
 * to image/jpeg or video/mp4 based on the picker's asset.type hint, then to
 * application/octet-stream as a last resort.
 */
export function inferMime(asset: InferenceAsset): string {
  if (asset.mimeType) return asset.mimeType;
  if (asset.type === 'video' || asset.type === 'pairedVideo') return 'video/mp4';
  if (asset.type === 'image' || asset.type === 'livePhoto') return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * Derives a display name from a file URI when the picker didn't supply one.
 * Decodes percent-escapes so users see "My Photo.jpg" rather than
 * "My%20Photo.jpg".
 */
export function deriveName(uri: string, now: number = Date.now()): string {
  const tail = uri.split('/').pop();
  if (!tail || tail === '') return `capture-${now}`;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}
