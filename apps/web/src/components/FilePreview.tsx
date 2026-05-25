import { env } from '../env.ts';
import type { UploadItem } from '../store/uploadStore.ts';

interface FilePreviewProps {
  item: UploadItem;
}

/**
 * Thumbnail shown in the upload queue row.
 *
 * Priority:
 *  1. If the upload is complete and the server URL is available, load the
 *     actual stored image — this confirms the file was persisted correctly.
 *  2. While uploading (or when the server URL isn't yet available), show the
 *     local blob preview so the row doesn't flash blank.
 *  3. Videos and non-image files get a typed icon (no preview possible without
 *     a server-side frame extractor).
 */
export function FilePreview({ item }: FilePreviewProps) {
  const isImage = item.mimeType.startsWith('image/');
  const isVideo = item.mimeType.startsWith('video/');

  // Once the upload is complete the server URL is the source of truth.
  if (item.status === 'complete' && item.url && isImage) {
    return (
      <a href={env.apiUrl + item.url} target="_blank" rel="noreferrer" tabIndex={-1}>
        <img
          src={env.apiUrl + item.url}
          alt={item.name}
          className="h-14 w-14 rounded-lg object-cover ring-1 ring-zinc-200 transition-opacity"
        />
      </a>
    );
  }

  // During upload: show the local blob so there's immediate visual feedback.
  if (item.previewUrl && isImage) {
    return (
      <img
        src={item.previewUrl}
        alt={item.name}
        className="h-14 w-14 rounded-lg object-cover ring-1 ring-zinc-200 opacity-60"
      />
    );
  }

  // Video / unknown — render a simple typed badge.
  return (
    <div
      className={[
        'flex h-14 w-14 items-center justify-center rounded-lg text-xs font-medium ring-1',
        isVideo ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-zinc-100 text-zinc-600 ring-zinc-200',
      ].join(' ')}
    >
      {isVideo ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )}
    </div>
  );
}
