import { useCallback, useEffect, useRef, useState } from 'react';

export function useProfile(accessToken) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const pendingFetchRef = useRef(null);
  const pendingSaveRef = useRef(null);

  const fetchProfile = useCallback(
    async (signal) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

      if (!accessToken || !backendBase) {
        setProfile(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (signal?.aborted) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${backendBase}/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
        const data = await res.json();
        if (signal?.aborted) return;
        setProfile(data);
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
    pendingFetchRef.current = controller;
    fetchProfile(controller.signal);
    return () => {
      controller.abort();
      pendingFetchRef.current = null;
    };
  }, [fetchProfile]);

  useEffect(() => {
    return () => {
      pendingSaveRef.current?.abort();
      pendingSaveRef.current = null;
    };
  }, []);

  const refetch = useCallback(() => {
    pendingFetchRef.current?.abort();
    const controller = new AbortController();
    pendingFetchRef.current = controller;
    fetchProfile(controller.signal);
  }, [fetchProfile]);

  const saveProfile = useCallback(
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
        const res = await fetch(`${backendBase}/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(values),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Save failed (${res.status})`);
        }
        const saved = await res.json();
        if (controller.signal.aborted) return false;
        setProfile(saved);
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

  return { profile, loading, error, saving, saveError, saveProfile, refetch };
}
