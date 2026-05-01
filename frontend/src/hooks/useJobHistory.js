import { useCallback, useEffect, useState } from 'react';

import * as Sentry from '@sentry/react';
import { extractErrorMessage } from '../utils/apiError';

export function useJobHistory(jobId, accessToken) {
  const [history, setHistory] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savingInterview, setSavingInterview] = useState(false);
  const [interviewError, setInterviewError] = useState(null);

  const getBackendBase = useCallback(
    () => (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null,
    []
  );

  const fetchHistory = useCallback(async () => {
    const backendBase = getBackendBase();
    if (!jobId || !accessToken || !backendBase) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendBase}/jobs/${jobId}/history`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [jobId, accessToken, getBackendBase]);

  const fetchInterviews = useCallback(async () => {
    const backendBase = getBackendBase();
    if (!jobId || !accessToken || !backendBase) return;
    setInterviewLoading(true);
    setInterviewError(null);
    try {
      const res = await fetch(`${backendBase}/jobs/${jobId}/interviews`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to load interviews (${res.status})`);
      const data = await res.json();
      setInterviews(data);
      setInterviewError(null);
    } catch (err) {
      Sentry.captureException(err);
      setInterviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setInterviewLoading(false);
    }
  }, [jobId, accessToken, getBackendBase]);

  const createInterview = useCallback(
    async (payload) => {
      const backendBase = getBackendBase();
      if (!jobId || !accessToken || !backendBase) throw new Error('Missing configuration');
      setSavingInterview(true);
      setInterviewError(null);
      try {
        const res = await fetch(`${backendBase}/jobs/${jobId}/interviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error((await extractErrorMessage(res)) || `Request failed (${res.status})`);
        }
        await fetchInterviews();
      } catch (err) {
        Sentry.captureException(err);
        const msg = err instanceof Error ? err.message : String(err);
        setInterviewError(msg);
        throw err;
      } finally {
        setSavingInterview(false);
      }
    },
    [jobId, accessToken, getBackendBase, fetchInterviews]
  );

  const updateInterview = useCallback(
    async (interviewId, payload) => {
      const backendBase = getBackendBase();
      if (!jobId || !accessToken || !backendBase) throw new Error('Missing configuration');
      setSavingInterview(true);
      setInterviewError(null);
      try {
        const res = await fetch(`${backendBase}/jobs/${jobId}/interviews/${interviewId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error((await extractErrorMessage(res)) || `Request failed (${res.status})`);
        }
        await fetchInterviews();
      } catch (err) {
        Sentry.captureException(err);
        const msg = err instanceof Error ? err.message : String(err);
        setInterviewError(msg);
        throw err;
      } finally {
        setSavingInterview(false);
      }
    },
    [jobId, accessToken, getBackendBase, fetchInterviews]
  );

  const deleteInterview = useCallback(
    async (interviewId) => {
      const backendBase = getBackendBase();
      if (!jobId || !accessToken || !backendBase) throw new Error('Missing configuration');
      setSavingInterview(true);
      setInterviewError(null);
      try {
        const res = await fetch(`${backendBase}/jobs/${jobId}/interviews/${interviewId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          throw new Error((await extractErrorMessage(res)) || `Request failed (${res.status})`);
        }
        await fetchInterviews();
      } catch (err) {
        Sentry.captureException(err);
        const msg = err instanceof Error ? err.message : String(err);
        setInterviewError(msg);
        throw err;
      } finally {
        setSavingInterview(false);
      }
    },
    [jobId, accessToken, getBackendBase, fetchInterviews]
  );

  useEffect(() => {
    fetchHistory().catch((err) => {
      throw err;
    });

    fetchInterviews().catch((err) => {
      throw err;
    });
  }, [fetchHistory, fetchInterviews]);

  return {
    history,
    interviews,
    loading,
    interviewLoading,
    error,
    savingInterview,
    interviewError,
    createInterview,
    updateInterview,
    deleteInterview,
  };
}
