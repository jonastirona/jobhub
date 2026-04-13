import { useCallback, useEffect, useRef } from 'react';
import './JobTimeline.css';

function formatDate(dateStr) {
  if (!dateStr) return null;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = isDateOnly ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_MILESTONES = {
  interviewing: { label: 'Interview Scheduled', icon: '💬', variant: 'blue' },
  offered: { label: 'Offer Received', icon: '🎯', variant: 'green' },
  rejected: { label: 'Application Rejected', icon: '✕', variant: 'red' },
  archived: { label: 'Application Archived', icon: '🗂', variant: 'gray' },
};

export function buildTimelineEvents(job) {
  const events = [];

  events.push({
    id: 'tracked',
    icon: '📁',
    label: 'Application Tracked',
    date: formatDate(job.created_at),
    rawDate: job.created_at,
    detail: `Added ${job.title} at ${job.company} to your tracker.`,
    variant: 'orange',
  });

  if (job.applied_date) {
    events.push({
      id: 'applied',
      icon: '📨',
      label: 'Applied',
      date: formatDate(job.applied_date),
      rawDate: `${job.applied_date}T00:00:00`,
      detail: `Submitted application to ${job.company}.`,
      variant: 'blue',
    });
  }

  const milestone = STATUS_MILESTONES[job.status];
  if (milestone) {
    events.push({
      id: `status-${job.status}`,
      icon: milestone.icon,
      label: milestone.label,
      date: formatDate(job.updated_at),
      rawDate: job.updated_at,
      detail: null,
      variant: milestone.variant,
    });
  }

  if (job.notes && job.notes.trim().length > 0) {
    const snippet =
      job.notes.trim().length > 80 ? `${job.notes.trim().slice(0, 80)}…` : job.notes.trim();
    events.push({
      id: 'notes',
      icon: '📝',
      label: 'Notes',
      date: null,
      rawDate: null,
      detail: snippet,
      variant: 'default',
    });
  }

  return events;
}

export default function JobTimeline({ job, onClose }) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleModalKeyDown = useCallback((e) => {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = Array.from(
      modalRef.current.querySelectorAll(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  const events = buildTimelineEvents(job);

  return (
    <div
      className="jt-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="jt-modal"
        ref={modalRef}
        onKeyDown={handleModalKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jt-title"
      >
        <div className="jt-header">
          <div className="jt-header-meta">
            <h2 className="jt-title" id="jt-title">
              Activity Timeline
            </h2>
            <p className="jt-subtitle">
              {job.title} — {job.company}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="jt-close"
            onClick={onClose}
            aria-label="Close timeline"
          >
            ✕
          </button>
        </div>

        <div className="jt-body">
          {job.location && (
            <div className="jt-meta-row">
              <span className="jt-meta-icon" aria-hidden="true">
                📍
              </span>
              <span>{job.location}</span>
            </div>
          )}

          <ol className="jt-list" aria-label="Application timeline">
            {events.map((event, idx) => (
              <li key={event.id} className={`jt-event jt-event--${event.variant}`}>
                <div className="jt-event-line" aria-hidden="true">
                  <div className="jt-dot">
                    <span className="jt-dot-icon" aria-hidden="true">
                      {event.icon}
                    </span>
                  </div>
                  {idx < events.length - 1 && <div className="jt-connector" aria-hidden="true" />}
                </div>
                <div className="jt-event-content">
                  <div className="jt-event-header">
                    <span className="jt-event-label">{event.label}</span>
                    {event.date && (
                      <span className="jt-event-date">
                        <time dateTime={event.rawDate ?? undefined}>{event.date}</time>
                      </span>
                    )}
                  </div>
                  {event.detail && <p className="jt-event-detail">{event.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
