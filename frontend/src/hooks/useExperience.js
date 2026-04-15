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

export function useExperience(accessToken) {
  const [experience, setExperience] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const pendingSaveRef = useRef(null);

  const fetchExperience = useCallback(
    async (signal) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

      if (!accessToken || !backendBase) {
        setExperience([]);
        setError(null);
        setLoading(false);
        return;
      }

      if (signal?.aborted) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${backendBase}/experience`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        if (!res.ok) throw new Error(`Failed to load experience (${res.status})`);
        const data = await res.json();
        if (signal?.aborted) return;
        setExperience(data);
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
    fetchExperience(controller.signal);
    return () => controller.abort();
  }, [fetchExperience]);

  useEffect(() => {
    return () => {
      pendingSaveRef.current?.abort();
      pendingSaveRef.current = null;
    };
  }, []);

  const addExperience = useCallback(
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
        const res = await fetch(`${backendBase}/experience`, {
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
          throw new Error(message || `Failed to add experience entry (${res.status})`);
        }
        const created = await res.json();
        if (controller.signal.aborted) return false;
        setExperience((prev) => [...prev, created]);
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

  const updateExperience = useCallback(
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
        const res = await fetch(`${backendBase}/experience/${id}`, {
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
          throw new Error(message || `Failed to update experience entry (${res.status})`);
        }
        const updated = await res.json();
        if (controller.signal.aborted) return false;
        setExperience((prev) => prev.map((e) => (e.id === id ? updated : e)));
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

  const deleteExperience = useCallback(
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
        const res = await fetch(`${backendBase}/experience/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const message = await extractErrorMessage(res);
          throw new Error(message || `Failed to delete experience entry (${res.status})`);
        }
        if (controller.signal.aborted) return false;
        setExperience((prev) => prev.filter((e) => e.id !== id));
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

  const reorderExperience = useCallback(
    async (orderedIds) => {
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
        const res = await fetch(`${backendBase}/experience/reorder`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ ids: orderedIds }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const message = await extractErrorMessage(res);
          throw new Error(message || `Failed to reorder experience (${res.status})`);
        }
        const reordered = await res.json();
        if (controller.signal.aborted) return false;
        setExperience(reordered);
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
    experience,
    loading,
    error,
    saving,
    saveError,
    addExperience,
    updateExperience,
    deleteExperience,
    reorderExperience,
  };
}
