import { useState } from 'react';
import * as Sentry from '@sentry/react';
import { useJobHistory } from '../../hooks/useJobHistory';
import StatusBadge from '../common/StatusBadge';
import './JobHistory.css';

const USER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function formatDateTime(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: USER_TIME_ZONE,
    timeZoneName: 'short',
  });
}

function toDateTimeLocalValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function localDateTimeToUtcIso(value) {
  if (!value) return value;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

export default function JobHistory({ job, accessToken, onClose, onSaved }) {
  const {
    history,
    interviews,
    loading,
    interviewLoading,
    error,
    savingInterview,
    interviewError,
    updateInterview,
    deleteInterview,
  } = useJobHistory(job.id, accessToken);
  const [notes, setNotes] = useState(job.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState(null);
  const [notesSaved, setNotesSaved] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState(null);
  const [expandedInterviewId, setExpandedInterviewId] = useState(null);
  const [editInterview, setEditInterview] = useState({
    round_type: '',
    scheduled_at: '',
    notes: '',
  });

  async function handleSaveNotes() {
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
    if (!backendBase) return;

    setSavingNotes(true);
    setNotesError(null);
    setNotesSaved(false);

    try {
      const res = await fetch(`${backendBase}/jobs/${job.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ notes: notes.trim() }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed (${res.status})`);
      }
      setNotesSaved(true);
      onSaved?.();
    } catch (err) {
      Sentry.captureException(err);
      setNotesError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingNotes(false);
    }
  }

  function startEditingInterview(interview) {
    setExpandedInterviewId(interview.id);
    setEditingInterviewId(interview.id);
    setEditInterview({
      round_type: interview.round_type ?? '',
      scheduled_at: toDateTimeLocalValue(interview.scheduled_at),
      notes: interview.notes ?? '',
    });
  }

  async function handleSaveInterviewEdit() {
    if (!editingInterviewId) return;

    try {
      await updateInterview(editingInterviewId, {
        round_type: editInterview.round_type,
        scheduled_at: localDateTimeToUtcIso(editInterview.scheduled_at),
        notes: editInterview.notes,
      });
      setEditingInterviewId(null);
    } catch {
      // The hook already updates interviewError; keep the editor open on failure.
    }
  }

  async function handleDeleteInterview(interviewId) {
    try {
      await deleteInterview(interviewId);
    } catch {
      // The hook already updates interviewError; swallow to avoid an unhandled rejection.
    }
  }

  const timelineEntries = [
    ...history.map((entry) => ({
      id: `status-${entry.id}`,
      type: 'status',
      happened_at: entry.changed_at,
      payload: entry,
    })),
    ...interviews.map((entry) => ({
      id: `interview-${entry.id}`,
      type: 'interview',
      happened_at: entry.scheduled_at,
      payload: entry,
    })),
  ].sort((a, b) => new Date(a.happened_at) - new Date(b.happened_at));

  return (
    <div className="jh-overlay" onClick={onClose} role="presentation">
      <div
        className="jh-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jh-title"
      >
        <div className="jh-header">
          <div>
            <h2 className="jh-title" id="jh-title">
              Activity Timeline
            </h2>
            <p className="jh-subtitle">
              {job.title} — {job.company}
            </p>
            <p className="jh-timezone-note">Times shown in {USER_TIME_ZONE}</p>
          </div>
          <button type="button" className="jh-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="jh-body">
          {(loading || interviewLoading) && (
            <p className="jh-state" role="status" aria-live="polite" aria-busy="true">
              Loading history...
            </p>
          )}
          {error && (
            <p className="jh-state jh-state--error" role="alert">
              {error}
            </p>
          )}

          {!(loading || interviewLoading) && !error && timelineEntries.length === 0 && (
            <p className="jh-state">No activity recorded yet.</p>
          )}

          {!(loading || interviewLoading) && !error && timelineEntries.length > 0 && (
            <ol className="jh-timeline">
              {timelineEntries.map((entry, index) => (
                <li
                  key={entry.id}
                  className={`jh-entry${entry.type === 'interview' ? ' jh-entry--interview' : ''}`}
                >
                  <div className="jh-entry-line">
                    <div
                      className={`jh-dot${
                        index === timelineEntries.length - 1 ? ' jh-dot--current' : ''
                      }`}
                    />
                    {index < timelineEntries.length - 1 && <div className="jh-connector" />}
                  </div>
                  <div className="jh-entry-content">
                    {entry.type === 'status' ? (
                      <>
                        <div className="jh-entry-badges">
                          {entry.payload.from_status ? (
                            <>
                              <StatusBadge status={entry.payload.from_status} />
                              <span className="jh-arrow">→</span>
                            </>
                          ) : (
                            <span className="jh-created-label">Created as</span>
                          )}
                          <StatusBadge status={entry.payload.to_status} />
                        </div>
                        <time className="jh-time" dateTime={entry.payload.changed_at}>
                          {formatDateTime(entry.payload.changed_at)}
                        </time>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="jh-interview-toggle"
                          aria-expanded={expandedInterviewId === entry.payload.id}
                          aria-controls={`jh-interview-expanded-${entry.payload.id}`}
                          onClick={() =>
                            setExpandedInterviewId((prev) =>
                              prev === entry.payload.id ? null : entry.payload.id
                            )
                          }
                        >
                          {entry.payload.round_type}
                        </button>
                        <time className="jh-time" dateTime={entry.payload.scheduled_at}>
                          {formatDateTime(entry.payload.scheduled_at)}
                        </time>
                        {expandedInterviewId === entry.payload.id && (
                          <div
                            id={`jh-interview-expanded-${entry.payload.id}`}
                            className="jh-interview-expanded"
                          >
                            {editingInterviewId === entry.payload.id ? (
                              <>
                                <div className="jh-interview-grid">
                                  <input
                                    className="jh-input"
                                    aria-label="Interview round type"
                                    value={editInterview.round_type}
                                    onChange={(e) =>
                                      setEditInterview((prev) => ({
                                        ...prev,
                                        round_type: e.target.value,
                                      }))
                                    }
                                    placeholder="Round type"
                                  />
                                  <input
                                    className="jh-input"
                                    aria-label="Interview scheduled date and time"
                                    type="datetime-local"
                                    value={editInterview.scheduled_at}
                                    onChange={(e) =>
                                      setEditInterview((prev) => ({
                                        ...prev,
                                        scheduled_at: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <textarea
                                  className="jh-notes-textarea"
                                  rows={2}
                                  value={editInterview.notes}
                                  onChange={(e) =>
                                    setEditInterview((prev) => ({ ...prev, notes: e.target.value }))
                                  }
                                  placeholder="Interview notes"
                                />
                                <div className="jh-interview-actions">
                                  <button
                                    type="button"
                                    className="jh-interview-btn jh-interview-btn--ghost"
                                    onClick={() => setEditingInterviewId(null)}
                                    disabled={savingInterview}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="jh-interview-btn jh-interview-btn--primary"
                                    onClick={handleSaveInterviewEdit}
                                    disabled={savingInterview}
                                  >
                                    {savingInterview ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                {entry.payload.notes && (
                                  <p className="jh-interview-notes">{entry.payload.notes}</p>
                                )}
                                <div className="jh-interview-actions">
                                  <button
                                    type="button"
                                    className="jh-interview-btn jh-interview-btn--ghost"
                                    onClick={() => startEditingInterview(entry.payload)}
                                    disabled={savingInterview}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="jh-interview-btn jh-interview-btn--danger"
                                    onClick={() => handleDeleteInterview(entry.payload.id)}
                                    disabled={savingInterview}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        {!interviewLoading && interviewError && (
          <p className="jh-state jh-state--error jh-inline-error">{interviewError}</p>
        )}

        <div className="jh-notes">
          <label className="jh-notes-label" htmlFor="jh-notes-input">
            Notes
          </label>
          <textarea
            id="jh-notes-input"
            className="jh-notes-textarea"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesSaved(false);
            }}
            placeholder="Interview notes, contacts, follow-up reminders..."
            rows={4}
          />
          {notesError && <p className="jh-state jh-state--error">{notesError}</p>}
          <div className="jh-notes-footer">
            {notesSaved && <span className="jh-notes-saved">Saved</span>}
            <button
              type="button"
              className="jh-notes-btn"
              onClick={handleSaveNotes}
              disabled={savingNotes}
            >
              {savingNotes ? 'Saving...' : 'Save Notes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
