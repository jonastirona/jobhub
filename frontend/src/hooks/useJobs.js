import { useCallback, useEffect, useRef, useState } from 'react';

export function useJobs(accessToken) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pendingRef = useRef(null);

  const fetchJobs = useCallback(async () => {
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

    if (!accessToken || !backendBase) {
      pendingRef.current?.abort();
      pendingRef.current = null;
      setJobs([]);
      setError(null);
      setLoading(false);
      return;
    }

    // Abort any in-flight request before starting a new one
    pendingRef.current?.abort();
    const controller = new AbortController();
    pendingRef.current = controller;
    const { signal } = controller;

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
      if (signal.aborted) return;
      setJobs(data);
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    fetchJobs();
    return () => pendingRef.current?.abort();
  }, [fetchJobs]);

  return { jobs, loading, error, refetch: fetchJobs };
}
