import { useCallback, useEffect, useRef, useState } from 'react';

export function useDocuments(accessToken, loadOnMount = true) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(loadOnMount);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const pendingFetchRef = useRef(null);
  const pendingSaveRef = useRef(null);

  const fetchDocuments = useCallback(
    async (signal) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

      if (!accessToken || !backendBase) {
        setDocuments([]);
        setError(null);
        setLoading(false);
        return;
      }

      if (signal?.aborted) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${backendBase}/documents`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        if (!res.ok) {
          throw new Error(`Failed to load documents (${res.status})`);
        }
        const data = await res.json();
        if (signal?.aborted) return;
        setDocuments(Array.isArray(data) ? data : []);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [accessToken]
  );

  useEffect(() => {
    if (!loadOnMount) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    pendingFetchRef.current = controller;
    fetchDocuments(controller.signal);
    return () => {
      controller.abort();
      pendingFetchRef.current = null;
    };
  }, [fetchDocuments, loadOnMount]);

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
    fetchDocuments(controller.signal);
  }, [fetchDocuments]);

  const clearSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  const createDocument = useCallback(
    async (values) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase) {
        setSaveError('Backend URL is not configured.');
        return null;
      }
      if (!accessToken) {
        setSaveError('You are not authenticated. Please sign in again.');
        return null;
      }

      pendingSaveRef.current?.abort();
      const controller = new AbortController();
      pendingSaveRef.current = controller;

      setSaving(true);
      setSaveError(null);

      try {
        const res = await fetch(`${backendBase}/documents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(values),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Failed to save document (${res.status})`);
        }

        const created = await res.json();
        if (controller.signal.aborted) return null;
        setDocuments((prev) => [created, ...prev]);
        return created;
      } catch (err) {
        if (controller.signal.aborted) return null;
        setSaveError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        if (!controller.signal.aborted) {
          setSaving(false);
        }
      }
    },
    [accessToken]
  );

  return {
    documents,
    loading,
    error,
    saving,
    saveError,
    clearSaveError,
    refetch,
    createDocument,
  };
}
