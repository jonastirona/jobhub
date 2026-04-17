import { useCallback, useEffect, useState } from 'react';

export function useReminders(accessToken) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReminders = useCallback(async () => {
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
    if (!accessToken || !backendBase) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    try {
      const res = await fetch(`${backendBase}/reminders`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Failed to load reminders (${res.status})`);
      const data = await res.json();
      setReminders(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }

    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  return { reminders, loading, error, refetch: fetchReminders };
}
