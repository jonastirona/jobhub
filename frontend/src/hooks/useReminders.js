import { useCallback, useEffect, useState } from 'react';

export function useReminders(accessToken) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReminders = useCallback(
    async (signal) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!accessToken || !backendBase) {
        setReminders([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${backendBase}/reminders`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        if (!res.ok) throw new Error(`Failed to load reminders (${res.status})`);
        const data = await res.json();
        if (signal?.aborted) return;
        setReminders(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchReminders(controller.signal);
    return () => controller.abort();
  }, [fetchReminders]);

  return { reminders, loading, error, refetch: fetchReminders };
}
