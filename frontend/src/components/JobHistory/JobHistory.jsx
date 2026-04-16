import { useState } from 'react';
import { useJobHistory } from '../../hooks/useJobHistory';
import StatusBadge from '../common/StatusBadge';
import './JobHistory.css';

function formatDateTime(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toDateTimeLocalValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

export default function JobHistory({ job, accessToken, onClose, onSaved }) {
  const {
    history,
    interviews,
    loading,
    error,
    savingInterview,
    interviewError,
    createInterview,
    updateInterview,
  } = useJobHistory(job.id, accessToken);
  const [notes, setNotes] = useState(job.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState(null);
  const [notesSaved, setNotesSaved] = useState(false);
  const [interviewSaved, setInterviewSaved] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState(null);
  const [newInterview, setNewInterview] = useState({
    round_type: '',
    scheduled_at: '',
    notes: '',
  });
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
      setNotesError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleCreateInterview() {
    setInterviewSaved(false);
    await createInterview({
      round_type: newInterview.round_type,
      scheduled_at: newInterview.scheduled_at,
      notes: newInterview.notes,
    });
    setNewInterview({ round_type: '', scheduled_at: '', notes: '' });
    setInterviewSaved(true);
  }

  function startEditingInterview(interview) {
    setEditingInterviewId(interview.id);
    setEditInterview({
      round_type: interview.round_type ?? '',
      scheduled_at: toDateTimeLocalValue(interview.scheduled_at),
      notes: interview.notes ?? '',
    });
  }

  async function handleSaveInterviewEdit() {
    if (!editingInterviewId) return;
    setInterviewSaved(false);
    await updateInterview(editingInterviewId, {
      round_type: editInterview.round_type,
      scheduled_at: editInterview.scheduled_at,
      notes: editInterview.notes,
    });
    setEditingInterviewId(null);
    setInterviewSaved(true);
  }

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
              Stage History
            </h2>
            <p className="jh-subtitle">
              {job.title} — {job.company}
            </p>
          </div>
          <button type="button" className="jh-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="jh-body">
          {loading && <p className="jh-state">Loading history...</p>}
          {error && <p className="jh-state jh-state--error">{error}</p>}

          {!loading && !error && history.length === 0 && (
            <p className="jh-state">No stage history recorded yet.</p>
          )}

          {!loading && !error && history.length > 0 && (
            <ol className="jh-timeline">
              {history.map((entry, index) => (
                <li key={entry.id} className="jh-entry">
                  <div className="jh-entry-line">
                    <div
                      className={`jh-dot${index === history.length - 1 ? ' jh-dot--current' : ''}`}
                    />
                    {index < history.length - 1 && <div className="jh-connector" />}
                  </div>
                  <div className="jh-entry-content">
                    <div className="jh-entry-badges">
                      {entry.from_status ? (
                        <>
                          <StatusBadge status={entry.from_status} />
                          <span className="jh-arrow">→</span>
                        </>
                      ) : (
                        <span className="jh-created-label">Created as</span>
                      )}
                      <StatusBadge status={entry.to_status} />
                    </div>
                    <time className="jh-time" dateTime={entry.changed_at}>
                      {formatDateTime(entry.changed_at)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="jh-interviews">
          <div className="jh-interviews-header">
            <h3 className="jh-interviews-title">Interview Events</h3>
            {interviewSaved && <span className="jh-notes-saved">Saved</span>}
          </div>
          {interviewError && <p className="jh-state jh-state--error">{interviewError}</p>}

          {interviews.length === 0 ? (
            <p className="jh-state">No interview events yet.</p>
          ) : (
            <ul className="jh-interviews-list">
              {interviews.map((interview) => {
                const isEditing = editingInterviewId === interview.id;
                return (
                  <li key={interview.id} className="jh-interview-item">
                    {isEditing ? (
                      <>
                        <div className="jh-interview-grid">
                          <input
                            className="jh-input"
                            value={editInterview.round_type}
                            onChange={(e) =>
                              setEditInterview((prev) => ({ ...prev, round_type: e.target.value }))
                            }
                            placeholder="Round type"
                          />
                          <input
                            className="jh-input"
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
                            className="jh-notes-btn jh-notes-btn--muted"
                            onClick={() => setEditingInterviewId(null)}
                            disabled={savingInterview}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="jh-notes-btn"
                            onClick={handleSaveInterviewEdit}
                            disabled={savingInterview}
                          >
                            {savingInterview ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="jh-interview-item-head">
                          <strong>{interview.round_type}</strong>
                          <span className="jh-time">{formatDateTime(interview.scheduled_at)}</span>
                        </div>
                        {interview.notes && <p className="jh-interview-notes">{interview.notes}</p>}
                        <div className="jh-interview-actions">
                          <button
                            type="button"
                            className="jh-notes-btn jh-notes-btn--muted"
                            onClick={() => startEditingInterview(interview)}
                            disabled={savingInterview}
                          >
                            Edit
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="jh-interview-create">
            <h4 className="jh-interviews-subtitle">Add Interview Event</h4>
            <div className="jh-interview-grid">
              <input
                className="jh-input"
                value={newInterview.round_type}
                onChange={(e) =>
                  setNewInterview((prev) => ({ ...prev, round_type: e.target.value }))
                }
                placeholder="Round type (e.g. Phone Screen)"
              />
              <input
                className="jh-input"
                type="datetime-local"
                value={newInterview.scheduled_at}
                onChange={(e) =>
                  setNewInterview((prev) => ({ ...prev, scheduled_at: e.target.value }))
                }
              />
            </div>
            <textarea
              className="jh-notes-textarea"
              rows={2}
              value={newInterview.notes}
              onChange={(e) => setNewInterview((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Interview notes"
            />
            <div className="jh-interview-actions">
              <button
                type="button"
                className="jh-notes-btn"
                onClick={handleCreateInterview}
                disabled={
                  savingInterview || !newInterview.round_type.trim() || !newInterview.scheduled_at
                }
              >
                {savingInterview ? 'Saving...' : 'Add Interview Event'}
              </button>
            </div>
          </div>
        </div>

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
