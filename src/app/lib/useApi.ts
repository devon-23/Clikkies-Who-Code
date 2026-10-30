import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from './api.ts';

// Loads one API resource for a page. `data` stays as the last good value while
// reloading, so a refresh never blanks the screen.
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);

  const reload = useCallback(async () => {
    if (path === null) return;
    setLoading(true);
    try {
      setError(null);
      setData(await api<T>(path));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { void reload(); }, [reload]);

  return { data, error, loading, reload, setData };
}
