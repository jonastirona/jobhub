import { useCallback, useEffect, useRef, useState } from 'react';

function normalizeProfileResponse(data) {
  if (data && typeof data === 'object' && ('profile' in data || 'completion' in data)) {
    return {
      profile: data.profile ?? null,
      completion: data.completion ?? null,
    };
  }

  return {
    profile: data ?? null,
    completion: null,
  };
}

export function useProfile(accessToken) {
  const [profile, setProfile] = useState(null);
  const [completion, setCompletion] = useState(null);
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
        setCompletion(null);
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
        const normalized = normalizeProfileResponse(data);
        setProfile(normalized.profile);
        setCompletion(normalized.completion);
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
        return { ok: false, error: 'Backend URL is not configured.' };
      }
      if (!accessToken) {
        setSaveError('You are not authenticated. Please sign in again.');
        return { ok: false, error: 'You are not authenticated. Please sign in again.' };
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
          const contentType = res.headers?.get?.('content-type') ?? '';
          let message = '';
          if (contentType.includes('application/json')) {
            const body = await res.json().catch(() => null);
            if (typeof body?.detail === 'string') message = body.detail;
            else if (body?.detail != null) message = JSON.stringify(body.detail);
            else if (body != null) message = JSON.stringify(body);
          } else {
            message = await res.text().catch(() => '');
          }
          throw new Error(message || `Save failed (${res.status})`);
        }
        const saved = await res.json();
        if (controller.signal.aborted) return { ok: false, error: null };
        const normalized = normalizeProfileResponse(saved);
        setProfile(normalized.profile);
        setCompletion(normalized.completion);
        return { ok: true, profile: normalized.profile, completion: normalized.completion };
      } catch (err) {
        if (controller.signal.aborted) return { ok: false, error: null };
        const message = err instanceof Error ? err.message : String(err);
        setSaveError(message);
        return { ok: false, error: message };
      } finally {
        if (pendingSaveRef.current === controller) pendingSaveRef.current = null;
        if (!controller.signal.aborted) setSaving(false);
      }
    },
    [accessToken]
  );

  return { profile, completion, loading, error, saving, saveError, saveProfile, refetch };
}
