import { useCallback, useEffect, useState } from 'react';

export function useJobs(accessToken) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchJobs = useCallback(async (signal) => {
    const backendBase =
      (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

    if (!accessToken || !backendBase) {
      setJobs([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (signal?.aborted) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendBase}/jobs`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
      if (!res.ok) {
        throw new Error(`Failed to load jobs (${res.status})`);
      }
      const data = await res.json();
      if (signal?.aborted) return;
      setJobs(data);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    fetchJobs(controller.signal);
    return () => controller.abort();
  }, [fetchJobs]);

  return { jobs, loading, error, refetch: fetchJobs };
}
