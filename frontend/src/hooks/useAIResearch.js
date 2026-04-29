import { useCallback, useEffect, useRef, useState } from 'react';

export function useAIResearch(accessToken) {
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(null);

  const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

  useEffect(() => {
    return () => {
      pendingRef.current?.abort();
      pendingRef.current = null;
    };
  }, []);

  const research = useCallback(
    async (jobId, context) => {
      if (!backendBase || !accessToken) {
        setError('Not configured or authenticated.');
        return null;
      }
      pendingRef.current?.abort();
      const controller = new AbortController();
      pendingRef.current = controller;
      const { signal } = controller;

      setResearching(true);
      setError(null);
      try {
        const res = await fetch(`${backendBase}/ai/company-research`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ job_id: jobId, context }),
          signal,
        });
        if (signal.aborted) return null;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Failed to research company (${res.status})`);
        }
        const data = await res.json();
        if (signal.aborted) return null;
        return data.content;
      } catch (err) {
        if (signal.aborted) return null;
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        if (!signal.aborted) setResearching(false);
        if (pendingRef.current === controller) pendingRef.current = null;
      }
    },
    [accessToken, backendBase]
  );

  const clearError = useCallback(() => setError(null), []);

  return { research, researching, error, clearError };
}
