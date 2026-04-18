import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_JOB, JOB_STATUS_ALIAS, JOB_STATUSES } from '../../models/job';
import './JobForm.css';

function toFormValues(job) {
  const rawStatus = job.status ?? 'applied';
  return {
    title: job.title ?? '',
    company: job.company ?? '',
    location: job.location ?? '',
    status: JOB_STATUS_ALIAS[rawStatus] ?? rawStatus,
    applied_date: job.applied_date?.slice(0, 10) ?? '',
    deadline: job.deadline?.slice(0, 10) ?? '',
    description: job.description ?? '',
    notes: job.notes ?? '',
    recruiter_notes: job.recruiter_notes ?? '',
  };
}

function localDateTimeToUtcIso(value) {
  if (!value) return value;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

export default function JobForm({ mode, job, accessToken, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [values, setValues] = useState(() => (isEdit && job ? toFormValues(job) : EMPTY_JOB));
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [nextInterview, setNextInterview] = useState({
    round_type: '',
    scheduled_at: '',
    notes: '',
  });
  const [loggingInterview, setLoggingInterview] = useState(false);
  const [interviewLogMessage, setInterviewLogMessage] = useState(null);
  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const firstInputRef = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, saving]);

  const handleModalKeyDown = useCallback((e) => {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = Array.from(
      modalRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function validate() {
    const next = {};
    if (!values.title.trim()) next.title = 'Job title is required.';
    if (!values.company.trim()) next.company = 'Company is required.';
    return next;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setApiError(null);
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
    if (!backendBase) {
      setApiError('Backend URL is not configured.');
      return;
    }
    if (!accessToken) {
      setApiError('You are not authenticated. Please sign in again.');
      return;
    }
    if (isEdit && !job?.id) {
      setApiError('Job data is missing. Please close and try again.');
      return;
    }

    const url = isEdit ? `${backendBase}/jobs/${job.id}` : `${backendBase}/jobs`;
    const method = isEdit ? 'PUT' : 'POST';

    const body = {
      title: values.title.trim(),
      company: values.company.trim(),
      location: values.location.trim() || null,
      status: values.status,
      applied_date: values.applied_date || null,
      deadline: values.deadline || null,
      description: values.description.trim() || null,
      notes: values.notes.trim() || null,
      recruiter_notes: values.recruiter_notes.trim() || null,
    };

    setSaving(true);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed (${res.status})`);
      }
      const savedJob = await res.json();
      let interviewWarning = null;

      if (
        values.status === 'interviewing' &&
        nextInterview.round_type.trim() &&
        nextInterview.scheduled_at
      ) {
        const interviewPayload = {
          round_type: nextInterview.round_type.trim(),
          scheduled_at: localDateTimeToUtcIso(nextInterview.scheduled_at),
          notes: nextInterview.notes.trim() || null,
        };
        const targetJobId = isEdit ? job.id : savedJob.id;

        try {
          const interviewRes = await fetch(`${backendBase}/jobs/${targetJobId}/interviews`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(interviewPayload),
          });
          if (!interviewRes.ok) {
            const text = await interviewRes.text().catch(() => '');
            throw new Error(text || `Interview request failed (${interviewRes.status})`);
          }
        } catch (err) {
          interviewWarning = err instanceof Error ? err.message : String(err);
        }
      }

      onSaved();
      if (interviewWarning) {
        window.alert(`Job saved, but the interview could not be logged: ${interviewWarning}`);
      }
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current && !saving) onClose();
  }

  async function handleLogInterview() {
    if (loggingInterview || saving) return;
    setApiError(null);
    setInterviewLogMessage(null);

    if (!isEdit || !job?.id) {
      setApiError('Save this application first, then log interviews.');
      return;
    }
    if (!nextInterview.round_type.trim() || !nextInterview.scheduled_at) {
      setApiError('Round type and date/time are required to log an interview.');
      return;
    }

    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
    if (!backendBase) {
      setApiError('Backend URL is not configured.');
      return;
    }
    if (!accessToken) {
      setApiError('You are not authenticated. Please sign in again.');
      return;
    }

    setLoggingInterview(true);
    try {
      const interviewRes = await fetch(`${backendBase}/jobs/${job.id}/interviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          round_type: nextInterview.round_type.trim(),
          scheduled_at: localDateTimeToUtcIso(nextInterview.scheduled_at),
          notes: nextInterview.notes.trim() || null,
        }),
      });
      if (!interviewRes.ok) {
        const text = await interviewRes.text().catch(() => '');
        throw new Error(text || `Interview request failed (${interviewRes.status})`);
      }
      setNextInterview({ round_type: '', scheduled_at: '', notes: '' });
      setInterviewLogMessage('Interview logged.');
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoggingInterview(false);
    }
  }

  return (
    <div className="jf-overlay" ref={overlayRef} onClick={handleOverlayClick} role="presentation">
      <div
        className="jf-modal"
        ref={modalRef}
        onKeyDown={handleModalKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jf-title"
      >
        <div className="jf-header">
          <h2 className="jf-title" id="jf-title">
            {isEdit ? 'Edit Application' : 'Add Job Application'}
          </h2>
          <button
            type="button"
            className="jf-close"
            onClick={onClose}
            aria-label="Close form"
            disabled={saving}
          >
            ✕
          </button>
        </div>

        <form className="jf-form" onSubmit={handleSubmit} noValidate>
          <div className="jf-row jf-row--two">
            <div className="jf-field">
              <label className="jf-label" htmlFor="jf-title-input">
                Job Title <span className="jf-required">*</span>
              </label>
              <input
                ref={firstInputRef}
                id="jf-title-input"
                className={`jf-input${errors.title ? ' jf-input--error' : ''}`}
                type="text"
                name="title"
                value={values.title}
                onChange={handleChange}
                placeholder="e.g. Software Engineer"
                autoComplete="off"
                aria-describedby={errors.title ? 'jf-title-error' : undefined}
                aria-invalid={errors.title ? true : undefined}
              />
              {errors.title && (
                <span id="jf-title-error" className="jf-error-msg" role="alert">
                  {errors.title}
                </span>
              )}
            </div>

            <div className="jf-field">
              <label className="jf-label" htmlFor="jf-company-input">
                Company <span className="jf-required">*</span>
              </label>
              <input
                id="jf-company-input"
                className={`jf-input${errors.company ? ' jf-input--error' : ''}`}
                type="text"
                name="company"
                value={values.company}
                onChange={handleChange}
                placeholder="e.g. Acme Corp"
                autoComplete="off"
                aria-describedby={errors.company ? 'jf-company-error' : undefined}
                aria-invalid={errors.company ? true : undefined}
              />
              {errors.company && (
                <span id="jf-company-error" className="jf-error-msg" role="alert">
                  {errors.company}
                </span>
              )}
            </div>
          </div>

          {isEdit && values.status === 'interviewing' && (
            <div className="jf-interview-block">
              <div className="jf-interview-title">Log an Interview</div>
              <div className="jf-row jf-row--two">
                <div className="jf-field">
                  <label className="jf-label" htmlFor="jf-next-round-input">
                    Round Type
                  </label>
                  <input
                    id="jf-next-round-input"
                    className="jf-input"
                    type="text"
                    value={nextInterview.round_type}
                    onChange={(e) =>
                      setNextInterview((prev) => ({ ...prev, round_type: e.target.value }))
                    }
                    placeholder="e.g. Phone Screen"
                  />
                </div>
                <div className="jf-field">
                  <label className="jf-label" htmlFor="jf-next-scheduled-input">
                    Date & Time
                  </label>
                  <input
                    id="jf-next-scheduled-input"
                    className="jf-input"
                    type="datetime-local"
                    value={nextInterview.scheduled_at}
                    onChange={(e) =>
                      setNextInterview((prev) => ({ ...prev, scheduled_at: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="jf-row">
                <div className="jf-field">
                  <label className="jf-label" htmlFor="jf-next-notes-input">
                    Interview Notes
                  </label>
                  <textarea
                    id="jf-next-notes-input"
                    className="jf-textarea"
                    rows={2}
                    value={nextInterview.notes}
                    onChange={(e) =>
                      setNextInterview((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Prep notes, interviewer context, reminders..."
                  />
                </div>
              </div>
              <div className="jf-interview-actions">
                {interviewLogMessage && (
                  <span className="jf-interview-saved">{interviewLogMessage}</span>
                )}
                <button
                  type="button"
                  className="jf-btn jf-btn--save"
                  onClick={handleLogInterview}
                  disabled={
                    saving ||
                    loggingInterview ||
                    !nextInterview.round_type.trim() ||
                    !nextInterview.scheduled_at
                  }
                >
                  {loggingInterview ? 'Logging...' : 'Log Interview'}
                </button>
              </div>
            </div>
          )}

          <div className="jf-row jf-row--two">
            <div className="jf-field">
              <label className="jf-label" htmlFor="jf-location-input">
                Location
              </label>
              <input
                id="jf-location-input"
                className="jf-input"
                type="text"
                name="location"
                value={values.location}
                onChange={handleChange}
                placeholder="e.g. New York, NY or Remote"
                autoComplete="off"
              />
            </div>

            <div className="jf-field">
              <label className="jf-label" htmlFor="jf-status-input">
                Status
              </label>
              <select
                id="jf-status-input"
                className="jf-select"
                name="status"
                value={values.status}
                onChange={handleChange}
              >
                {JOB_STATUSES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="jf-row jf-row--two">
            <div className="jf-field">
              <label className="jf-label" htmlFor="jf-date-input">
                Applied Date
              </label>
              <input
                id="jf-date-input"
                className="jf-input jf-input--date"
                type="date"
                name="applied_date"
                value={values.applied_date}
                onChange={handleChange}
              />
            </div>
            <div className="jf-field">
              <label className="jf-label" htmlFor="jf-deadline-input">
                Job Deadline
              </label>
              <input
                id="jf-deadline-input"
                className="jf-input jf-input--date"
                type="date"
                name="deadline"
                value={values.deadline}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="jf-row">
            <div className="jf-field">
              <label className="jf-label" htmlFor="jf-description-input">
                Job Description
              </label>
              <textarea
                id="jf-description-input"
                className="jf-textarea"
                name="description"
                value={values.description}
                onChange={handleChange}
                placeholder="Paste the job description or key details..."
                rows={4}
              />
            </div>
          </div>

          <div className="jf-row">
            <div className="jf-field">
              <label className="jf-label" htmlFor="jf-notes-input">
                Notes
              </label>
              <textarea
                id="jf-notes-input"
                className="jf-textarea"
                name="notes"
                value={values.notes}
                onChange={handleChange}
                placeholder="Interview notes, contacts, follow-up reminders..."
                rows={3}
              />
            </div>
          </div>

          <div className="jf-row">
            <div className="jf-field">
              <label className="jf-label" htmlFor="jf-recruiter-notes-input">
                Recruiter / contact notes
              </label>
              <textarea
                id="jf-recruiter-notes-input"
                className="jf-textarea"
                name="recruiter_notes"
                value={values.recruiter_notes}
                onChange={handleChange}
                placeholder="Recruiter name, email, phone, or other contact context..."
                rows={3}
              />
            </div>
          </div>

          {apiError && (
            <div className="jf-api-error" role="alert">
              {apiError}
            </div>
          )}

          <div className="jf-actions">
            <button
              type="button"
              className="jf-btn jf-btn--cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="jf-btn jf-btn--save" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
