import { useCallback, useState } from 'react';

export function useAIResearch(accessToken) {
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState(null);

  const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

  const research = useCallback(
    async (jobId, context) => {
      if (!backendBase || !accessToken) {
        setError('Not configured or authenticated.');
        return null;
      }
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
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Failed to research company (${res.status})`);
        }
        const data = await res.json();
        return data.content;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setResearching(false);
      }
    },
    [accessToken, backendBase]
  );

  const clearError = useCallback(() => setError(null), []);

  return { research, researching, error, clearError };
}
