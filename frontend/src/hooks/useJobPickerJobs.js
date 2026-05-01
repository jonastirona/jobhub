import { useCallback, useEffect, useRef, useState } from 'react';

import * as Sentry from '@sentry/react';

/**
 * Loads up to 100 jobs with no facet filters — for UI pickers (e.g. analytics)
 * that must not depend on the main dashboard filter state.
 */
export function useJobPickerJobs(accessToken, refreshKey = 0) {
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

    pendingRef.current?.abort();
    const controller = new AbortController();
    pendingRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: '1',
        page_size: '100',
        sort_by: 'company',
      });
      const res = await fetch(`${backendBase}/jobs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
      if (!res.ok) {
        throw new Error(`Failed to load jobs (${res.status})`);
      }
      const data = await res.json();
      if (signal.aborted) return;
      const items = Array.isArray(data) ? data : data.items || [];
      setJobs(items);
    } catch (err) {
      if (signal.aborted) return;
      Sentry.captureException(err);
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
  }, [fetchJobs, refreshKey]);

  return { jobs, loading, error, refetch: fetchJobs };
}
