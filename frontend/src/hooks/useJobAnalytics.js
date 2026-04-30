import { useCallback, useEffect, useRef, useState } from 'react';

import * as Sentry from '@sentry/react';
import { extractErrorMessage } from '../utils/apiError';

export function useJobAnalytics(accessToken, jobId, refreshKey = 0) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(null);

  const fetchAnalytics = useCallback(async () => {
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
    if (!accessToken || !backendBase || !jobId) {
      pendingRef.current?.abort();
      pendingRef.current = null;
      setData(null);
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
      const res = await fetch(`${backendBase}/jobs/${jobId}/analytics`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
      if (!res.ok) {
        throw new Error(
          (await extractErrorMessage(res)) || `Failed to load analytics (${res.status})`
        );
      }
      const body = await res.json();
      if (signal.aborted) return;
      setData(body);
    } catch (err) {
      if (signal.aborted) return;
      Sentry.captureException(err);
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [accessToken, jobId]);

  useEffect(() => {
    fetchAnalytics();
    return () => pendingRef.current?.abort();
  }, [fetchAnalytics, refreshKey]);

  return { data, loading, error, refetch: fetchAnalytics };
}
