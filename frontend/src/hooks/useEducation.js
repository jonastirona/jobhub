import { useCallback, useEffect, useRef, useState } from 'react';

async function extractErrorMessage(res) {
  const contentType = res.headers?.get?.('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await res.json().catch(() => null);
    if (typeof body?.detail === 'string') return body.detail;
    if (body?.detail != null) return JSON.stringify(body.detail);
    if (body != null) return JSON.stringify(body);
  }
  return res.text().catch(() => '');
}

const byStartYearDesc = (a, b) => (b.start_year ?? 0) - (a.start_year ?? 0);

export function useEducation(accessToken) {
  const [education, setEducation] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const pendingSaveRef = useRef(null);

  const fetchEducation = useCallback(
    async (signal) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

      if (!accessToken || !backendBase) {
        setEducation([]);
        setError(null);
        setLoading(false);
        return;
      }

      if (signal?.aborted) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${backendBase}/education`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        if (!res.ok) throw new Error(`Failed to load education (${res.status})`);
        const data = await res.json();
        if (signal?.aborted) return;
        setEducation(data);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchEducation(controller.signal);
    return () => controller.abort();
  }, [fetchEducation]);

  useEffect(() => {
    return () => {
      pendingSaveRef.current?.abort();
      pendingSaveRef.current = null;
    };
  }, []);

  const addEducation = useCallback(
    async (values) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase) {
        setSaveError('Backend URL is not configured.');
        return false;
      }
      if (!accessToken) {
        setSaveError('You are not authenticated. Please sign in again.');
        return false;
      }
      pendingSaveRef.current?.abort();
      const controller = new AbortController();
      pendingSaveRef.current = controller;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch(`${backendBase}/education`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(values),
          signal: controller.signal,
        });
        if (!res.ok) {
          const message = await extractErrorMessage(res);
          throw new Error(message || `Failed to add education entry (${res.status})`);
        }
        const created = await res.json();
        if (controller.signal.aborted) return false;
        setEducation((prev) => [...prev, created].sort(byStartYearDesc));
        setError(null);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        setSaveError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        if (!controller.signal.aborted) setSaving(false);
        if (pendingSaveRef.current === controller) pendingSaveRef.current = null;
      }
    },
    [accessToken]
  );

  const updateEducation = useCallback(
    async (id, values) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase) {
        setSaveError('Backend URL is not configured.');
        return false;
      }
      if (!accessToken) {
        setSaveError('You are not authenticated. Please sign in again.');
        return false;
      }
      pendingSaveRef.current?.abort();
      const controller = new AbortController();
      pendingSaveRef.current = controller;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch(`${backendBase}/education/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(values),
          signal: controller.signal,
        });
        if (!res.ok) {
          const message = await extractErrorMessage(res);
          throw new Error(message || `Failed to update education entry (${res.status})`);
        }
        const updated = await res.json();
        if (controller.signal.aborted) return false;
        setEducation((prev) => prev.map((e) => (e.id === id ? updated : e)).sort(byStartYearDesc));
        setError(null);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        setSaveError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        if (!controller.signal.aborted) setSaving(false);
        if (pendingSaveRef.current === controller) pendingSaveRef.current = null;
      }
    },
    [accessToken]
  );

  const deleteEducation = useCallback(
    async (id) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase) {
        setSaveError('Backend URL is not configured.');
        return false;
      }
      if (!accessToken) {
        setSaveError('You are not authenticated. Please sign in again.');
        return false;
      }
      pendingSaveRef.current?.abort();
      const controller = new AbortController();
      pendingSaveRef.current = controller;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch(`${backendBase}/education/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const message = await extractErrorMessage(res);
          throw new Error(message || `Failed to delete education entry (${res.status})`);
        }
        if (controller.signal.aborted) return false;
        setEducation((prev) => prev.filter((e) => e.id !== id));
        setError(null);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        setSaveError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        if (!controller.signal.aborted) setSaving(false);
        if (pendingSaveRef.current === controller) pendingSaveRef.current = null;
      }
    },
    [accessToken]
  );

  return {
    education,
    loading,
    error,
    saving,
    saveError,
    addEducation,
    updateEducation,
    deleteEducation,
  };
}
