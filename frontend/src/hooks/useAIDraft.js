import { useCallback, useState } from 'react';

import * as Sentry from '@sentry/react';

export function useAIDraft(accessToken) {
  const [generating, setGenerating] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [error, setError] = useState(null);

  const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

  const generate = useCallback(
    async (type, jobId) => {
      if (!backendBase || !accessToken) {
        setError('Not configured or authenticated.');
        return null;
      }
      setGenerating(true);
      setError(null);
      try {
        const res = await fetch(`${backendBase}/ai/generate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type, job_id: jobId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Failed to generate draft (${res.status})`);
        }
        const data = await res.json();
        return data.content;
      } catch (err) {
        Sentry.captureException(err);
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setGenerating(false);
      }
    },
    [accessToken, backendBase]
  );

  const rewrite = useCallback(
    async (content, instructions) => {
      if (!backendBase || !accessToken) {
        setError('Not configured or authenticated.');
        return null;
      }
      setRewriting(true);
      setError(null);
      try {
        const res = await fetch(`${backendBase}/ai/rewrite`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content, instructions }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Failed to rewrite draft (${res.status})`);
        }
        const data = await res.json();
        return data.content;
      } catch (err) {
        Sentry.captureException(err);
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setRewriting(false);
      }
    },
    [accessToken, backendBase]
  );

  const clearError = useCallback(() => setError(null), []);

  return { generate, rewrite, generating, rewriting, error, clearError };
}
