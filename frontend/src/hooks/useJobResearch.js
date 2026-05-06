import { useCallback, useEffect, useRef, useState } from 'react';

export function useJobResearch(accessToken) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(null);

  const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

  useEffect(() => {
    return () => {
      pendingRef.current?.abort();
      pendingRef.current = null;
    };
  }, []);

  const saveResearch = useCallback(
    async (jobId, research) => {
      if (!backendBase || !accessToken) {
        setError('Not configured or authenticated.');
        return null;
      }
      pendingRef.current?.abort();
      const controller = new AbortController();
      pendingRef.current = controller;
      const { signal } = controller;

      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`${backendBase}/jobs/${jobId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ research }),
          signal,
        });
        if (signal.aborted) return null;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Failed to save research (${res.status})`);
        }
        const data = await res.json();
        if (signal.aborted) return null;
        return data;
      } catch (err) {
        if (signal.aborted) return null;
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        if (!signal.aborted) setSaving(false);
        if (pendingRef.current === controller) pendingRef.current = null;
      }
    },
    [accessToken, backendBase]
  );

  const clearError = useCallback(() => setError(null), []);

  return { saveResearch, saving, error, clearError };
}
