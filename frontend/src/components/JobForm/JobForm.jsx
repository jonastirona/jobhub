import { useCallback, useEffect, useRef, useState } from 'react';
import './JobForm.css';

const STATUS_OPTIONS = [
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
];

const EMPTY_FORM = {
  title: '',
  company: '',
  location: '',
  status: 'applied',
  applied_date: '',
  description: '',
  notes: '',
};

// Normalize legacy short-form values stored by older records
const STATUS_ALIAS = { interview: 'interviewing', offer: 'offered' };

function toFormValues(job) {
  const rawStatus = job.status ?? 'applied';
  return {
    title: job.title ?? '',
    company: job.company ?? '',
    location: job.location ?? '',
    status: STATUS_ALIAS[rawStatus] ?? rawStatus,
    applied_date: job.applied_date?.slice(0, 10) ?? '',
    description: job.description ?? '',
    notes: job.notes ?? '',
  };
}

export default function JobForm({ mode, job, accessToken, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [values, setValues] = useState(() => (isEdit && job ? toFormValues(job) : EMPTY_FORM));
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [saving, setSaving] = useState(false);
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
      description: values.description.trim() || null,
      notes: values.notes.trim() || null,
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

      onSaved();
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
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="jf-row">
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
