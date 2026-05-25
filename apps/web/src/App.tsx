import { Toaster } from 'sonner';
import { FilePicker } from './components/FilePicker.tsx';
import { HistoryPanel } from './components/HistoryPanel.tsx';
import { MonitoringPanel } from './components/MonitoringPanel.tsx';
import { UploadQueue } from './components/UploadQueue.tsx';
import { useUpload } from './hooks/useUpload.ts';
import { useUploadStore } from './store/uploadStore.ts';

function App() {
  const { startUpload } = useUpload();
  const activeCount = useUploadStore((s) =>
    s.items.filter((i) => i.status === 'uploading' || i.status === 'initializing' || i.status === 'finalizing').length
  );

  const handleAccept = (files: File[]) => {
    for (const file of files) startUpload(file);
  };

  return (
    <div className="min-h-full">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 shadow-sm">
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            <div>
              <h1 className="text-sm font-semibold leading-tight text-zinc-900">Media Uploader</h1>
              <p className="text-[11px] leading-tight text-zinc-400">
                Chunked · parallel · resumable · dedup
              </p>
            </div>
          </div>

          {/* Live upload indicator */}
          {activeCount > 0 && (
            <div className="flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 ring-1 ring-violet-200">
              <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" aria-hidden="true" />
              <span className="text-xs font-medium text-violet-700">
                {activeCount} {activeCount === 1 ? 'upload' : 'uploads'} active
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <FilePicker onAccept={handleAccept} />
            <UploadQueue />
          </div>
          <aside className="space-y-6">
            <HistoryPanel />
            <MonitoringPanel />
          </aside>
        </div>
      </main>

      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}

export default App;
