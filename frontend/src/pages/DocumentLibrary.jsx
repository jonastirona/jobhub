import { useMemo, useRef, useState } from 'react';
import AppShell from '../components/layout/AppShell';
import AIRewriteModal from '../components/AIRewriteModal/AIRewriteModal';
import TagSelector from '../components/common/TagSelector';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../hooks/useDocuments';
import { extractErrorMessage } from '../utils/apiError';
import './ShellPages.css';
import '../styles/Dashboard.css';

const DOC_TYPES = ['Resume', 'Cover Letter', 'Draft', 'Other'];
const STATUS_FLAGS = ['draft', 'final', 'archived'];
const DOCUMENT_TAGS = [
  'Resume',
  'Cover Letter',
  'Portfolio',
  'Transcript',
  'Reference List',
  'Writing Sample',
  'Certification',
  'Work Authorization',
  'Offer Letter',
  'Contract',
  'Job Description',
  'Interview Prep',
  'Thank You Note',
  'Other',
];
const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'created_at', label: 'Date Added' },
  { value: 'name', label: 'Name (A–Z)' },
];

function getDocumentSortValue(doc, sortBy) {
  if (!doc) return '';
  if (sortBy === 'name') {
    return doc.name || '';
  }
  return doc[sortBy] || '';
}

function compareDocumentsForLibrary(a, b, sortBy) {
  const aValue = getDocumentSortValue(a, sortBy);
  const bValue = getDocumentSortValue(b, sortBy);
  if (sortBy === 'name') {
    return aValue.localeCompare(bValue);
  }
  return String(bValue).localeCompare(String(aValue));
}

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

