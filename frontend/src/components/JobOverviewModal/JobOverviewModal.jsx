import { useCallback, useEffect, useRef } from 'react';
import StatusBadge from '../common/StatusBadge';
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

export default function JobOverviewModal({ job, onClose }) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  return (
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
          <button type="button" className="jf-close" onClick={onClose} aria-label="Close overview">
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
        </div>

        <div className="job-overview-footer">
          <button type="button" className="job-overview-done" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
