import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from '../common/StatusBadge';
import AIDraftModal from '../AIDraftModal/AIDraftModal';
import AIResearchModal from '../AIResearchModal/AIResearchModal';
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
}) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const [aiDraftType, setAiDraftType] = useState(null);
  const [showResearch, setShowResearch] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (aiDraftType) {
          setAiDraftType(null);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, aiDraftType]);

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
                <div className="job-overview-value">
                  <StatusBadge status={job.status} />
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
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="job-overview-doc-btn"
                            aria-label={`Download ${documentLabel}`}
                            onClick={() => onDownloadDocument?.(documentRecord)}
                          >
                            Download
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
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
        />
      )}
    </>
  );
}
