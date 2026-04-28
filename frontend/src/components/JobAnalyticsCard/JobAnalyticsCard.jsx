import { useMemo, useState } from 'react';
import { useJobAnalytics } from '../../hooks/useJobAnalytics';
import { useJobPickerJobs } from '../../hooks/useJobPickerJobs';
import './JobAnalyticsCard.css';

function formatDurationSeconds(totalSeconds) {
  const n = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (n === 0) return '0s';
  const days = Math.floor(n / 86400);
  const hours = Math.floor((n % 86400) / 3600);
  const mins = Math.floor((n % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (!days && mins) parts.push(`${mins}m`);
  if (parts.length === 0) parts.push(`${n % 60}s`);
  return parts.join(' ');
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

  const maxStageSeconds = useMemo(() => {
    if (!data?.time_in_stage) return 0;
    return Math.max(...Object.values(data.time_in_stage).map((e) => e.seconds || 0), 1);
  }, [data]);

  const stageEntries = useMemo(() => {
    if (!data?.time_in_stage) return [];
    return Object.entries(data.time_in_stage);
  }, [data]);

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
                {j.company} — {j.title}
              </option>
            ))}
          </select>
        </div>
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
                {stageEntries.map(([key, entry]) => {
                  const secs = entry.seconds ?? 0;
                  const pct = Math.round((secs / maxStageSeconds) * 100);
                  return (
                    <tr key={key}>
                      <td>{entry.label || key}</td>
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
              Figures as of {new Date(data.as_of).toLocaleString()} (UTC)
            </p>
          )}
        </>
      )}
    </section>
  );
}
