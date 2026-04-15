import { useCallback, useEffect, useRef, useState } from 'react';

export function useJobs(accessToken, searchTerm = '') {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pendingRef = useRef(null);
  const authContextRef = useRef(null);
  const hasLoadedForAuthContextRef = useRef(false);

  const fetchJobs = useCallback(async () => {
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

    if (!accessToken || !backendBase) {
      pendingRef.current?.abort();
      pendingRef.current = null;
      authContextRef.current = null;
      hasLoadedForAuthContextRef.current = false;
      setJobs([]);
      setError(null);
      setLoading(false);
      return;
    }

    const authContext = `${backendBase}::${accessToken}`;
    const isNewAuthContext = authContextRef.current !== authContext;
    if (isNewAuthContext) {
      authContextRef.current = authContext;
      hasLoadedForAuthContextRef.current = false;
    }

    // Abort any in-flight request before starting a new one
    pendingRef.current?.abort();
    const controller = new AbortController();
    pendingRef.current = controller;
    const { signal } = controller;

    setLoading(!hasLoadedForAuthContextRef.current);
    setError(null);

    try {
      const query = searchTerm.trim();
      const url = query
        ? `${backendBase}/jobs?q=${encodeURIComponent(query)}`
        : `${backendBase}/jobs`;

      const res = await fetch(url, {
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
        hasLoadedForAuthContextRef.current = true;
        setLoading(false);
      }
    }
  }, [accessToken, searchTerm]);

  useEffect(() => {
    fetchJobs();
    return () => pendingRef.current?.abort();
  }, [fetchJobs]);

  return { jobs, loading, error, refetch: fetchJobs };
}
