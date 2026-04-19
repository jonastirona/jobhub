import { useEffect, useMemo, useState } from 'react';
import { JOB_STAGE_OPTIONS } from '../../models/job';
import StatusBadge from './StatusBadge';
import './JobStageTransitionControls.css';

function getInitialStatus(currentStatus) {
  return JOB_STAGE_OPTIONS.some((option) => option.value === currentStatus)
    ? currentStatus
    : JOB_STAGE_OPTIONS[0]?.value || '';
}

export default function JobStageTransitionControls({
  idBase,
  jobLabel,
  currentStatus,
  onSubmit,
  buttonLabel = 'Save stage',
  compact = false,
  disabled = false,
  variant = 'panel',
}) {
  const initialStatus = useMemo(() => getInitialStatus(currentStatus), [currentStatus]);
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const isStatusCell = variant === 'status-cell';

  useEffect(() => {
    setSelectedStatus(initialStatus);
    setIsOpen(false);
  }, [initialStatus]);

  useEffect(() => {
    function handleEscapeKey(event) {
      if (event.key === 'Escape' && isOpen && isStatusCell) {
        setIsOpen(false);
        setSelectedStatus(initialStatus);
      }
    }

    if (isOpen && isStatusCell) {
      document.addEventListener('keydown', handleEscapeKey);
      return () => document.removeEventListener('keydown', handleEscapeKey);
    }
  }, [isOpen, initialStatus, isStatusCell]);

  const labelText = jobLabel ? `Stage for ${jobLabel}` : 'Stage';
  const selectId = `${idBase || 'job-stage'}-stage-select`;
  const errorId = `${idBase || 'job-stage'}-stage-error`;
  const isNoop = selectedStatus === initialStatus;
  const canSubmit = Boolean(onSubmit) && !saving && !disabled && !isNoop && Boolean(selectedStatus);

  async function handleSubmit() {
    if (!canSubmit) return;

    setSaving(true);
    setError('');
    try {
      await onSubmit?.(selectedStatus);
      if (isStatusCell) {
        setIsOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function toggleOpen() {
    if (saving || disabled) return;
    setIsOpen((prev) => !prev);
  }

  function handleClose() {
    setIsOpen(false);
    setSelectedStatus(initialStatus);
  }

  return (
    <div
      className={`job-stage-controls${compact ? ' job-stage-controls--compact' : ''}${
        isStatusCell ? ' job-stage-controls--status-cell' : ''
      }`}
    >
      {isStatusCell ? (
        <div className="job-stage-controls__status-shell">
          <button
            type="button"
            className="job-stage-controls__status-button"
            onClick={toggleOpen}
            aria-haspopup="true"
            aria-expanded={isOpen}
            aria-label={labelText}
            disabled={saving || disabled}
            title="Click to change job stage"
          >
            <StatusBadge status={currentStatus} />
            <span className="job-stage-controls__edit-icon" aria-hidden="true">
              ✎
            </span>
          </button>
          {isOpen && (
            <>
              <div
                className="job-stage-controls__backdrop"
                onClick={handleClose}
                aria-hidden="true"
              />
              <div className="job-stage-controls__popover" role="group" aria-label={labelText}>
                <label className="job-stage-controls__field" htmlFor={selectId}>
                  <span className="job-stage-controls__label">Stage</span>
                  <select
                    id={selectId}
                    className="job-stage-controls__select"
                    aria-label={labelText}
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value)}
                    disabled={saving || disabled}
                  >
                    {JOB_STAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="job-stage-controls__popover-actions">
                  <button
                    type="button"
                    className="job-stage-controls__button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    aria-label={`Save stage for ${jobLabel || 'job'}`}
                  >
                    {saving ? 'Saving...' : buttonLabel}
                  </button>
                </div>
                {error && (
                  <p
                    className="job-stage-controls__error"
                    id={errorId}
                    role="alert"
                    aria-live="polite"
                  >
                    {error}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <label className="job-stage-controls__field" htmlFor={selectId}>
            <span className="job-stage-controls__label">Stage</span>
            <select
              id={selectId}
              className="job-stage-controls__select"
              aria-label={labelText}
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value)}
              disabled={saving || disabled}
            >
              {JOB_STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="job-stage-controls__button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-label={`Save stage for ${jobLabel || 'job'}`}
          >
            {saving ? 'Saving...' : buttonLabel}
          </button>
          {error && (
            <p className="job-stage-controls__error" id={errorId} role="alert" aria-live="polite">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
