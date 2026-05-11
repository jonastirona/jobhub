import { Fragment, useMemo, useState, useRef } from 'react';
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
    saveError,
    deletingId,
    deleteError,
    renamingId,
    renameError,
    duplicatingId,
    duplicateError,
    archivingIds,
    archiveError,
    viewDocument,
    deleteDocument,
    clearDeleteError,
    clearRenameError,
    clearArchiveError,
    clearSaveError,
    renameDocument,
    duplicateDocument,
    archiveDocument,
    restoreDocument,
    createDocument,
    refetch,
  } = useDocuments(session?.access_token, true, filters);

  const [rewriteDoc, setRewriteDoc] = useState(null);
  const [expandedDocIds, setExpandedDocIds] = useState(() => new Set());
  const [renamingDocId, setRenamingDocId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const skipBlurRef = useRef(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadType, setUploadType] = useState('Resume');
  const [uploadFile, setUploadFile] = useState(null);
  const uploadFileRef = useRef(null);

  async function openDocument(documentId) {
    const url = await viewDocument(documentId);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function handleDownloadDocument(documentRecord) {
    if (!documentRecord?.id) return;
    let objectUrl = null;
    const link = document.createElement('a');
    try {
      const url = await viewDocument(documentRecord.id);
      if (!url) return;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download document: ${response.status}`);
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.rel = 'noopener noreferrer';
      link.download = `${documentRecord.name || 'document'}.pdf`;
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      // Download failed silently - error handling could be enhanced with toast notifications
    } finally {
      link.remove();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  function toggleDocumentDetails(documentId) {
    setExpandedDocIds((previous) => {
      const next = new Set(previous);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  }

  function expandAllDetails() {
    setExpandedDocIds(new Set(documents.map((doc) => doc.id)));
  }

  function collapseAllDetails() {
    setExpandedDocIds(new Set());
  }

  async function handleDeleteDocument(documentId, docName) {
    clearDeleteError();
    if (!window.confirm(`Delete "${docName}"? This cannot be undone.`)) return;
    await deleteDocument(documentId);
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
      skipBlurRef.current = false;
      return;
    }
    const result = await renameDocument(documentId, renameValue);
    if (result) {
      setRenamingDocId(null);
    }
    skipBlurRef.current = false;
  }

  function cancelRename() {
    setRenamingDocId(null);
    setRenameValue('');
    skipBlurRef.current = false;
  }

  function resetUploadForm() {
    setShowUploadForm(false);
    setUploadName('');
    setUploadType('Resume');
    setUploadFile(null);
    if (uploadFileRef.current) uploadFileRef.current.value = '';
    clearSaveError();
  }

  async function handleUpload(e) {
    e.preventDefault();
    const trimmedName = uploadName.trim();
    if (!trimmedName || !uploadFile) return;
    const result = await createDocument({
      name: trimmedName,
      doc_type: uploadType,
      file: uploadFile,
    });
    if (result) {
      resetUploadForm();
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
          <button
            type="button"
            className="btn-add"
            onClick={() => {
              clearSaveError();
              setShowUploadForm((prev) => !prev);
            }}
          >
            + Upload Document
          </button>
        </div>

        {showUploadForm && (
          <form className="doc-upload-form" onSubmit={handleUpload} noValidate>
            <div className="doc-upload-row">
              <div className="doc-upload-field">
                <label htmlFor="upload-doc-name" className="dashboard-sort-label">
                  Name
                </label>
                <input
                  id="upload-doc-name"
                  type="text"
                  className="jf-input"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Document name"
                  required
                />
              </div>
              <div className="doc-upload-field">
                <label htmlFor="upload-doc-type" className="dashboard-sort-label">
                  Type
                </label>
                <select
                  id="upload-doc-type"
                  className="jf-input"
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="doc-upload-field">
                <label htmlFor="upload-doc-file" className="dashboard-sort-label">
                  File (PDF)
                </label>
                <input
                  id="upload-doc-file"
                  type="file"
                  accept=".pdf,application/pdf"
                  ref={uploadFileRef}
                  onChange={(e) => setUploadFile(e.target.files[0] || null)}
                  required
                />
              </div>
            </div>
            {saveError && (
              <p className="table-empty table-state--error" role="alert">
                {saveError}
              </p>
            )}
            <div className="doc-upload-actions">
              <button
                type="submit"
                className="btn-add"
                disabled={saving || !uploadName.trim() || !uploadFile}
              >
                {saving ? 'Uploading…' : 'Upload'}
              </button>
              <button
                type="button"
                className="view-toggle-btn"
                onClick={resetUploadForm}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

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
            <div className="dashboard-sort-control">
              <label className="dashboard-sort-label">Details</label>
              <div className="document-details-controls">
                <button
                  type="button"
                  className="view-toggle-btn"
                  onClick={expandAllDetails}
                  disabled={documents.length === 0}
                >
                  Expand all
                </button>
                <button
                  type="button"
                  className="view-toggle-btn"
                  onClick={collapseAllDetails}
                  disabled={documents.length === 0}
                >
                  Collapse all
                </button>
              </div>
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

            {!loading && !error && documents.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty">
                  No saved documents yet. Create a draft from any job in your dashboard.
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              documents.map((doc, index) => {
                const isArchived = doc.status === 'archived';
                const rowBusy =
                  deletingId === doc.id ||
                  renamingId === doc.id ||
                  duplicatingId === doc.id ||
                  archivingIds.has(doc.id);
                const isExpanded = expandedDocIds.has(doc.id);
                return (
                  <Fragment key={doc.id}>
                    <tr key={doc.id}>
                      <td className="row-number">{index + 1}</td>
                      <td className="shell-cell-strong">
                        <div className="document-name-cell">
                          {renamingDocId === doc.id ? (
                            <input
                              className="inline-rename-input"
                              aria-label="New document name"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => {
                                if (skipBlurRef.current) {
                                  skipBlurRef.current = false;
                                  return;
                                }
                                commitRename(doc.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  skipBlurRef.current = true;
                                  commitRename(doc.id);
                                } else if (e.key === 'Escape') {
                                  skipBlurRef.current = true;
                                  cancelRename();
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <>
                              <button
                                type="button"
                                className="document-title-link"
                                onClick={() => openDocument(doc.id)}
                                disabled={rowBusy}
                              >
                                {doc.name}
                              </button>
                              {!isArchived && (
                                <button
                                  type="button"
                                  className="action-btn document-rename-btn"
                                  aria-label="Rename document"
                                  title="Rename"
                                  onClick={() => startRename(doc)}
                                  disabled={rowBusy}
                                >
                                  ✏️
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td>{doc.doc_type || 'Draft'}</td>
                      <td>{getLinkedJobLabel(doc)}</td>
                      <td>
                        <span className="date-text">
                          {formatDocumentDate(doc.created_at, true)}
                        </span>
                      </td>
                      <td>
                        <span className="date-text">
                          {formatDocumentDate(doc.updated_at || doc.created_at, true)}
                        </span>
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button
                            type="button"
                            className="view-toggle-btn"
                            aria-label={isExpanded ? 'Hide details' : 'View details'}
                            onClick={() => toggleDocumentDetails(doc.id)}
                            disabled={rowBusy}
                          >
                            {isExpanded ? 'Hide details' : 'View details'}
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            aria-label="Download document"
                            title="Download"
                            onClick={() => handleDownloadDocument(doc)}
                            disabled={rowBusy}
                          >
                            ⬇
                          </button>
                          {!isArchived && (
                            <>
                              <button
                                type="button"
                                className="action-btn"
                                aria-label="Duplicate document"
                                title="Duplicate"
                                onClick={() => duplicateDocument(doc.id)}
                                disabled={rowBusy}
                              >
                                {duplicatingId === doc.id ? '…' : '📋'}
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
                              title="Delete document"
                              onClick={() => handleDeleteDocument(doc.id, doc.name)}
                              disabled={rowBusy}
                            >
                              {deletingId === doc.id ? '…' : '🗑'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${doc.id}-details`} className="document-details-row">
                        <td colSpan={7}>
                          <div className="document-inline-details">
                            <p className="document-view-modal-text">
                              <strong>Type:</strong> {doc.doc_type || 'Draft'}
                            </p>
                            <p className="document-view-modal-text">
                              <strong>Status:</strong> {doc.status || '—'}
                            </p>
                            <p className="document-view-modal-text">
                              <strong>Tags:</strong>{' '}
                              {Array.isArray(doc.tags) && doc.tags.length > 0
                                ? doc.tags.map((t, tagIndex) => (
                                    <span
                                      key={`${t}-${tagIndex}`}
                                      className="draft-field-label"
                                      style={{ display: 'inline-block', marginRight: 8 }}
                                    >
                                      {t}
                                    </span>
                                  ))
                                : '—'}
                            </p>
                            <p className="document-view-modal-text">
                              <strong>Linked:</strong> {getLinkedJobLabel(doc)}
                            </p>
                            <p className="document-view-modal-text">
                              <strong>Uploaded:</strong> {formatDocumentDate(doc.created_at, true)}
                            </p>
                            <p className="document-view-modal-text">
                              <strong>Last Updated:</strong>{' '}
                              {formatDocumentDate(doc.updated_at || doc.created_at, true)}
                            </p>
                            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                              <button
                                type="button"
                                className="document-view-modal-btn"
                                onClick={() => openDocument(doc.id)}
                                disabled={rowBusy}
                              >
                                Open file
                              </button>
                              <button
                                type="button"
                                className="document-view-modal-btn document-view-modal-btn--cancel"
                                onClick={() => toggleDocumentDetails(doc.id)}
                                disabled={rowBusy}
                              >
                                Close details
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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
    </AppShell>
  );
}
