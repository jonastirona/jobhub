import { useEffect, useMemo, useState } from 'react';
import StatusBadge from '../common/StatusBadge';
import { useJobAnalytics } from '../../hooks/useJobAnalytics';
import { useJobPickerJobs } from '../../hooks/useJobPickerJobs';
import './JobAnalyticsCard.css';

function formatStatusLabel(status) {
  const raw = String(status || '').trim();
  if (!raw) return 'Unknown';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatPickerJobLabel(job) {
  const company = String(job?.company || '').trim() || 'Unknown company';
  const title = String(job?.title || '').trim() || 'Untitled role';
  const status = formatStatusLabel(job?.status);
  return `${company} — ${title} (${status})`;
}

function formatDurationSeconds(totalSeconds) {
  const n = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (n === 0) return '0s';
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n / 60)}m`;
  if (n < 86400) return `${Math.floor(n / 3600)}h`;
  const days = Math.floor(n / 86400);
  const hours = Math.floor((n % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

export default function JobAnalyticsCard({ accessToken, jobsDataVersion = 0 }) {
  const {
    jobs: pickerJobs,
    loading: pickerLoading,
    error: pickerError,
  } = useJobPickerJobs(accessToken, jobsDataVersion);
  const [selectedJobId, setSelectedJobId] = useState('');
  const {
    data,
    loading: analyticsLoading,
    error: analyticsError,
  } = useJobAnalytics(accessToken, selectedJobId || null, jobsDataVersion);

  const selectedJob = useMemo(
    () => pickerJobs.find((j) => j.id === selectedJobId) || null,
    [pickerJobs, selectedJobId]
  );

  const [tickSeconds, setTickSeconds] = useState(0);

  useEffect(() => {
    if (!selectedJobId || pickerLoading) return;
    if (!selectedJob) {
      setSelectedJobId('');
    }
  }, [selectedJobId, selectedJob, pickerLoading]);

  useEffect(() => {
    setTickSeconds(0);
    if (!data?.as_of) return undefined;
    const hasCurrentStage = Object.values(data.time_in_stage || {}).some(
      (entry) => entry.is_current
    );
    if (!hasCurrentStage) return undefined;
    const asOfTs = new Date(data.as_of).getTime();
    if (Number.isNaN(asOfTs)) return undefined;

    const updateTick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - asOfTs) / 1000));
      setTickSeconds(elapsed);
    };
    updateTick();
    const id = window.setInterval(updateTick, 1000);
    return () => window.clearInterval(id);
  }, [data]);

  const stageEntries = useMemo(() => {
    if (!data?.time_in_stage) return [];
    return Object.entries(data.time_in_stage);
  }, [data]);

  const displayedStageEntries = useMemo(() => {
    return stageEntries.map(([key, entry]) => {
      const baseSeconds = Math.max(0, Math.floor(Number(entry.seconds) || 0));
      const seconds = entry.is_current ? baseSeconds + tickSeconds : baseSeconds;
      return [key, { ...entry, seconds }];
    });
  }, [stageEntries, tickSeconds]);

  const maxStageSeconds = useMemo(() => {
    if (displayedStageEntries.length === 0) return 0;
    return Math.max(...displayedStageEntries.map(([, e]) => e.seconds || 0), 1);
  }, [displayedStageEntries]);

  return (
    <section className="job-analytics-card" aria-labelledby="job-analytics-heading">
      <h2 className="job-analytics-card__title" id="job-analytics-heading">
        Application analytics
      </h2>
      <p className="job-analytics-card__hint">
        Status changes in the last week and month, and time spent in each stage (from your history).
      </p>

      <div className="job-analytics-card__row">
        <div className="job-analytics-card__field">
          <label className="job-analytics-card__label" htmlFor="job-analytics-job-select">
            Job
          </label>
          <select
            id="job-analytics-job-select"
            className="job-analytics-card__select"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            disabled={pickerLoading || pickerJobs.length === 0}
            aria-label="Select job for analytics"
          >
            <option value="">
              {pickerLoading
                ? 'Loading jobs…'
                : pickerJobs.length === 0
                  ? 'No jobs yet'
                  : 'Choose a job…'}
            </option>
            {pickerJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {formatPickerJobLabel(j)}
              </option>
            ))}
          </select>
        </div>

        {selectedJob && (
          <div
            className="job-analytics-card__current-stage"
            data-testid="job-analytics-current-stage"
          >
            <span className="job-analytics-card__current-stage-label">Current stage</span>
            <StatusBadge status={selectedJob.status} />
          </div>
        )}
      </div>

      {pickerError && (
        <p className="job-analytics-card__error" role="alert">
          {pickerError}
        </p>
      )}

      {!selectedJobId && !pickerLoading && pickerJobs.length > 0 && (
        <p className="job-analytics-card__muted">
          Select a job to load conversion and time-in-stage metrics.
        </p>
      )}

      {selectedJobId && analyticsError && (
        <p className="job-analytics-card__error" role="alert">
          {analyticsError}
        </p>
      )}

      {selectedJobId && analyticsLoading && !data && !analyticsError && (
        <p className="job-analytics-card__muted">Loading analytics…</p>
      )}

      {data && (
        <>
          <div className="job-analytics-card__metrics">
            <div className="job-analytics-card__metric">
              <div className="job-analytics-card__metric-value">
                {data.status_changes_last_7_days}
              </div>
              <div className="job-analytics-card__metric-label">Status changes (last 7 days)</div>
            </div>
            <div className="job-analytics-card__metric">
              <div className="job-analytics-card__metric-value">
                {data.status_changes_last_30_days}
              </div>
              <div className="job-analytics-card__metric-label">Status changes (last 30 days)</div>
            </div>
          </div>

          <h3 className="job-analytics-card__subsection-title">Time in each stage</h3>
          {stageEntries.length === 0 ? (
            <p className="job-analytics-card__muted">No stage duration data yet.</p>
          ) : (
            <table className="job-analytics-card__stage-table">
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">Duration</th>
                  <th scope="col" className="job-analytics-card__bar-col">
                    Relative
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedStageEntries.map(([key, entry]) => {
                  const secs = entry.seconds ?? 0;
                  const pct = Math.round((secs / maxStageSeconds) * 100);
                  const isCurrent = Boolean(entry.is_current);
                  return (
                    <tr
                      key={key}
                      className={isCurrent ? 'job-analytics-card__stage-row--current' : undefined}
                    >
                      <td>
                        {entry.label || key}
                        {isCurrent && (
                          <span className="job-analytics-card__current-pill">current</span>
                        )}
                      </td>
                      <td>{formatDurationSeconds(secs)}</td>
                      <td>
                        <div className="job-analytics-card__bar-wrap" title={`${pct}%`}>
                          <div className="job-analytics-card__bar" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {data.as_of && (
            <p className="job-analytics-card__as-of">
              Figures as of {new Date(data.as_of).toLocaleString()}
            </p>
          )}
        </>
      )}
    </section>
  );
}
