import { Fragment, useMemo, useRef, useState } from 'react';
import AppShell from '../components/layout/AppShell';
import AIRewriteModal from '../components/AIRewriteModal/AIRewriteModal';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../hooks/useDocuments';
import './ShellPages.css';
import '../styles/Dashboard.css';

const DOC_TYPES = ['Resume', 'Cover Letter', 'Draft', 'Other'];
const DOCUMENT_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'final', label: 'Final' },
  { value: 'archived', label: 'Archived' },
];
const DOCUMENT_TAG_OPTIONS = [
  'general',
  'resume',
  'cover letter',
  'job description',
  'company research',
  'interview prep',
  'technical prep',
  'behavioral prep',
  'networking',
  'recruiter notes',
  'offer',
  'follow-up needed',
  'important',
];
const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'created_at', label: 'Date Added' },
  { value: 'name', label: 'Name (A-Z)' },
];

const DEFAULT_VERSION_PANEL = {
  show: false,
  items: [],
  loading: false,
  error: null,
  loaded: false,
};

function formatDocumentDate(dateStr, includeTime = false) {
  if (!dateStr) return '--';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '--';
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

function getVersionGroupId(doc) {
  return doc.version_group_id || doc.id;
}

function getVersionNumber(doc) {
  const version = Number(doc.version_number);
  return Number.isFinite(version) && version > 0 ? version : 1;
}

function getDocumentTimestamp(doc) {
  const timestamp = new Date(doc.updated_at || doc.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareDocumentsBySort(left, right, sortBy) {
  if (sortBy === 'name') {
    return (left.name || '').localeCompare(right.name || '');
  }

  const leftDate = sortBy === 'created_at' ? left.created_at : left.updated_at || left.created_at;
  const rightDate =
    sortBy === 'created_at' ? right.created_at : right.updated_at || right.created_at;
  const leftTime = new Date(leftDate || 0).getTime();
  const rightTime = new Date(rightDate || 0).getTime();
  const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
  const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;

  if (normalizedRight !== normalizedLeft) {
    return normalizedRight - normalizedLeft;
  }
  return (left.name || '').localeCompare(right.name || '');
}

function renderTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '--';
  return tags.map((tag, index) => (
    <span
      key={`${tag}-${index}`}
      className="draft-field-label"
      style={{ display: 'inline-block', marginRight: 8 }}
    >
      {tag}
    </span>
  ));
}

function normalizeSelectedTags(tags) {
  if (!Array.isArray(tags)) return [];
  const allowedTags = new Set(DOCUMENT_TAG_OPTIONS);
  return tags.filter((tag) => allowedTags.has(tag));
}

function getSelectedTagSummary(tags) {
  if (!tags.length) return 'Select tags';
  if (tags.length <= 2) return tags.join(', ');
  return `${tags.length} tags selected`;
}

function areTagsEqual(left, right) {
  const leftTags = Array.isArray(left) ? left : [];
  const rightTags = Array.isArray(right) ? right : [];
  if (leftTags.length !== rightTags.length) return false;
  return leftTags.every((tag, index) => tag === rightTags[index]);
}

async function getResponseErrorMessage(response, fallback) {
  try {
    const data = await response.json();
    return data?.detail || fallback;
  } catch {
    try {
      return (await response.text()) || fallback;
    } catch {
      return fallback;
    }
  }
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
    createDocument,
    deleteDocument,
    clearDeleteError,
    clearRenameError,
    clearDuplicateError,
    clearArchiveError,
    clearSaveError,
    renameDocument,
    duplicateDocument,
    archiveDocument,
    restoreDocument,
    refetch,
  } = useDocuments(session?.access_token, true, filters);

  const latestDocuments = useMemo(() => {
    if (!Array.isArray(documents) || documents.length === 0) return [];

    const latestByGroup = new Map();
    for (const doc of documents) {
      const group = getVersionGroupId(doc);
      const current = latestByGroup.get(group);
      if (!current) {
        latestByGroup.set(group, doc);
        continue;
      }

      const version = getVersionNumber(doc);
      const currentVersion = getVersionNumber(current);
      if (version > currentVersion) {
        latestByGroup.set(group, doc);
      } else if (
        version === currentVersion &&
        getDocumentTimestamp(doc) > getDocumentTimestamp(current)
      ) {
        latestByGroup.set(group, doc);
      }
    }

    const seenGroups = new Set();
    const result = [];
    for (const doc of documents) {
      const group = getVersionGroupId(doc);
      if (seenGroups.has(group)) continue;
      const latest = latestByGroup.get(group);
      if (latest) {
        result.push(latest);
        seenGroups.add(group);
      }
    }
    return result.sort((left, right) => compareDocumentsBySort(left, right, selectedSortBy));
  }, [documents, selectedSortBy]);

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
  const versionUploadInputRefs = useRef({});
  const [versionPanels, setVersionPanels] = useState({});
  const [duplicateDocId, setDuplicateDocId] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [metadataEditingDocId, setMetadataEditingDocId] = useState(null);
  const [metadataStatus, setMetadataStatus] = useState('draft');
  const [metadataTags, setMetadataTags] = useState([]);
  const [tagsDropdownOpenDocId, setTagsDropdownOpenDocId] = useState(null);
  const [metadataSavingId, setMetadataSavingId] = useState(null);
  const [metadataError, setMetadataError] = useState(null);

  function getVersionPanel(documentId) {
    return versionPanels[documentId] || DEFAULT_VERSION_PANEL;
  }

  function updateVersionPanel(documentId, updater) {
    setVersionPanels((previous) => {
      const current = previous[documentId] || DEFAULT_VERSION_PANEL;
      return {
        ...previous,
        [documentId]: updater(current),
      };
    });
  }

  async function openDocument(documentId) {
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
    } catch {
      // Keep download failures quiet so the rest of the library stays usable.
    } finally {
      link.remove();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  function toggleDocumentDetails(documentId) {
    const isOpen = expandedDocIds.has(documentId);
    setExpandedDocIds((previous) => {
      const next = new Set(previous);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });

    if (isOpen && duplicateDocId === documentId) {
      cancelDuplicate();
    }
    if (isOpen && metadataEditingDocId === documentId) {
      cancelMetadataEdit();
    }
  }

  function expandDocumentDetails(documentId) {
    setExpandedDocIds((previous) => new Set(previous).add(documentId));
  }

  function expandAllDetails() {
    setExpandedDocIds(new Set(latestDocuments.map((doc) => doc.id)));
  }

  function collapseAllDetails() {
    setExpandedDocIds(new Set());
    cancelDuplicate();
    cancelMetadataEdit();
  }

  async function handleDeleteDocument(documentId, docName) {
    clearDeleteError();
    if (!window.confirm(`Delete "${docName}"? This cannot be undone.`)) return;
    const deleted = await deleteDocument(documentId);
    if (deleted) {
      setExpandedDocIds((previous) => {
        const next = new Set(previous);
        next.delete(documentId);
        return next;
      });
    }
  }

  async function handleArchiveDocument(documentId) {
    clearArchiveError();
    const updated = await archiveDocument(documentId);
    if (updated && !showArchived) {
      setExpandedDocIds((previous) => {
        const next = new Set(previous);
        next.delete(documentId);
        return next;
      });
    }
  }

  async function handleRestoreDocument(documentId) {
    clearArchiveError();
    await restoreDocument(documentId);
  }

  function startRename(doc) {
    clearRenameError();
    setRenamingDocId(doc.id);
    setRenameValue(doc.name || '');
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

  function startDuplicate(doc) {
    clearDuplicateError();
    expandDocumentDetails(doc.id);
    setDuplicateDocId(doc.id);
    setDuplicateName(`Copy of ${doc.name || 'Document'}`);
  }

  async function commitDuplicate(doc) {
    if (!doc || duplicateDocId !== doc.id) return;
    const trimmedName = duplicateName.trim();
    if (!trimmedName) return;

    const created = await duplicateDocument(doc.id, trimmedName);
    if (created) {
      setDuplicateDocId(null);
      setDuplicateName('');
      refetch();
      expandDocumentDetails(created.id);
    }
  }

  function cancelDuplicate() {
    setDuplicateDocId(null);
    setDuplicateName('');
    clearDuplicateError();
  }

  function startMetadataEdit(doc) {
    expandDocumentDetails(doc.id);
    setMetadataEditingDocId(doc.id);
    setMetadataStatus(doc.status || 'draft');
    setMetadataTags(normalizeSelectedTags(doc.tags));
    setTagsDropdownOpenDocId(null);
    setMetadataError(null);
  }

  function cancelMetadataEdit() {
    setMetadataEditingDocId(null);
    setMetadataStatus('draft');
    setMetadataTags([]);
    setTagsDropdownOpenDocId(null);
    setMetadataError(null);
  }

  function toggleMetadataTag(tag) {
    setMetadataTags((previous) => {
      if (previous.includes(tag)) {
        return previous.filter((currentTag) => currentTag !== tag);
      }
      return [...previous, tag];
    });
  }

  async function patchDocumentMetadata(documentId, payload) {
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
    if (!backendBase) {
      throw new Error('Backend URL is not configured.');
    }
    if (!session?.access_token) {
      throw new Error('You are not authenticated. Please sign in again.');
    }

    const response = await fetch(`${backendBase}/documents/${documentId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, `Failed to update document (${response.status})`)
      );
    }

    return response.json();
  }

  async function saveMetadata(doc) {
    const nextTags = normalizeSelectedTags(metadataTags);
    const nextStatus = metadataStatus || 'draft';
    const tagsChanged = !areTagsEqual(doc.tags, nextTags);

    setMetadataSavingId(doc.id);
    setMetadataError(null);

    try {
      const updated = await patchDocumentMetadata(doc.id, {
        status: nextStatus,
        tags: nextTags,
      });

      const returnedTags = Array.isArray(updated?.tags) ? updated.tags : doc.tags;
      const tagsPersisted = !tagsChanged || areTagsEqual(returnedTags, nextTags);
      if (tagsChanged && !tagsPersisted) {
        const created = await createDocument({
          name: updated?.name || doc.name || 'Document',
          doc_type: updated?.doc_type || doc.doc_type || 'Draft',
          job_id: updated?.job_id || doc.job_id || undefined,
          source_document_id: updated?.id || doc.id,
          status: updated?.status || nextStatus,
          tags: nextTags,
        });
        if (!created) {
          throw new Error('Failed to update document tags.');
        }
      }

      cancelMetadataEdit();
      refetch();
    } catch (err) {
      setMetadataError(err instanceof Error ? err.message : String(err));
    } finally {
      setMetadataSavingId(null);
    }
  }

  async function loadVersionHistory(documentId) {
    if (!session?.access_token || !documentId) return;
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
    if (!backendBase) {
      updateVersionPanel(documentId, (panel) => ({
        ...panel,
        error: 'Backend URL is not configured.',
        loading: false,
        loaded: true,
      }));
      return;
    }

    updateVersionPanel(documentId, (panel) => ({
      ...panel,
      loading: true,
      error: null,
    }));

    try {
      const response = await fetch(`${backendBase}/documents/${documentId}/versions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        throw new Error(`Failed to load version history (${response.status})`);
      }
      const data = await response.json();
      updateVersionPanel(documentId, (panel) => ({
        ...panel,
        items: Array.isArray(data) ? data : [],
        loading: false,
        error: null,
        loaded: true,
      }));
    } catch (err) {
      updateVersionPanel(documentId, (panel) => ({
        ...panel,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        loaded: true,
      }));
    }
  }

  async function toggleVersionHistory(doc) {
    const panel = getVersionPanel(doc.id);
    const nextShow = !panel.show;
    updateVersionPanel(doc.id, (current) => ({
      ...current,
      show: nextShow,
      error: nextShow ? current.error : null,
    }));

    if (nextShow && !panel.loaded && !panel.loading) {
      await loadVersionHistory(doc.id);
    }
  }

  async function handleUploadNewVersion(doc, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!doc || !file) return;

    const created = await createDocument({
      name: doc.name || file.name.replace(/\.[^.]+$/, '') || 'Document',
      doc_type: doc.doc_type || 'Draft',
      job_id: doc.job_id || undefined,
      source_document_id: doc.id,
      status: doc.status || undefined,
      tags: Array.isArray(doc.tags) ? doc.tags : undefined,
      file,
    });

    if (created) {
      refetch();
      setExpandedDocIds((previous) => {
        const next = new Set(previous);
        next.delete(doc.id);
        next.add(created.id);
        return next;
      });
      setVersionPanels((previous) => {
        const next = { ...previous };
        delete next[doc.id];
        return next;
      });
    }
  }

  function resetUploadForm() {
    setShowUploadForm(false);
    setUploadName('');
    setUploadType('Resume');
    setUploadFile(null);
    if (uploadFileRef.current) uploadFileRef.current.value = '';
    clearSaveError();
  }

  async function handleUpload(event) {
    event.preventDefault();
    const trimmedName = uploadName.trim();
    if (!trimmedName || !uploadFile || saving) return;

    const result = await createDocument({
      name: trimmedName,
      doc_type: uploadType,
      file: uploadFile,
    });

    if (result) {
      resetUploadForm();
      refetch();
      expandDocumentDetails(result.id);
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
              Upload general documents or job-linked documents. All files are stored securely.
            </p>
          </div>
          <button
            type="button"
            className="btn-add"
            disabled={saving}
            onClick={() => {
              if (saving) return;
              if (showUploadForm) {
                resetUploadForm();
              } else {
                clearSaveError();
                setShowUploadForm(true);
              }
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
                  onChange={(event) => setUploadName(event.target.value)}
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
                  onChange={(event) => setUploadType(event.target.value)}
                >
                  {DOC_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
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
                  onChange={(event) => setUploadFile(event.target.files[0] || null)}
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
                onChange={(event) => setSelectedDocType(event.target.value)}
              >
                <option value="">All Types</option>
                {DOC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
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
                onChange={(event) => setSelectedSortBy(event.target.value)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
                onChange={(event) => setShowArchived(event.target.checked)}
              />
            </div>
            <div className="dashboard-sort-control">
              <label className="dashboard-sort-label">Details</label>
              <div className="document-details-controls">
                <button
                  type="button"
                  className="view-toggle-btn"
                  onClick={expandAllDetails}
                  disabled={latestDocuments.length === 0}
                >
                  Expand all
                </button>
                <button
                  type="button"
                  className="view-toggle-btn"
                  onClick={collapseAllDetails}
                  disabled={latestDocuments.length === 0}
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

            {!loading && !error && latestDocuments.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty">
                  No saved documents yet. Create a draft from any job in your dashboard.
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              latestDocuments.map((doc, index) => {
                const isArchived = doc.status === 'archived';
                const isArchiving = archivingIds?.has?.(doc.id) || false;
                const rowBusy =
                  deletingId === doc.id ||
                  renamingId === doc.id ||
                  duplicatingId === doc.id ||
                  metadataSavingId === doc.id ||
                  isArchiving ||
                  saving;
                const isExpanded = expandedDocIds.has(doc.id);
                const versionPanel = getVersionPanel(doc.id);

                return (
                  <Fragment key={doc.id}>
                    <tr>
                      <td className="row-number">{index + 1}</td>
                      <td className="shell-cell-strong">
                        <div className="document-name-cell">
                          {renamingDocId === doc.id ? (
                            <input
                              className="inline-rename-input"
                              aria-label="New document name"
                              value={renameValue}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onBlur={() => {
                                if (skipBlurRef.current) {
                                  skipBlurRef.current = false;
                                  return;
                                }
                                commitRename(doc.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  skipBlurRef.current = true;
                                  commitRename(doc.id);
                                } else if (event.key === 'Escape') {
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
                            aria-expanded={isExpanded}
                            aria-controls={`document-details-${doc.id}`}
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
                                onClick={() => startDuplicate(doc)}
                                disabled={rowBusy}
                              >
                                {duplicatingId === doc.id ? '...' : <>&#128203;</>}
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
                                  AI
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
                            {isArchiving ? '...' : isArchived ? <>&#8617;</> : <>&#128230;</>}
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
                              {deletingId === doc.id ? '...' : <>&#128465;</>}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="document-details-row">
                        <td colSpan={7}>
                          <div
                            className="document-inline-details"
                            id={`document-details-${doc.id}`}
                          >
                            <p className="document-view-modal-text">
                              <strong>Type:</strong> {doc.doc_type || 'Draft'}
                            </p>
                            {metadataEditingDocId === doc.id ? (
                              <div style={{ marginTop: 12 }}>
                                <label
                                  className="draft-field-label"
                                  htmlFor={`doc-status-${doc.id}`}
                                >
                                  Status
                                </label>
                                <select
                                  id={`doc-status-${doc.id}`}
                                  className="jf-input"
                                  value={metadataStatus}
                                  onChange={(event) => setMetadataStatus(event.target.value)}
                                  disabled={metadataSavingId === doc.id}
                                >
                                  {DOCUMENT_STATUSES.map((status) => (
                                    <option key={status.value} value={status.value}>
                                      {status.label}
                                    </option>
                                  ))}
                                </select>
                                <label className="draft-field-label" htmlFor={`doc-tags-${doc.id}`}>
                                  Tags
                                </label>
                                <div
                                  className="dashboard-filter-dropdown"
                                  style={{ maxWidth: 360 }}
                                >
                                  <button
                                    id={`doc-tags-${doc.id}`}
                                    type="button"
                                    className="dashboard-filter-trigger"
                                    aria-expanded={tagsDropdownOpenDocId === doc.id}
                                    aria-controls={`doc-tags-panel-${doc.id}`}
                                    onClick={() =>
                                      setTagsDropdownOpenDocId((current) =>
                                        current === doc.id ? null : doc.id
                                      )
                                    }
                                    disabled={metadataSavingId === doc.id}
                                  >
                                    {getSelectedTagSummary(metadataTags)}
                                  </button>
                                  {tagsDropdownOpenDocId === doc.id && (
                                    <div
                                      id={`doc-tags-panel-${doc.id}`}
                                      className="dashboard-filter-panel"
                                      role="group"
                                      aria-label="Document tags"
                                      style={{ width: 300 }}
                                    >
                                      {DOCUMENT_TAG_OPTIONS.map((tag) => (
                                        <label key={tag} className="dashboard-filter-option">
                                          <input
                                            type="checkbox"
                                            checked={metadataTags.includes(tag)}
                                            onChange={() => toggleMetadataTag(tag)}
                                            disabled={metadataSavingId === doc.id}
                                          />
                                          <span>{tag}</span>
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {metadataError && (
                                  <p
                                    className="document-view-modal-text"
                                    role="alert"
                                    style={{
                                      color: 'var(--error)',
                                      fontSize: '12px',
                                      marginTop: 6,
                                    }}
                                  >
                                    {metadataError}
                                  </p>
                                )}
                                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                  <button
                                    type="button"
                                    className="document-view-modal-btn"
                                    onClick={() => saveMetadata(doc)}
                                    disabled={metadataSavingId === doc.id}
                                  >
                                    {metadataSavingId === doc.id ? 'Saving...' : 'Save metadata'}
                                  </button>
                                  <button
                                    type="button"
                                    className="document-view-modal-btn document-view-modal-btn--cancel"
                                    onClick={cancelMetadataEdit}
                                    disabled={metadataSavingId === doc.id}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="document-view-modal-text">
                                  <strong>Status:</strong> {doc.status || '--'}
                                </p>
                                <p className="document-view-modal-text">
                                  <strong>Tags:</strong> {renderTags(doc.tags)}
                                </p>
                              </>
                            )}
                            <p className="document-view-modal-text">
                              <strong>Version:</strong> v{getVersionNumber(doc)}
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

                            <div
                              style={{
                                marginTop: 12,
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                              }}
                            >
                              {metadataEditingDocId !== doc.id && (
                                <button
                                  type="button"
                                  className="document-view-modal-btn"
                                  onClick={() => startMetadataEdit(doc)}
                                  disabled={metadataSavingId === doc.id}
                                >
                                  Edit status/tags
                                </button>
                              )}
                              {!isArchived && (
                                <>
                                  <button
                                    type="button"
                                    className="document-view-modal-btn"
                                    onClick={() => versionUploadInputRefs.current[doc.id]?.click()}
                                    disabled={versionPanel.loading || saving}
                                  >
                                    Upload new version
                                  </button>
                                  <input
                                    ref={(node) => {
                                      if (node) versionUploadInputRefs.current[doc.id] = node;
                                    }}
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    style={{ display: 'none' }}
                                    aria-label="Upload new version file"
                                    onChange={(event) => handleUploadNewVersion(doc, event)}
                                  />
                                  <button
                                    type="button"
                                    className="document-view-modal-btn"
                                    onClick={() => startDuplicate(doc)}
                                    disabled={duplicatingId === doc.id}
                                  >
                                    Duplicate with new name
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="document-view-modal-btn"
                                onClick={() => toggleVersionHistory(doc)}
                              >
                                {versionPanel.show
                                  ? 'Hide version history'
                                  : 'View version history'}
                              </button>
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
                                aria-label="Close"
                                onClick={() => toggleDocumentDetails(doc.id)}
                                disabled={rowBusy}
                              >
                                Close details
                              </button>
                            </div>

                            {duplicateDocId === doc.id && (
                              <div style={{ marginTop: 14 }}>
                                <label className="draft-field-label" htmlFor="duplicate-name-input">
                                  Duplicate document name
                                </label>
                                <input
                                  id="duplicate-name-input"
                                  className="inline-rename-input"
                                  value={duplicateName}
                                  onChange={(event) => setDuplicateName(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      commitDuplicate(doc);
                                    } else if (event.key === 'Escape') {
                                      cancelDuplicate();
                                    }
                                  }}
                                  autoFocus
                                />
                                {duplicateError && (
                                  <p
                                    className="document-view-modal-text"
                                    role="alert"
                                    style={{
                                      color: 'var(--error)',
                                      fontSize: '12px',
                                      marginTop: 6,
                                    }}
                                  >
                                    {duplicateError}
                                  </p>
                                )}
                                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                  <button
                                    type="button"
                                    className="document-view-modal-btn"
                                    onClick={() => commitDuplicate(doc)}
                                    disabled={duplicatingId === doc.id || !duplicateName.trim()}
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

                            {versionPanel.error && (
                              <p
                                className="document-view-modal-text"
                                role="alert"
                                style={{ color: 'var(--error)' }}
                              >
                                {versionPanel.error}
                              </p>
                            )}

                            {versionPanel.show && (
                              <div style={{ marginTop: 14 }}>
                                {versionPanel.loading ? (
                                  <p
                                    className="document-view-modal-text"
                                    role="status"
                                    aria-live="polite"
                                  >
                                    Loading version history...
                                  </p>
                                ) : versionPanel.items.length > 0 ? (
                                  <ul
                                    style={{ margin: 0, paddingLeft: 18 }}
                                    aria-label="Version history list"
                                  >
                                    {versionPanel.items.map((version) => (
                                      <li key={version.id} className="document-view-modal-text">
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            flexWrap: 'wrap',
                                          }}
                                        >
                                          <span>
                                            {version.name} - v{getVersionNumber(version)} -{' '}
                                            {formatDocumentDate(
                                              version.updated_at || version.created_at,
                                              true
                                            )}
                                          </span>
                                          <button
                                            type="button"
                                            className="document-view-modal-btn"
                                            onClick={() => openDocument(version.id)}
                                          >
                                            Open
                                          </button>
                                          <button
                                            type="button"
                                            className="document-view-modal-btn"
                                            onClick={() => handleDownloadDocument(version)}
                                          >
                                            Download
                                          </button>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="document-view-modal-text">
                                    No version history available.
                                  </p>
                                )}
                              </div>
                            )}
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
