import { useState } from 'react';
import AppShell from '../components/layout/AppShell';
import AIRewriteModal from '../components/AIRewriteModal/AIRewriteModal';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../hooks/useDocuments';
import './ShellPages.css';

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
  } = useDocuments(session?.access_token);

  const [rewriteDoc, setRewriteDoc] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);

  function openDocumentModal(doc) {
    clearDeleteError();
    setSelectedDoc(doc);
  }

  function closeDocumentModal() {
    setSelectedDoc(null);
  }

  async function handleDeleteDocument(documentId) {
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
                <td colSpan={6} className="table-empty table-state--error">
                  <div role="alert">{error}</div>
                </td>
              </tr>
            )}

            {!loading && !error && documents.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
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
                        onClick={() => handleDeleteDocument(doc.id)}
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
        <div className="delete-modal-overlay" role="presentation" onClick={closeDocumentModal}>
          <div
            className="draft-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-view-title"
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
          >
            <h2 className="delete-modal-title" id="document-view-title">
              {selectedDoc.name || 'Document'}
            </h2>
            <p className="delete-modal-text">
              <strong>Type:</strong> {selectedDoc.doc_type || 'Draft'}
            </p>
            <p className="delete-modal-text">
              <strong>Status:</strong> {selectedDoc.status || '—'}
            </p>
            <p className="delete-modal-text">
              <strong>Tags:</strong>{' '}
              {Array.isArray(selectedDoc.tags) && selectedDoc.tags.length > 0
                ? selectedDoc.tags.map((t) => (
                    <span
                      key={t}
                      className="draft-field-label"
                      style={{ display: 'inline-block', marginRight: 8 }}
                    >
                      {t}
                    </span>
                  ))
                : '—'}
            </p>
            <p className="delete-modal-text">
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
            <p className="delete-modal-text">
              <strong>Uploaded:</strong> {formatDocumentDate(selectedDoc.created_at, true)}
            </p>
            <p className="delete-modal-text">
              <strong>Last Updated:</strong> {formatDocumentDate(selectedDoc.updated_at, true)}
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="delete-modal-btn"
                onClick={async () => {
                  const url = await viewDocument(selectedDoc.id);
                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                }}
              >
                Open file
              </button>
              <button
                type="button"
                className="delete-modal-btn delete-modal-btn--cancel"
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
