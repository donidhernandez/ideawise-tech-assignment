import { Toaster } from 'sonner';
import { FilePicker } from './components/FilePicker.tsx';
import { HistoryPanel } from './components/HistoryPanel.tsx';
import { UploadQueue } from './components/UploadQueue.tsx';
import { useUpload } from './hooks/useUpload.ts';
import { env } from './env.ts';

function App() {
  const { startUpload } = useUpload();

  const handleAccept = (files: File[]) => {
    for (const file of files) startUpload(file);
  };

  return (
    <div className="min-h-full">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-base font-semibold text-zinc-900">Media Uploader</h1>
            <p className="text-xs text-zinc-500">
              Chunked uploads · pause / resume · dedup · backend at <code className="rounded bg-zinc-100 px-1 py-0.5">{env.apiUrl}</code>
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <FilePicker onAccept={handleAccept} />
            <UploadQueue />
          </div>
          <aside>
            <HistoryPanel />
          </aside>
        </div>
      </main>

      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}

export default App;
