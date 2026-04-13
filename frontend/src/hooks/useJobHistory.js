import { useCallback, useEffect, useState } from 'react';

export function useJobHistory(jobId, accessToken) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async () => {
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
    if (!jobId || !accessToken || !backendBase) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendBase}/jobs/${jobId}/history`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [jobId, accessToken]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error };
}
