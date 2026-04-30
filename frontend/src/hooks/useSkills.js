import { useCallback, useEffect, useRef, useState } from 'react';

import * as Sentry from '@sentry/react';
import { extractErrorMessage } from '../utils/apiError';

export function useSkills(accessToken) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const pendingSaveRef = useRef(null);

  const fetchSkills = useCallback(
    async (signal) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

      if (!accessToken || !backendBase) {
        setSkills([]);
        setError(null);
        setLoading(false);
        return;
      }

      if (signal?.aborted) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${backendBase}/skills`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        if (!res.ok) throw new Error(`Failed to load skills (${res.status})`);
        const data = await res.json();
        if (signal?.aborted) return;
        setSkills(data);
      } catch (err) {
        if (signal?.aborted) return;
        Sentry.captureException(err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSkills(controller.signal);
    return () => controller.abort();
  }, [fetchSkills]);

  useEffect(() => {
    return () => {
      pendingSaveRef.current?.abort();
      pendingSaveRef.current = null;
    };
  }, []);

  const addSkill = useCallback(
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
        const res = await fetch(`${backendBase}/skills`, {
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
          throw new Error(message || `Failed to add skill (${res.status})`);
        }
        const created = await res.json();
        if (controller.signal.aborted) return false;
        setSkills((prev) => [...prev, created]);
        setError(null);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        Sentry.captureException(err);
        setSaveError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        if (!controller.signal.aborted) setSaving(false);
        if (pendingSaveRef.current === controller) pendingSaveRef.current = null;
      }
    },
    [accessToken]
  );

  const updateSkill = useCallback(
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
        const res = await fetch(`${backendBase}/skills/${id}`, {
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
          throw new Error(message || `Failed to update skill (${res.status})`);
        }
        const updated = await res.json();
        if (controller.signal.aborted) return false;
        setSkills((prev) => prev.map((s) => (s.id === id ? updated : s)));
        setError(null);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        Sentry.captureException(err);
        setSaveError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        if (!controller.signal.aborted) setSaving(false);
        if (pendingSaveRef.current === controller) pendingSaveRef.current = null;
      }
    },
    [accessToken]
  );

  const deleteSkill = useCallback(
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
        const res = await fetch(`${backendBase}/skills/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const message = await extractErrorMessage(res);
          throw new Error(message || `Failed to delete skill (${res.status})`);
        }
        if (controller.signal.aborted) return false;
        setSkills((prev) => prev.filter((s) => s.id !== id));
        setError(null);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        Sentry.captureException(err);
        setSaveError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        if (!controller.signal.aborted) setSaving(false);
        if (pendingSaveRef.current === controller) pendingSaveRef.current = null;
      }
    },
    [accessToken]
  );

  const reorderSkills = useCallback(
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
        const res = await fetch(`${backendBase}/skills/reorder`, {
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
          throw new Error(message || `Failed to reorder skills (${res.status})`);
        }
        const reordered = await res.json();
        if (controller.signal.aborted) return false;
        setSkills(reordered);
        setError(null);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        Sentry.captureException(err);
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
    skills,
    loading,
    error,
    saving,
    saveError,
    addSkill,
    updateSkill,
    deleteSkill,
    reorderSkills,
  };
}
