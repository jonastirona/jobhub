import { useCallback, useEffect, useRef, useState } from 'react';

import * as Sentry from '@sentry/react';
import { extractErrorMessage } from '../utils/apiError';

export function useDocuments(accessToken, loadOnMount = true) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(loadOnMount);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
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
        Sentry.captureException(err);
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
        const formData = new FormData();
        formData.append('name', values?.name || '');
        formData.append('doc_type', values?.doc_type || 'Draft');
        if (values?.job_id) {
          formData.append('job_id', values.job_id);
        }
        if (values?.content) {
          formData.append('content', values.content);
        }
        if (values?.file) {
          formData.append('file', values.file);
        }

        const res = await fetch(`${backendBase}/documents`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(
            (await extractErrorMessage(res)) || `Failed to save document (${res.status})`
          );
        }

        const created = await res.json();
        if (controller.signal.aborted) return null;
        setDocuments((prev) => [created, ...prev]);
        return created;
      } catch (err) {
        if (controller.signal.aborted) return null;
        Sentry.captureException(err);
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

  const viewDocument = useCallback(
    async (documentId) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase || !accessToken || !documentId) return null;
      try {
        const res = await fetch(`${backendBase}/documents/${documentId}/view-url`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          throw new Error(
            (await extractErrorMessage(res)) || `Failed to open document (${res.status})`
          );
        }
        const data = await res.json();
        const url = data?.url;
        if (!url) {
          throw new Error('Document link is unavailable.');
        }
        return url;
      } catch (err) {
        Sentry.captureException(err);
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [accessToken]
  );

  const clearDeleteError = useCallback(() => {
    setDeleteError(null);
  }, []);

  const deleteDocument = useCallback(
    async (documentId) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase) {
        setDeleteError('Backend URL is not configured.');
        return false;
      }
      if (!accessToken) {
        setDeleteError('You are not authenticated. Please sign in again.');
        return false;
      }
      if (!documentId) {
        setDeleteError('Document id is required.');
        return false;
      }

      setDeletingId(documentId);
      setDeleteError(null);
      try {
        const res = await fetch(`${backendBase}/documents/${documentId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          throw new Error(
            (await extractErrorMessage(res)) || `Failed to delete document (${res.status})`
          );
        }
        setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
        return true;
      } catch (err) {
        Sentry.captureException(err);
        setDeleteError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setDeletingId(null);
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
    deletingId,
    deleteError,
    clearSaveError,
    clearDeleteError,
    refetch,
    createDocument,
    deleteDocument,
    viewDocument,
  };
}
