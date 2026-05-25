import { useEffect, useState } from 'react';
import { env } from '../env.ts';

export interface RemoteUpload {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  status: string;
  userId: string;
  totalChunks: number;
  receivedChunks: number;
  createdAt: string;
  finalizedAt: string | null;
}

export interface UploadsPage {
  total: number;
  page: number;
  limit: number;
  uploads: RemoteUpload[];
}

export function useAdminUploads(
  page: number,
  enabled: boolean
): {
  data: UploadsPage | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<UploadsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(
      `${env.apiUrl}/api/admin/uploads?page=${page}&limit=20`,
      {
        signal: controller.signal,
        headers: { 'X-User-Id': env.userId },
      }
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const json = (await res.json()) as UploadsPage;
        setData(json);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [page, enabled]);

  return { data, loading, error };
}
