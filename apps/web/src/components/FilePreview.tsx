import type { UploadItem } from '../store/uploadStore.ts';

interface FilePreviewProps {
  item: UploadItem;
}

export function FilePreview({ item }: FilePreviewProps) {
  if (item.previewUrl && item.mimeType.startsWith('image/')) {
    return (
      <img
        src={item.previewUrl}
        alt={item.name}
        className="h-14 w-14 rounded-lg object-cover ring-1 ring-zinc-200"
      />
    );
  }

  // Video / unknown — render a simple typed badge.
  const isVideo = item.mimeType.startsWith('video/');
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
