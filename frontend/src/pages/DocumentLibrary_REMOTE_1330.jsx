import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/layout/AppShell';
import AIRewriteModal from '../components/AIRewriteModal/AIRewriteModal';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../hooks/useDocuments';
import './ShellPages.css';
import '../styles/Dashboard.css';

const DOC_TYPES = ['Resume', 'Cover Letter', 'Draft', 'Other'];
const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'created_at', label: 'Date Added' },
  { value: 'name', label: 'Name (A–Z)' },
];

function formatDocumentDate(dateStr, includeTime = false) {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return '—';
  const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  if (includeTime) {
    const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
    const date = parsed.toLocaleDateString('en-US', dateOptions);
    const time = parsed.toLocaleTimeString('en-US', timeOptions);
    return `${date} ${time}`;
  }
  return parsed.toLocaleDateString('en-US', dateOptions);
}

function getLinkedJobLabel(doc) {
  if (!doc.job_id) {
    return 'General';
  }
  if (!doc.jobs) {
    return 'Linked job';
  }
  const title = doc.jobs.title || 'Untitled role';
  const company = doc.jobs.company || 'Unknown company';
  return `${title} - ${company}`;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function DocumentLibrary() {
  const { session } = useAuth();
  const [selectedDocType, setSelectedDocType] = useState('');
  const [selectedSortBy, setSelectedSortBy] = useState('updated_at');
  const [showArchived, setShowArchived] = useState(false);

  const filters = useMemo(
    () => ({
      docType: selectedDocType || undefined,
      sortBy: selectedSortBy,
      includeArchived: showArchived,
    }),
    [selectedDocType, selectedSortBy, showArchived]
  );

  const {
    documents,
    loading,
    error,
    saving,
    deletingId,
    deleteError,
    renamingId,
    renameError,
    duplicatingId,
    duplicateError,
    archivingIds,
    archiveError,
    viewDocument,
    createDocument,
    deleteDocument,
    clearDeleteError,
    clearRenameError,
    clearDuplicateError,
    clearArchiveError,
    renameDocument,
    duplicateDocument,
    archiveDocument,
    restoreDocument,
    refetch,
  } = useDocuments(session?.access_token, true, filters);

  // Only display the most recent version of each document version group.
  const latestDocuments = useMemo(() => {
    if (!Array.isArray(documents) || documents.length === 0) return [];
    const latestByGroup = new Map();
    for (const doc of documents) {
      const group = doc.version_group_id ?? doc.id;
      const version = typeof doc.version_number === 'number' ? doc.version_number : 1;
      const cur = latestByGroup.get(group);
      if (!cur) {
        latestByGroup.set(group, doc);
        continue;
      }
      const curVersion = typeof cur.version_number === 'number' ? cur.version_number : 1;
      if (version > curVersion) {
        latestByGroup.set(group, doc);
      } else if (version === curVersion) {
        const curUpdated = new Date(cur.updated_at || cur.created_at || 0).getTime();
        const docUpdated = new Date(doc.updated_at || doc.created_at || 0).getTime();
        if (docUpdated > curUpdated) latestByGroup.set(group, doc);
      }
    }

    // Preserve relative order from the original list by iterating and collecting first-seen groups
    const seen = new Set();
    const result = [];
    for (const doc of documents) {
      const group = doc.version_group_id ?? doc.id;
      if (seen.has(group)) continue;
      const latest = latestByGroup.get(group);
      if (latest) {
        result.push(latest);
        seen.add(group);
      }
    }
    return result;
  }, [documents]);
  const [rewriteDoc, setRewriteDoc] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [renamingDocId, setRenamingDocId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [versionHistory, setVersionHistory] = useState([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const versionUploadInputRef = useRef(null);

  function openDocumentModal(doc) {
    clearDeleteError();
    setShowVersionHistory(false);
    setShowDuplicateForm(false);
    setVersionHistory([]);
    setVersionHistoryError(null);
    setDuplicateName('');
    clearDuplicateError();
    setSelectedDoc(doc);
  }

  const closeDocumentModal = useCallback(() => {
    setSelectedDoc(null);
    setShowDuplicateForm(false);
    setDuplicateName('');
    clearDuplicateError();
  }, [clearDuplicateError]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') closeDocumentModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDocumentModal]);

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === overlayRef.current) closeDocumentModal();
    },
    [closeDocumentModal]
  );

  const handleModalKeyDown = useCallback((e) => {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = Array.from(modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (window.document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (window.document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  async function handleDeleteDocument(documentId, docName) {
    if (!window.confirm(`Delete "${docName}"? This cannot be undone.`)) return;
    await deleteDocument(documentId);
  }

  function startDuplicate(doc) {
    openDocumentModal(doc);
    setShowDuplicateForm(true);
    setDuplicateName(`Copy of ${doc.name || 'Document'}`);
  }

  async function commitDuplicate() {
    if (!selectedDoc) return;
    const trimmed = duplicateName.trim();
    if (!trimmed) return;
    const created = await duplicateDocument(selectedDoc.id, trimmed);
    if (created) {
      setSelectedDoc(created);
      setShowDuplicateForm(false);
      setDuplicateName('');
      await refetch();
    }
  }

  function cancelDuplicate() {
    setShowDuplicateForm(false);
    setDuplicateName('');
  }

  async function handleArchiveDocument(documentId) {
    clearArchiveError();
    await archiveDocument(documentId);
  }

  async function handleRestoreDocument(documentId) {
    clearArchiveError();
    await restoreDocument(documentId);
  }

  function startRename(doc) {
    clearRenameError();
    setRenamingDocId(doc.id);
    setRenameValue(doc.name);
  }

  async function commitRename(documentId) {
    if (!renameValue.trim()) {
      setRenamingDocId(null);
      return;
    }
    const result = await renameDocument(documentId, renameValue);
    if (result) {
      setRenamingDocId(null);
    }
  }

  function cancelRename() {
    setRenamingDocId(null);
    setRenameValue('');
  }

  async function loadVersionHistory(docId) {
    if (!session?.access_token || !docId) return;
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
    if (!backendBase) {
      setVersionHistoryError('Backend URL is not configured.');
      return;
    }
    setVersionHistoryLoading(true);
    setVersionHistoryError(null);
    try {
      const res = await fetch(`${backendBase}/documents/${docId}/versions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load version history (${res.status})`);
      }
      const data = await res.json();
      setVersionHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setVersionHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setVersionHistoryLoading(false);
    }
  }

  async function openDocumentById(documentId) {
    if (!documentId) return;
    const url = await viewDocument(documentId);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleUploadNewVersion(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!selectedDoc || !file) return;

    const created = await createDocument({
      name: selectedDoc.name || file.name.replace(/\.[^.]+$/, '') || 'Document',
      doc_type: selectedDoc.doc_type || 'Draft',
      job_id: selectedDoc.job_id || undefined,
      source_document_id: selectedDoc.id,
      status: selectedDoc.status || undefined,
      tags: Array.isArray(selectedDoc.tags) ? selectedDoc.tags : undefined,
      file,
    });

    if (created) {
      await refetch();
      setSelectedDoc(created);
      setShowVersionHistory(false);
      setVersionHistory([]);
      setVersionHistoryError(null);
    }
  }

  return (
    <AppShell title="Document Library" notificationCount={0}>
      <section className="shell-card" aria-labelledby="document-library-heading">
        <div className="shell-card-header">
          <div>
            <h2 id="document-library-heading" className="shell-card-title">
              Documents
            </h2>
            <p className="shell-card-subtitle">
              Uploaded draft documents are stored in secure storage and linked to job context.
            </p>
          </div>
        </div>

        <div className="table-search-row">
          <div className="dashboard-filter-controls">
            <div className="dashboard-sort-control">
              <label className="dashboard-sort-label" htmlFor="doc-type-filter">
                Type
              </label>
              <select
                id="doc-type-filter"
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
              >
                <option value="">All Types</option>
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="dashboard-sort-control">
              <label className="dashboard-sort-label" htmlFor="doc-sort-select">
                Sort by
              </label>
              <select
                id="doc-sort-select"
                value={selectedSortBy}
                onChange={(e) => setSelectedSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="dashboard-sort-control">
              <label className="dashboard-sort-label" htmlFor="doc-show-archived">
                Show archived
              </label>
              <input
                id="doc-show-archived"
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
            </div>
          </div>
        </div>

        {deleteError && (
          <p className="table-empty table-state--error" role="alert">
            {deleteError}
          </p>
        )}

        {renameError && (
          <p className="table-empty table-state--error" role="alert">
            {renameError}
          </p>
        )}

        {archiveError && (
          <p className="table-empty table-state--error" role="alert">
            {archiveError}
          </p>
        )}

        {duplicateError && (
          <p className="table-empty table-state--error" role="alert">
            {duplicateError}
          </p>
        )}

        <table className="shell-table">
          <caption className="visually-hidden">
            Saved documents with name, type, linked job, created date, last updated date, and
            actions.
          </caption>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Type</th>
              <th>Linked To</th>
              <th>Created</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="table-empty">
                  <span role="status" aria-live="polite" aria-busy="true">
                    Loading documents...
                  </span>
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={7} className="table-empty table-state--error">
                  <div role="alert">{error}</div>
                </td>
              </tr>
            )}

            {!loading && !error && latestDocuments.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty">
                  No saved documents yet. Create a draft from any job in your dashboard.
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              latestDocuments.map((doc, index) => (
                <tr key={doc.id}>
                  <td className="row-number">{index + 1}</td>
                  <td className="shell-cell-strong">
                    {renamingDocId === doc.id ? (
                      <input
                        className="inline-rename-input"
                        aria-label="New document name"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(doc.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename(doc.id);
                          } else if (e.key === 'Escape') {
                            cancelRename();
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      doc.name
                    )}
                  </td>
                  <td>{doc.doc_type || 'Draft'}</td>
                  <td>{getLinkedJobLabel(doc)}</td>
                  <td>
                    <span className="date-text">{formatDocumentDate(doc.created_at, true)}</span>
                  </td>
                  <td>
                    <span className="date-text">
                      {formatDocumentDate(doc.updated_at || doc.created_at, true)}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      {(() => {
                        const isArchived = doc.status === 'archived';
                        const rowBusy =
                          deletingId === doc.id ||
                          renamingId === doc.id ||
                          duplicatingId === doc.id ||
                          archivingIds.has(doc.id);
                        return (
                          <>
                            <button
                              type="button"
                              className="action-btn"
                              aria-label="View document"
                              onClick={() => openDocumentModal(doc)}
                              disabled={rowBusy}
                            >
                              👁
                            </button>
                            {!isArchived && (
                              <>
                                <button
                                  type="button"
                                  className="action-btn"
                                  aria-label="Rename document"
                                  title="Rename"
                                  onClick={() => startRename(doc)}
                                  disabled={rowBusy}
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  className="action-btn"
                                  aria-label="Duplicate document"
                                  title="Duplicate"
                                  onClick={() => startDuplicate(doc)}
                                  disabled={rowBusy}
                                >
                                  📋
                                </button>
                                {doc.content && (
                                  <button
                                    type="button"
                                    className="action-btn"
                                    aria-label="Rewrite with AI"
                                    title="Rewrite with AI"
                                    onClick={() => setRewriteDoc(doc)}
                                    disabled={rowBusy}
                                  >
                                    ✦
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              type="button"
                              className="action-btn"
                              aria-label={isArchived ? 'Restore document' : 'Archive document'}
                              title={isArchived ? 'Restore' : 'Archive'}
                              onClick={() =>
                                isArchived
                                  ? handleRestoreDocument(doc.id)
                                  : handleArchiveDocument(doc.id)
                              }
                              disabled={rowBusy}
                            >
                              {archivingIds.has(doc.id) ? '…' : isArchived ? '↩' : '📦'}
                            </button>
                            {!isArchived && (
                              <button
                                type="button"
                                className="action-btn"
                                aria-label="Delete document"
                                onClick={() => handleDeleteDocument(doc.id, doc.name)}
                                disabled={rowBusy}
                              >
                                {deletingId === doc.id ? '…' : '🗑'}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {rewriteDoc && (
        <AIRewriteModal
          doc={rewriteDoc}
          accessToken={session?.access_token}
          onClose={() => setRewriteDoc(null)}
          onSaved={() => {
            setRewriteDoc(null);
            refetch();
          }}
        />
      )}

      {selectedDoc && (
        <div
          className="document-view-modal-overlay"
          role="presentation"
          onClick={handleOverlayClick}
          ref={overlayRef}
        >
          <div
            className="draft-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-view-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleModalKeyDown}
            tabIndex={-1}
            ref={modalRef}
          >
            <h2 className="document-view-modal-title" id="document-view-title">
              {selectedDoc.name || 'Document'}
            </h2>
            <p className="document-view-modal-text">
              <strong>Type:</strong> {selectedDoc.doc_type || 'Draft'}
            </p>
            <p className="document-view-modal-text">
              <strong>Status:</strong> {selectedDoc.status || '—'}
            </p>
            <p className="document-view-modal-text">
              <strong>Tags:</strong>{' '}
              {Array.isArray(selectedDoc.tags) && selectedDoc.tags.length > 0
                ? selectedDoc.tags.map((t, index) => (
                    <span
                      key={`${t}-${index}`}
                      className="draft-field-label"
                      style={{ display: 'inline-block', marginRight: 8 }}
                    >
                      {t}
                    </span>
                  ))
                : '—'}
            </p>
            <p className="document-view-modal-text">
              <strong>Version:</strong>{' '}
              {selectedDoc.version_number ? `v${selectedDoc.version_number}` : 'v1'}
            </p>
            <p className="document-view-modal-text">
              <strong>Linked:</strong> {getLinkedJobLabel(selectedDoc)}
            </p>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="document-view-modal-btn"
                onClick={() => versionUploadInputRef.current?.click()}
                disabled={versionHistoryLoading || saving}
              >
                Upload new version
              </button>
              <input
                ref={versionUploadInputRef}
                type="file"
                accept="application/pdf,.pdf"
                style={{ display: 'none' }}
                aria-label="Upload new version file"
                onChange={handleUploadNewVersion}
              />
              <button
                type="button"
                className="document-view-modal-btn"
                onClick={async () => {
                  const nextShow = !showVersionHistory;
                  setShowVersionHistory(nextShow);
                  if (nextShow && versionHistory.length === 0 && !versionHistoryLoading) {
                    await loadVersionHistory(selectedDoc.id);
                  }
                }}
              >
                {showVersionHistory ? 'Hide version history' : 'View version history'}
              </button>
              <button
                type="button"
                className="document-view-modal-btn"
                onClick={() => startDuplicate(selectedDoc)}
                disabled={duplicatingId === selectedDoc.id}
              >
                Duplicate with new name
              </button>
            </div>
            {showDuplicateForm && (
              <div style={{ marginTop: 14 }}>
                <label className="draft-field-label" htmlFor="duplicate-name-input">
                  Duplicate document name
                </label>
                <input
                  id="duplicate-name-input"
                  className="inline-rename-input"
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitDuplicate();
                    } else if (e.key === 'Escape') {
                      cancelDuplicate();
                    }
                  }}
                  autoFocus
                />
                {duplicateError && (
                  <p
                    className="document-view-modal-text"
                    role="alert"
                    style={{ color: 'var(--error)', fontSize: '12px', marginTop: 6 }}
                  >
                    {duplicateError}
                  </p>
                )}
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="document-view-modal-btn"
                    onClick={commitDuplicate}
                    disabled={duplicatingId === selectedDoc.id}
                  >
                    Save duplicate
                  </button>
                  <button
                    type="button"
                    className="document-view-modal-btn document-view-modal-btn--cancel"
                    onClick={cancelDuplicate}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {versionHistoryError && (
              <p
                className="document-view-modal-text"
                role="alert"
                style={{ color: 'var(--error)' }}
              >
                {versionHistoryError}
              </p>
            )}
            {showVersionHistory && (
              <div style={{ marginTop: 14 }}>
                {versionHistoryLoading ? (
                  <p className="document-view-modal-text" role="status" aria-live="polite">
                    Loading version history...
                  </p>
                ) : versionHistory.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }} aria-label="Version history list">
                    {versionHistory.map((version) => (
                      <li key={version.id} className="document-view-modal-text">
                        <div>
                          {version.name} - v{version.version_number || 1} -{' '}
                          {formatDocumentDate(version.updated_at || version.created_at, true)}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="document-view-modal-text">No version history available.</p>
                )}
              </div>
            )}
            <hr
              style={{ margin: '12px 0', border: 'none', borderTop: '1px solid var(--border)' }}
            />
            <p
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--text-secondary)',
                marginBottom: 8,
              }}
            >
              Timestamps
            </p>
            <p className="document-view-modal-text">
              <strong>Uploaded:</strong> {formatDocumentDate(selectedDoc.created_at, true)}
            </p>
            <p className="document-view-modal-text">
              <strong>Last Updated:</strong>{' '}
              {formatDocumentDate(selectedDoc.updated_at || selectedDoc.created_at, true)}
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="document-view-modal-btn"
                onClick={() => openDocumentById(selectedDoc.id)}
              >
                Open file
              </button>
              <button
                type="button"
                className="document-view-modal-btn document-view-modal-btn--cancel"
                onClick={closeDocumentModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
