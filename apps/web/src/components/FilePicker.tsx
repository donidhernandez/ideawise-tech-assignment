import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { MAX_FILES, validateSelection } from '../lib/validation.ts';

interface FilePickerProps {
  onAccept: (files: File[]) => void;
  /** Disables the dropzone while another action is in progress. */
  disabled?: boolean;
}

export function FilePicker({ onAccept, disabled = false }: FilePickerProps) {
  const handleDrop = useCallback(
    (incoming: File[]) => {
      const { accepted, rejected } = validateSelection(incoming);
      for (const r of rejected) toast.error(`${r.file.name}: ${r.reason}`);
      if (accepted.length > 0) onAccept(accepted);
    },
    [onAccept]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: { 'image/*': [], 'video/*': [] },
    multiple: true,
    maxFiles: MAX_FILES,
    disabled,
    noClick: false,
    noKeyboard: false,
  });

  return (
    <div
      {...getRootProps()}
      data-testid="file-picker"
      className={[
        'w-full rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer select-none',
        isDragActive
          ? 'border-violet-500 bg-violet-50'
          : 'border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50',
        disabled ? 'opacity-50 pointer-events-none' : '',
      ].join(' ')}
    >
      <input {...getInputProps()} aria-label="File input" />
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-full bg-violet-100 p-3 text-violet-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div>
          <p className="text-base font-medium text-zinc-900">
            {isDragActive ? 'Drop them here' : 'Drag & drop files, or click to browse'}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Images and videos · up to {MAX_FILES} files · 500 MB each
          </p>
        </div>
      </div>
    </div>
  );
}