// focus handling removed when switching from modal to inline details

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
    updatingIds,
    updateError,
    saveError,
    viewDocument,
    createDocument,
    deleteDocument,
    clearDeleteError,
    clearRenameError,
    clearDuplicateError,
    clearArchiveError,
    clearUpdateError,
    clearSaveError,
    renameDocument,
    updateDocumentStatus,
    updateDocumentTags,
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
      const versionValue = Number(doc.version_number);
      const version = Number.isFinite(versionValue) ? versionValue : 1;
      const cur = latestByGroup.get(group);
      if (!cur) {
        latestByGroup.set(group, doc);
        continue;
      }
      const curVersionValue = Number(cur.version_number);
      const curVersion = Number.isFinite(curVersionValue) ? curVersionValue : 1;
      if (version > curVersion) {
        latestByGroup.set(group, doc);
      } else if (version === curVersion) {
        const curUpdated = new Date(cur.updated_at || cur.created_at || 0).getTime();
        const docUpdated = new Date(doc.updated_at || doc.created_at || 0).getTime();
        if (docUpdated > curUpdated) latestByGroup.set(group, doc);
      }
    }

    return Array.from(latestByGroup.values()).sort((a, b) =>
      compareDocumentsForLibrary(a, b, selectedSortBy)
    );
  }, [documents, selectedSortBy]);
  const [rewriteDoc, setRewriteDoc] = useState(null);
  const [expandedDocId, setExpandedDocId] = useState(null);
  const [renamingDocId, setRenamingDocId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusValue, setStatusValue] = useState('');
  const [editingTags, setEditingTags] = useState(false);
  const [tagsValue, setTagsValue] = useState([]);
  const [versionHistory, setVersionHistory] = useState([]);
  const [versionHistoryLoading, setVersionHistoryLoading] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const versionUploadInputRef = useRef(null);

  function toggleDocumentExpanded(doc) {
    if (expandedDocId === doc.id) {
      setExpandedDocId(null);
      setShowVersionHistory(false);
      setShowDuplicateForm(false);
      setVersionHistory([]);
      setVersionHistoryError(null);
      setDuplicateName('');
      setEditingStatus(false);
      setEditingTags(false);
      clearDuplicateError();
      clearSaveError();
      clearUpdateError();
    } else {
      clearDeleteError();
      setExpandedDocId(doc.id);
      setShowVersionHistory(false);
      setShowDuplicateForm(false);
      setVersionHistory([]);
      setVersionHistoryError(null);
      setDuplicateName('');
      setEditingStatus(false);
      setStatusValue(doc.status || '');
      setEditingTags(false);
      setTagsValue(Array.isArray(doc.tags) ? doc.tags : []);
      clearDuplicateError();
    }
  }

  async function handleDeleteDocument(documentId, docName) {
    if (!window.confirm(`Delete "${docName}"? This cannot be undone.`)) return;
    await deleteDocument(documentId);
  }

  function startDuplicate(doc) {
    if (expandedDocId !== doc.id) {
      toggleDocumentExpanded(doc);
    }
    setShowDuplicateForm(true);
    setDuplicateName(`Copy of ${doc.name || 'Document'}`);
  }

  async function commitDuplicate() {
    const expandedDoc = documents.find((d) => d.id === expandedDocId);
    if (!expandedDoc) return;
    const trimmed = duplicateName.trim();
    if (!trimmed) return;
    const created = await duplicateDocument(expandedDoc.id, trimmed);
    if (created) {
      await refetch();
      setVersionHistory([]);
      setShowVersionHistory(false);
      setShowDuplicateForm(false);
      setDuplicateName('');
      setExpandedDocId(created.id);
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

  async function commitStatusChange(documentId) {
    if (!statusValue.trim()) {
      setEditingStatus(false);
      return;
    }
    const result = await updateDocumentStatus(documentId, statusValue);
    if (result) {
      setEditingStatus(false);
    }
  }

  function cancelStatusChange() {
    const expandedDoc = documents.find((d) => d.id === expandedDocId);
    setEditingStatus(false);
    setStatusValue(expandedDoc?.status || '');
    clearUpdateError();
  }

  async function commitTagsChange(documentId) {
    const result = await updateDocumentTags(documentId, tagsValue);
    if (result) {
      setEditingTags(false);
    }
  }

  function cancelTagsChange() {
    const expandedDoc = documents.find((d) => d.id === expandedDocId);
    setEditingTags(false);
    setTagsValue(Array.isArray(expandedDoc?.tags) ? expandedDoc.tags : []);
    clearUpdateError();
  }

  async function loadVersionHistory(docId) {
    if (!session?.access_token || !docId) return;
    // Allow relative requests when REACT_APP_BACKEND_URL is not configured so
    // tests that mock `fetch` (or environments using a proxy) still exercise
    // the network call. Keeping loading state deterministic for accessibility.
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
    setVersionHistoryLoading(true);
    setVersionHistoryError(null);
    try {
      const res = await fetch(`${backendBase}/documents/${docId}/versions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const message =
          (await extractErrorMessage(res)) || `Failed to load version history (${res.status})`;
        throw new Error(message);
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

  async function handleDownloadDocument(documentRecord) {
    if (!documentRecord?.id) return;
    let objectUrl = null;
    const link = window.document.createElement('a');
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
      window.document.body.appendChild(link);
      link.click();
    } catch (err) {
      // Keep failure silent to avoid blocking primary document actions.
    } finally {
      link.remove();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  async function handleUploadNewVersion(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const expandedDoc = documents.find((d) => d.id === expandedDocId);
    if (!expandedDoc || !file) return;

    const created = await createDocument({
      name: expandedDoc.name || file.name.replace(/\.[^.]+$/, '') || 'Document',
      doc_type: expandedDoc.doc_type || 'Draft',
      job_id: expandedDoc.job_id || undefined,
      source_document_id: expandedDoc.id,
      status: expandedDoc.status || undefined,
      tags: Array.isArray(expandedDoc.tags) ? expandedDoc.tags : undefined,
      file,
    });

    if (created) {
      await refetch();
      setExpandedDocId(created.id);
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
              latestDocuments
                .map((doc, index) => {
                  return [
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
                          <button
                            type="button"
                            className="document-title-link"
                            onClick={() => openDocumentById(doc.id)}
                          >
                            {doc.name}
                          </button>
                        )}
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
                                  aria-label="View details"
                                  onClick={() => toggleDocumentExpanded(doc)}
                                  disabled={rowBusy}
                                >
                                  👁
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
                    </tr>,
                    expandedDocId === doc.id && (
                      <tr key={`${doc.id}-details`} className="document-details-row">
                        <td
                          colSpan={7}
                          className="document-details-cell"
                          style={{ padding: '20px', borderTop: '1px solid var(--border)' }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '200px 1fr',
                              gap: '20px',
                            }}
                          >
                            {/* Details content */}
                            <div>
                              <p
                                style={{
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  color: 'var(--text-secondary)',
                                  marginBottom: '12px',
                                }}
                              >
                                Details
                              </p>
                              <p style={{ marginBottom: '8px' }}>
                                <strong>Type:</strong> {doc.doc_type || 'Draft'}
                              </p>
                              <p style={{ marginBottom: '8px' }}>
                                <strong>Status:</strong>{' '}
                                {editingStatus ? (
                                  <select
                                    className="inline-rename-input"
                                    value={statusValue}
                                    onChange={(e) => setStatusValue(e.target.value)}
                                    onBlur={() => commitStatusChange(doc.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        commitStatusChange(doc.id);
                                      } else if (e.key === 'Escape') {
                                        cancelStatusChange();
                                      }
                                    }}
                                    autoFocus
                                    disabled={updatingIds.has(doc.id)}
                                  >
                                    <option value="">—</option>
                                    {STATUS_FLAGS.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <>
                                    <span>{doc.status || '—'}</span>
                                    <button
                                      type="button"
                                      className="document-view-modal-btn"
                                      onClick={() => {
                                        setEditingStatus(true);
                                        setStatusValue(doc.status || '');
                                      }}
                                      disabled={updatingIds.has(doc.id)}
                                      style={{
                                        marginLeft: 8,
                                        padding: '2px 6px',
                                        fontSize: '12px',
                                      }}
                                    >
                                      Edit
                                    </button>
                                  </>
                                )}
                              </p>
                              <p style={{ marginBottom: '8px' }}>
                                <strong>Version:</strong>{' '}
                                {doc.version_number ? `v${doc.version_number}` : 'v1'}
                              </p>
                              <p style={{ marginBottom: '8px' }}>
                                <strong>Linked:</strong> {getLinkedJobLabel(doc)}
                              </p>
                            </div>
                            <div>
                              <p
                                style={{
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  color: 'var(--text-secondary)',
                                  marginBottom: '12px',
                                }}
                              >
                                Tags & Actions
                              </p>
                              <div style={{ marginBottom: '12px' }}>
                                <strong style={{ display: 'block', marginBottom: '6px' }}>
                                  Tags:
                                </strong>
                                {editingTags ? (
                                  <div style={{ marginBottom: '8px' }}>
                                    <TagSelector
                                      selectedTags={tagsValue}
                                      availableTags={DOCUMENT_TAGS}
                                      onTagsChange={setTagsValue}
                                      disabled={updatingIds.has(doc.id)}
                                      label=""
                                    />
                                    <div style={{ marginTop: '8px', display: 'flex', gap: 8 }}>
                                      <button
                                        type="button"
                                        className="document-view-modal-btn"
                                        onClick={() => commitTagsChange(doc.id)}
                                        disabled={updatingIds.has(doc.id)}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="document-view-modal-btn document-view-modal-btn--cancel"
                                        onClick={cancelTagsChange}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 12,
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <div style={{ marginBottom: 0 }}>
                                      {Array.isArray(doc.tags) && doc.tags.length > 0
                                        ? doc.tags.map((t, i) => (
                                            <span
                                              key={`${t}-${i}`}
                                              className="draft-field-label"
                                              style={{
                                                display: 'inline-block',
                                                marginRight: 8,
                                                marginBottom: 6,
                                              }}
                                            >
                                              {t}
                                            </span>
                                          ))
                                        : '—'}
                                    </div>
                                    <button
                                      type="button"
                                      className="document-view-modal-btn"
                                      onClick={() => {
                                        setEditingTags(true);
                                        setTagsValue(Array.isArray(doc.tags) ? doc.tags : []);
                                      }}
                                      disabled={updatingIds.has(doc.id)}
                                      style={{ padding: '2px 6px', fontSize: '12px' }}
                                    >
                                      Edit
                                    </button>
                                  </div>
                                )}
                              </div>
                              {updateError && (
                                <p
                                  style={{
                                    color: 'var(--error)',
                                    fontSize: '12px',
                                    marginBottom: '8px',
                                  }}
                                  role="alert"
                                >
                                  {updateError}
                                </p>
                              )}
                              <div
                                style={{
                                  marginTop: '12px',
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '8px',
                                }}
                              >
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
                                    if (
                                      nextShow &&
                                      versionHistory.length === 0 &&
                                      !versionHistoryLoading
                                    ) {
                                      await loadVersionHistory(doc.id);
                                    }
                                  }}
                                >
                                  {showVersionHistory
                                    ? 'Hide version history'
                                    : 'View version history'}
                                </button>
                                <button
                                  type="button"
                                  className="document-view-modal-btn"
                                  onClick={() => startDuplicate(doc)}
                                  disabled={duplicatingId === doc.id}
                                >
                                  Duplicate with new name
                                </button>
                              </div>
                              {saveError && (
                                <p
                                  style={{
                                    color: 'var(--error)',
                                    fontSize: '12px',
                                    marginTop: '12px',
                                  }}
                                  role="alert"
                                >
                                  {saveError}
                                </p>
                              )}
                              {showDuplicateForm && (
                                <div style={{ marginTop: '14px' }}>
                                  <label
                                    className="draft-field-label"
                                    htmlFor="duplicate-name-input"
                                  >
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
                                      style={{
                                        color: 'var(--error)',
                                        fontSize: '12px',
                                        marginTop: 6,
                                      }}
                                      role="alert"
                                    >
                                      {duplicateError}
                                    </p>
                                  )}
                                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                    <button
                                      type="button"
                                      className="document-view-modal-btn"
                                      onClick={commitDuplicate}
                                      disabled={duplicatingId === doc.id}
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
                                  style={{
                                    color: 'var(--error)',
                                    fontSize: '12px',
                                    marginTop: '12px',
                                  }}
                                  role="alert"
                                >
                                  {versionHistoryError}
                                </p>
                              )}
                              {showVersionHistory && (
                                <div style={{ marginTop: '14px' }}>
                                  {versionHistoryLoading ? (
                                    <p role="status" aria-live="polite">
                                      Loading version history...
                                    </p>
                                  ) : versionHistory.length > 0 ? (
                                    <ul
                                      style={{ margin: 0, paddingLeft: 18 }}
                                      aria-label="Version history list"
                                    >
                                      {versionHistory.map((version) => (
                                        <li key={version.id} style={{ marginBottom: '6px' }}>
                                          <div
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 8,
                                            }}
                                          >
                                            <span style={{ fontSize: '13px' }}>
                                              {version.name} - v{version.version_number || 1} -{' '}
                                              {formatDocumentDate(
                                                version.updated_at || version.created_at,
                                                true
                                              )}
                                            </span>
                                            <button
                                              type="button"
                                              className="document-view-modal-btn"
                                              onClick={() => handleDownloadDocument(version)}
                                              style={{ fontSize: '12px', padding: '2px 6px' }}
                                            >
                                              Download
                                            </button>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p>No version history available.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div
                            style={{
                              marginTop: '16px',
                              paddingTop: '12px',
                              borderTop: '1px solid var(--border)',
                            }}
                          >
                            <p
                              style={{
                                fontSize: '12px',
                                fontWeight: '600',
                                color: 'var(--text-secondary)',
                                marginBottom: '8px',
                              }}
                            >
                              Timestamps
                            </p>
                            <p style={{ fontSize: '13px', marginBottom: '4px' }}>
                              <strong>Uploaded:</strong> {formatDocumentDate(doc.created_at, true)}
                            </p>
                            <p style={{ fontSize: '13px' }}>
                              <strong>Last Updated:</strong>{' '}
                              {formatDocumentDate(doc.updated_at || doc.created_at, true)}
                            </p>
                          </div>
                          <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="document-view-modal-btn"
                              onClick={() => openDocumentById(doc.id)}
                            >
                              Open file
                            </button>
                            <button
                              type="button"
                              className="document-view-modal-btn document-view-modal-btn--cancel"
                              onClick={() => toggleDocumentExpanded(doc)}
                            >
                              Close
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  ].filter(Boolean);
                })
                .flat()}
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
