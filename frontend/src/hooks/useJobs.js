import { useCallback, useEffect, useState } from 'react';

export function useJobs(accessToken) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchJobs = useCallback(async () => {
    const backendBase =
      (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

    if (!accessToken || !backendBase) {
      setJobs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendBase}/jobs`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load jobs (${res.status})`);
      }
      const data = await res.json();
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return { jobs, loading, error, refetch: fetchJobs };
}
