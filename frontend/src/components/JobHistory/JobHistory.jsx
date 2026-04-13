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

export default function JobHistory({ job, accessToken, onClose, onSaved }) {
  const { history, loading, error } = useJobHistory(job.id, accessToken);
  const [notes, setNotes] = useState(job.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState(null);
  const [notesSaved, setNotesSaved] = useState(false);

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
