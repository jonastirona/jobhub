import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from '../common/StatusBadge';
import AIDraftModal from '../AIDraftModal/AIDraftModal';
import AIResearchModal from '../AIResearchModal/AIResearchModal';
import SavedResearchModal from './SavedResearchModal';
import '../JobForm/JobForm.css';
import './JobOverviewModal.css';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = isDateOnly ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDocumentTimestamp(documentRecord) {
  const source = documentRecord?.updated_at || documentRecord?.created_at;
  const parsed = source ? new Date(source) : null;
  return parsed && !isNaN(parsed.getTime()) ? parsed.getTime() : 0;
}

function formatDocumentVersion(versionIndexFromLatest, totalVersions) {
  const versionNumber = totalVersions - versionIndexFromLatest + 1;
  if (versionIndexFromLatest === 1) {
    return `Latest (v${versionNumber})`;
  }
  return `v${versionNumber}`;
}

function Field({ label, children, muted }) {
  return (
    <div className="job-overview-section">
      <div className="job-overview-label">{label}</div>
      <div className={`job-overview-value${muted ? ' job-overview-value--muted' : ''}`}>
        {children}
      </div>
    </div>
  );
}

export default function JobOverviewModal({
  job,
  onClose,
  accessToken,
  documents = [],
  documentsLoading = false,
  documentsError = null,
  onRefreshDocuments,
  onOpenDocument,
  onDownloadDocument,
  onDocumentSaved,
  onJobUpdated,
  onLinkDocument,
  linkingIds = new Set(),
  linkError = null,
  clearLinkError,
}) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const [aiDraftType, setAiDraftType] = useState(null);
  const [showResearch, setShowResearch] = useState(false);
  const [showSavedResearch, setShowSavedResearch] = useState(false);
  const [jobWithResearch, setJobWithResearch] = useState(null);
  const [selectedLinkDocId, setSelectedLinkDocId] = useState('');

  useEffect(() => {
    clearLinkError?.();
    setSelectedLinkDocId('');
  }, [job?.id, clearLinkError]);

  useEffect(() => {
    if (!selectedLinkDocId) return;
    const stillAvailable = (Array.isArray(documents) ? documents : []).some(
      (d) =>
        d.id === selectedLinkDocId &&
        d.status !== 'archived' &&
        (d.job_id === null || d.job_id === undefined)
    );
    if (!stillAvailable) {
      setSelectedLinkDocId('');
      clearLinkError?.();
    }
  }, [documents, selectedLinkDocId, clearLinkError]);

  useEffect(() => {
    const hasChildModal = showSavedResearch || showResearch || !!aiDraftType;
    if (hasChildModal) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, aiDraftType, showResearch, showSavedResearch]);

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  const handleModalKeyDown = useCallback((e) => {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = Array.from(modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (!job) return null;

  const availableToLink = (Array.isArray(documents) ? documents : []).filter(
    (d) => d.status !== 'archived' && (d.job_id === null || d.job_id === undefined)
  );

  async function handleLinkDocument() {
    if (!selectedLinkDocId || !onLinkDocument) return;
    clearLinkError?.();
    const result = await onLinkDocument(selectedLinkDocId, job.id);
    if (result) setSelectedLinkDocId('');
  }

  async function handleUnlinkDocument(documentId) {
    if (!onLinkDocument) return;
    clearLinkError?.();
    await onLinkDocument(documentId, null);
  }

  const location = job.location?.trim() || '—';
  const description = job.description?.trim() || '—';
  const notes = job.notes?.trim() || '—';
  const recruiter = job.recruiter_notes?.trim() || '—';

  const linkedDocuments = useMemo(() => {
    const records = (Array.isArray(documents) ? documents : []).filter((documentRecord) => {
      return documentRecord?.job_id === job.id;
    });

    const grouped = new Map();
    records.forEach((documentRecord) => {
      const key = `${documentRecord.doc_type || 'Draft'}::${documentRecord.name || ''}`;
      const existing = grouped.get(key) || [];
      existing.push(documentRecord);
      grouped.set(key, existing);
    });

    const flattened = [];
    Array.from(grouped.values())
      .sort((leftGroup, rightGroup) => {
        const leftLatest = Math.max(
          ...leftGroup.map((documentRecord) => getDocumentTimestamp(documentRecord))
        );
        const rightLatest = Math.max(
          ...rightGroup.map((documentRecord) => getDocumentTimestamp(documentRecord))
        );
        return rightLatest - leftLatest;
      })
      .forEach((group) => {
        const sortedGroup = [...group].sort(
          (left, right) => getDocumentTimestamp(right) - getDocumentTimestamp(left)
        );
        const totalVersions = sortedGroup.length;
        sortedGroup.forEach((documentRecord, index) => {
          flattened.push({
            ...documentRecord,
            versionIndexFromLatest: index + 1,
            totalVersions,
          });
        });
      });

    return flattened;
  }, [documents, job.id]);

  return (
    <>
      <div className="jf-overlay" ref={overlayRef} onClick={handleOverlayClick} role="presentation">
        <div
          className="jf-modal"
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-overview-title"
          onKeyDown={handleModalKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="jf-header">
            <div>
              <h2 className="jf-title" id="job-overview-title">
                {job.title || 'Job'}
              </h2>
              <p className="job-overview-company">{job.company || '—'}</p>
            </div>
            <button
              type="button"
              className="jf-close"
              onClick={onClose}
              aria-label="Close overview"
            >
              ✕
            </button>
          </div>

          <div className="job-overview-body">
            <div className="job-overview-row-two">
              <div className="job-overview-section">
                <div className="job-overview-label">Status</div>
                <div className="job-overview-value job-overview-status-row">
                  <StatusBadge status={job.status} />
                  <button
                    type="button"
                    className={`srm-research-indicator ${
                      job.research?.trim() ? 'srm-research-indicator--active' : ''
                    }`}
                    onClick={() => setShowSavedResearch(true)}
                    aria-label={job.research?.trim() ? 'View saved research' : 'No research saved'}
                    title={job.research?.trim() ? 'View saved research' : 'No research saved'}
                  >
                    <span className="srm-research-icon">📚</span>
                    {job.research?.trim() && <span className="srm-research-dot" />}
                  </button>
                </div>
              </div>
              <Field label="Location">{location}</Field>
            </div>

            <div className="job-overview-row-two">
              <Field label="Applied date">{formatDate(job.applied_date)}</Field>
              <Field label="Job deadline">{formatDate(job.deadline)}</Field>
            </div>

            <Field label="Job description">{description}</Field>
            <Field label="Notes">{notes}</Field>
            <Field label="Recruiter / contact notes">{recruiter}</Field>

            <div className="job-overview-section">
              <div className="job-overview-documents-header">
                <div className="job-overview-label">Linked documents</div>
                {onRefreshDocuments && (
                  <button
                    type="button"
                    className="job-overview-doc-refresh"
                    onClick={onRefreshDocuments}
                    disabled={documentsLoading}
                  >
                    {documentsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                )}
              </div>

              {documentsError && (
                <p className="job-overview-doc-empty" role="alert">
                  {documentsError}
                </p>
              )}

              {documentsLoading && linkedDocuments.length === 0 && (
                <p className="job-overview-doc-empty" role="status" aria-live="polite">
                  Loading linked documents...
                </p>
              )}

              {!documentsLoading && !documentsError && linkedDocuments.length === 0 && (
                <p className="job-overview-doc-empty">No documents are linked to this job yet.</p>
              )}

              {linkError && (
                <p className="job-overview-doc-empty job-overview-link-error" role="alert">
                  {linkError}
                </p>
              )}

              {linkedDocuments.length > 0 && (
                <ul className="job-overview-doc-list" aria-label="Documents linked to this job">
                  {linkedDocuments.map((documentRecord) => {
                    const versionLabel = formatDocumentVersion(
                      documentRecord.versionIndexFromLatest,
                      documentRecord.totalVersions
                    );
                    const documentLabel = `${documentRecord.name} (${versionLabel})`;

                    return (
                      <li className="job-overview-doc-item" key={documentRecord.id}>
                        <div className="job-overview-doc-main">
                          <span className="job-overview-doc-name">{documentRecord.name}</span>
                          <span className="job-overview-doc-meta">
                            {documentRecord.doc_type || 'Draft'} • {versionLabel} • Updated{' '}
                            {formatDate(documentRecord.updated_at || documentRecord.created_at)}
                          </span>
                        </div>
                        <div className="job-overview-doc-actions">
                          <button
                            type="button"
                            className="job-overview-doc-btn"
                            aria-label={`Open ${documentLabel}`}
                            onClick={() => onOpenDocument?.(documentRecord.id)}
                            disabled={linkingIds.has(documentRecord.id)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="job-overview-doc-btn"
                            aria-label={`Download ${documentLabel}`}
                            onClick={() => onDownloadDocument?.(documentRecord)}
                            disabled={linkingIds.has(documentRecord.id)}
                          >
                            Download
                          </button>
                          {onLinkDocument && (
                            <button
                              type="button"
                              className="job-overview-doc-btn job-overview-doc-btn--unlink"
                              aria-label={`Unlink ${documentLabel} from this job`}
                              onClick={() => handleUnlinkDocument(documentRecord.id)}
                              disabled={linkingIds.has(documentRecord.id)}
                            >
                              {linkingIds.has(documentRecord.id) ? '…' : 'Unlink'}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {onLinkDocument && availableToLink.length > 0 && (
                <div className="job-overview-link-picker">
                  <label className="job-overview-label" htmlFor="job-overview-link-select">
                    Link a library document
                  </label>
                  <div className="job-overview-link-picker-row">
                    <select
                      id="job-overview-link-select"
                      value={selectedLinkDocId}
                      onChange={(e) => setSelectedLinkDocId(e.target.value)}
                      className="job-overview-link-select"
                    >
                      <option value="">Select a document…</option>
                      {availableToLink.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.doc_type || 'Draft'}) —{' '}
                          {formatDate(d.updated_at || d.created_at)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="job-overview-doc-btn"
                      onClick={handleLinkDocument}
                      disabled={!selectedLinkDocId || linkingIds.has(selectedLinkDocId)}
                      aria-label="Link selected document to this job"
                    >
                      {linkingIds.has(selectedLinkDocId) ? '…' : 'Link'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="job-overview-footer">
            {accessToken && (
              <div className="job-overview-ai-actions">
                <p className="job-overview-ai-label">AI tools</p>
                <div className="job-overview-ai-buttons">
                  <button
                    type="button"
                    className="job-overview-ai-btn"
                    onClick={() => setAiDraftType('resume')}
                  >
                    Resume Draft
                  </button>
                  <button
                    type="button"
                    className="job-overview-ai-btn"
                    onClick={() => setAiDraftType('cover_letter')}
                  >
                    Cover Letter
                  </button>
                  <button
                    type="button"
                    className="job-overview-ai-btn"
                    onClick={() => setShowResearch(true)}
                  >
                    Company Research
                  </button>
                </div>
              </div>
            )}
            <button type="button" className="job-overview-done" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      {aiDraftType && (
        <AIDraftModal
          type={aiDraftType}
          job={job}
          accessToken={accessToken}
          onClose={() => setAiDraftType(null)}
          onSaved={() => {
            onDocumentSaved?.();
          }}
        />
      )}

      {showResearch && (
        <AIResearchModal
          job={job}
          accessToken={accessToken}
          onClose={() => setShowResearch(false)}
          onResearchSaved={(updatedJob) => {
            setShowResearch(false);
            onJobUpdated?.();
            if (updatedJob) {
              setJobWithResearch(updatedJob);
              setShowSavedResearch(true);
            }
          }}
        />
      )}

      {showSavedResearch && (
        <SavedResearchModal
          job={jobWithResearch || job}
          accessToken={accessToken}
          onClose={() => {
            setShowSavedResearch(false);
            setJobWithResearch(null);
          }}
          onResearchUpdated={(updatedJob) => {
            if (updatedJob) {
              setJobWithResearch(updatedJob);
            }
            onJobUpdated?.();
          }}
        />
      )}
    </>
  );
}
