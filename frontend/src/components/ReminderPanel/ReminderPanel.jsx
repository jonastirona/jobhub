import { useState } from 'react';
import { useJobs } from '../../hooks/useJobs';
import './ReminderPanel.css';

function parseLocalDate(isoString) {
  // Always extract just the YYYY-MM-DD part and parse as local midnight.
  // If we use the full ISO string (e.g. "2026-04-14T00:00:00+00:00"), the
  // UTC-to-local conversion shifts the date back a day in timezones west of UTC.
  if (!isoString) return new Date(NaN);
  const datePart = isoString.split('T')[0];
  return new Date(`${datePart}T00:00:00`);
}

function formatDate(isoString) {
  const d = parseLocalDate(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isToday(isoString) {
  const d = parseLocalDate(isoString);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

function isPastDue(isoString) {
  const d = parseLocalDate(isoString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

export default function ReminderPanel({ accessToken, reminders, onClose, onRefetch }) {
  const { jobs } = useJobs(accessToken);
  const [form, setForm] = useState({ job_id: '', title: '', notes: '', due_date: '' });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [actionError, setActionError] = useState(null);

  const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

  const pending = reminders.filter((r) => !r.completed_at);
  const completed = reminders.filter((r) => r.completed_at);

  async function handleCreate(e) {
    e.preventDefault();
    if (!backendBase || !accessToken) return;

    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch(`${backendBase}/reminders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          job_id: form.job_id,
          title: form.title.trim(),
          notes: form.notes.trim() || undefined,
          due_date: form.due_date,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Failed to create reminder (${res.status})`);
      }
      setForm({ job_id: '', title: '', notes: '', due_date: '' });
      onRefetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(reminder) {
    if (!backendBase || !accessToken) return;
    setCompleting(reminder.id);
    setActionError(null);
    try {
      const res = await fetch(`${backendBase}/reminders/${reminder.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ completed_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Failed to mark reminder complete (${res.status})`);
      onRefetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setCompleting(null);
    }
  }

  async function handleDelete(reminderId) {
    if (!backendBase || !accessToken) return;
    setDeleting(reminderId);
    setActionError(null);
    try {
      const res = await fetch(`${backendBase}/reminders/${reminderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to delete reminder (${res.status})`);
      onRefetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="rp-overlay" onClick={onClose} role="presentation">
      <div
        className="rp-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rp-title"
      >
        <div className="rp-header">
          <h2 className="rp-title" id="rp-title">
            Reminders
          </h2>
          <button type="button" className="rp-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="rp-body">
          {actionError && (
            <p className="rp-error" role="alert">
              {actionError}
            </p>
          )}
          {pending.length === 0 && <p className="rp-empty">No upcoming reminders.</p>}

          {pending.length > 0 && (
            <ul className="rp-list">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className={`rp-item${
                    isToday(r.due_date)
                      ? ' rp-item--due'
                      : isPastDue(r.due_date)
                        ? ' rp-item--overdue'
                        : ''
                  }`}
                >
                  <div className="rp-item-main">
                    <span className="rp-item-title">{r.title}</span>
                    <span className="rp-item-job">
                      {r.jobs?.company} — {r.jobs?.title}
                    </span>
                    {r.notes && <span className="rp-item-notes">{r.notes}</span>}
                    <span className="rp-item-date">
                      {isToday(r.due_date)
                        ? 'Due today'
                        : isPastDue(r.due_date)
                          ? `Overdue · ${formatDate(r.due_date)}`
                          : formatDate(r.due_date)}
                    </span>
                  </div>
                  <div className="rp-item-actions">
                    <button
                      type="button"
                      className="rp-btn-complete"
                      onClick={() => handleComplete(r)}
                      disabled={completing === r.id}
                      aria-label="Mark complete"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="rp-btn-delete"
                      onClick={() => handleDelete(r.id)}
                      disabled={deleting === r.id}
                      aria-label="Delete reminder"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {completed.length > 0 && (
            <details className="rp-completed">
              <summary className="rp-completed-summary">Completed ({completed.length})</summary>
              <ul className="rp-list rp-list--completed">
                {completed.map((r) => (
                  <li key={r.id} className="rp-item rp-item--completed">
                    <div className="rp-item-main">
                      <span className="rp-item-title">{r.title}</span>
                      <span className="rp-item-job">
                        {r.jobs?.company} — {r.jobs?.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="rp-btn-delete"
                      onClick={() => handleDelete(r.id)}
                      disabled={deleting === r.id}
                      aria-label="Delete reminder"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <form className="rp-form" onSubmit={handleCreate}>
          <p className="rp-form-title">Add reminder</p>

          <select
            className="rp-input"
            value={form.job_id}
            onChange={(e) => setForm((f) => ({ ...f, job_id: e.target.value }))}
            required
            aria-label="Job"
          >
            <option value="">Select a job...</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.company} — {j.title}
              </option>
            ))}
          </select>

          <input
            className="rp-input"
            type="text"
            placeholder="Title (e.g. Follow up on offer)"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            aria-label="Reminder title"
          />

          <textarea
            className="rp-input rp-textarea"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            aria-label="Notes"
          />

          <input
            className="rp-input"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            required
            aria-label="Due date"
          />

          {formError && <p className="rp-form-error">{formError}</p>}

          <button type="submit" className="rp-btn-submit" disabled={saving}>
            {saving ? 'Saving...' : 'Add Reminder'}
          </button>
        </form>
      </div>
    </div>
  );
}
