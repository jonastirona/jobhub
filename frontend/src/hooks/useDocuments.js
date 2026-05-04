import * as Sentry from '@sentry/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { extractErrorMessage } from '../utils/apiError';

export function useDocuments(accessToken, loadOnMount = true, filters = {}) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(loadOnMount);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameError, setRenameError] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [duplicateError, setDuplicateError] = useState(null);
  const [archivingId, setArchivingId] = useState(null);
  const [archiveError, setArchiveError] = useState(null);
  const pendingFetchRef = useRef(null);
  const pendingSaveRef = useRef(null);

  const { docType, sortBy, includeArchived } = filters;

  const sortDocuments = useCallback(
    (docs) => {
      if (!sortBy) return docs;
      return [...docs].sort((a, b) => {
        if (sortBy === 'name') {
          return (a.name || '').localeCompare(b.name || '');
        }
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        return bVal.localeCompare(aVal);
      });
    },
    [sortBy]
  );

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
        const params = new URLSearchParams();
        if (docType) params.set('doc_type', docType);
        if (sortBy) params.set('sort_by', sortBy);
        if (includeArchived) params.set('include_archived', 'true');
        const qs = params.toString() ? `?${params.toString()}` : '';
        const res = await fetch(`${backendBase}/documents${qs}`, {
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
    [accessToken, docType, sortBy, includeArchived]
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
        if (values?.status) {
          formData.append('status', values.status);
        }
        if (values?.tags) {
          if (Array.isArray(values.tags)) {
            formData.append('tags', JSON.stringify(values.tags));
          } else {
            formData.append('tags', String(values.tags));
          }
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
        if (pendingSaveRef.current === controller) pendingSaveRef.current = null;
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
        setError(null);
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

  const clearRenameError = useCallback(() => {
    setRenameError(null);
  }, []);

  const clearDuplicateError = useCallback(() => {
    setDuplicateError(null);
  }, []);

  const clearArchiveError = useCallback(() => {
    setArchiveError(null);
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

  const renameDocument = useCallback(
    async (documentId, newName) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase || !accessToken || !documentId) return null;
      const trimmed = (newName || '').trim();
      if (!trimmed) {
        setRenameError('Name must not be blank.');
        return null;
      }
      setRenamingId(documentId);
      setRenameError(null);
      try {
        const res = await fetch(`${backendBase}/documents/${documentId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) {
          throw new Error(
            (await extractErrorMessage(res)) || `Failed to rename document (${res.status})`
          );
        }
        const updated = await res.json();
        setDocuments((prev) =>
          sortDocuments(prev.map((d) => (d.id === documentId ? { ...d, ...updated } : d)))
        );
        return updated;
      } catch (err) {
        Sentry.captureException(err);
        setRenameError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setRenamingId(null);
      }
    },
    [accessToken, sortDocuments]
  );

  const duplicateDocument = useCallback(
    async (documentId) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase || !accessToken || !documentId) return null;
      setDuplicatingId(documentId);
      setDuplicateError(null);
      try {
        const res = await fetch(`${backendBase}/documents/${documentId}/duplicate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          throw new Error(
            (await extractErrorMessage(res)) || `Failed to duplicate document (${res.status})`
          );
        }
        const created = await res.json();
        setDocuments((prev) => sortDocuments([created, ...prev]));
        return created;
      } catch (err) {
        Sentry.captureException(err);
        setDuplicateError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setDuplicatingId(null);
      }
    },
    [accessToken, sortDocuments]
  );

  const archiveDocument = useCallback(
    async (documentId) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase || !accessToken || !documentId) return null;
      setArchivingId(documentId);
      setArchiveError(null);
      try {
        const res = await fetch(`${backendBase}/documents/${documentId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'archived' }),
        });
        if (!res.ok) {
          throw new Error(
            (await extractErrorMessage(res)) || `Failed to archive document (${res.status})`
          );
        }
        const updated = await res.json();
        if (includeArchived) {
          setDocuments((prev) =>
            sortDocuments(prev.map((d) => (d.id === documentId ? { ...d, ...updated } : d)))
          );
        } else {
          setDocuments((prev) => prev.filter((d) => d.id !== documentId));
        }
        return updated;
      } catch (err) {
        Sentry.captureException(err);
        setArchiveError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setArchivingId(null);
      }
    },
    [accessToken, includeArchived, sortDocuments]
  );

  const restoreDocument = useCallback(
    async (documentId) => {
      const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
      if (!backendBase || !accessToken || !documentId) return null;
      setArchivingId(documentId);
      setArchiveError(null);
      try {
        const res = await fetch(`${backendBase}/documents/${documentId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'draft' }),
        });
        if (!res.ok) {
          throw new Error(
            (await extractErrorMessage(res)) || `Failed to restore document (${res.status})`
          );
        }
        const updated = await res.json();
        setDocuments((prev) =>
          sortDocuments([updated, ...prev.filter((d) => d.id !== documentId)])
        );
        return updated;
      } catch (err) {
        Sentry.captureException(err);
        setArchiveError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setArchivingId(null);
      }
    },
    [accessToken, sortDocuments]
  );

  return {
    documents,
    loading,
    error,
    saving,
    saveError,
    deletingId,
    deleteError,
    renamingId,
    renameError,
    duplicatingId,
    duplicateError,
    archivingId,
    archiveError,
    clearSaveError,
    clearDeleteError,
    clearRenameError,
    clearDuplicateError,
    clearArchiveError,
    refetch,
    createDocument,
    deleteDocument,
    viewDocument,
    renameDocument,
    duplicateDocument,
    archiveDocument,
    restoreDocument,
  };
}
