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

  const filters = useMemo(
    () => ({ docType: selectedDocType || undefined, sortBy: selectedSortBy }),
    [selectedDocType, selectedSortBy]
  );

  const {
    documents,
    loading,
    error,
    deletingId,
    deleteError,
    viewDocument,
    deleteDocument,
    clearDeleteError,
    refetch,
  } = useDocuments(session?.access_token, true, filters);

  const [rewriteDoc, setRewriteDoc] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const overlayRef = useRef(null);
  const modalRef = useRef(null);

  function openDocumentModal(doc) {
    clearDeleteError();
    setSelectedDoc(doc);
  }

  function closeDocumentModal() {
    setSelectedDoc(null);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') closeDocumentModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === overlayRef.current) closeDocumentModal();
  }, []);

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
          </div>
        </div>

        {deleteError && (
          <p className="table-empty table-state--error" role="alert">
            {deleteError}
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
              documents.map((doc, index) => (
                <tr key={doc.id}>
                  <td className="row-number">{index + 1}</td>
                  <td className="shell-cell-strong">{doc.name}</td>
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
                      <button
                        type="button"
                        className="action-btn"
                        aria-label="View document"
                        onClick={() => openDocumentModal(doc)}
                        disabled={deletingId === doc.id}
                      >
                        👁
                      </button>
                      {doc.content && (
                        <button
                          type="button"
                          className="action-btn"
                          aria-label="Rewrite with AI"
                          title="Rewrite with AI"
                          onClick={() => setRewriteDoc(doc)}
                          disabled={deletingId === doc.id}
                        >
                          ✦
                        </button>
                      )}
                      <button
                        type="button"
                        className="action-btn"
                        aria-label="Delete document"
                        onClick={() => handleDeleteDocument(doc.id, doc.name)}
                        disabled={deletingId === doc.id}
                      >
                        {deletingId === doc.id ? '…' : '🗑'}
                      </button>
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
              <strong>Linked:</strong> {getLinkedJobLabel(selectedDoc)}
            </p>
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
                onClick={async () => {
                  const url = await viewDocument(selectedDoc.id);
                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                }}
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
