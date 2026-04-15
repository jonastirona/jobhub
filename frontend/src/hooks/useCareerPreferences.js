import { useCallback, useEffect, useRef, useState } from 'react';

export function useCareerPreferences(accessToken) {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const pendingSaveRef = useRef(null);

  const fetchPreferences = useCallback(
    async (signal) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

      if (!accessToken || !backendBase) {
        setPreferences(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (signal?.aborted) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${backendBase}/career-preferences`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        if (!res.ok) throw new Error(`Failed to load career preferences (${res.status})`);
        const data = await res.json();
        if (signal?.aborted) return;
        setPreferences(data);
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
    fetchPreferences(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchPreferences]);

  useEffect(() => {
    return () => {
      pendingSaveRef.current?.abort();
      pendingSaveRef.current = null;
    };
  }, []);

  const savePreferences = useCallback(
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
        const res = await fetch(`${backendBase}/career-preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(values),
          signal: controller.signal,
        });
        if (!res.ok) {
          const contentType = res.headers.get('content-type') || '';
          let message = '';
          if (contentType.includes('application/json')) {
            const body = await res.json().catch(() => null);
            if (typeof body?.detail === 'string') {
              message = body.detail;
            } else if (body?.detail != null) {
              message = JSON.stringify(body.detail);
            } else if (body != null) {
              message = JSON.stringify(body);
            }
          } else {
            message = await res.text().catch(() => '');
          }
          throw new Error(message || `Save failed (${res.status})`);
        }
        const saved = await res.json();
        if (controller.signal.aborted) return false;
        setPreferences(saved);
        return true;
      } catch (err) {
        if (controller.signal.aborted) return false;
        setSaveError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        if (!controller.signal.aborted) setSaving(false);
      }
    },
    [accessToken]
  );

  return { preferences, loading, error, saving, saveError, savePreferences };
}
