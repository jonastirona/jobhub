import './JobCard.css';

const STATUS_LABELS = {
  applied: 'Applied',
  interviewing: 'Interviewing',
  offered: 'Offered',
  rejected: 'Rejected',
};

const KNOWN_STATUSES = new Set(Object.keys(STATUS_LABELS));

function formatDate(dateStr) {
  if (!dateStr) return null;
  // Date-only strings (YYYY-MM-DD) are treated as local midnight to avoid
  // timezone offset shifting the displayed day.
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = isDateOnly ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncateNote(text, maxLen = 100) {
  if (!text?.trim()) return null;
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

export default function JobCard({ job }) {
  const { title, company, status, applied_date, updated_at, deadline, recruiter_notes } = job;
  const formattedApplied = applied_date ? formatDate(applied_date) : null;
  const formattedUpdated = !formattedApplied && updated_at ? formatDate(updated_at) : null;
  const formattedDeadline = deadline ? formatDate(deadline) : null;
  const recruiterSnippet = truncateNote(recruiter_notes);
  const statusLabel = STATUS_LABELS[status] || status;
  const badgeModifier = KNOWN_STATUSES.has(status) ? status : 'unknown';
  const recruiterTitle =
    recruiter_notes && typeof recruiter_notes === 'string' ? recruiter_notes.trim() : undefined;

  return (
    <article className="JobCard">
      <div className="JobCard-header">
        <h3 className="JobCard-title">{title}</h3>
        <span className={`JobCard-badge JobCard-badge--${badgeModifier}`}>{statusLabel}</span>
      </div>
      <p className="JobCard-company">{company}</p>
      {formattedApplied && <p className="JobCard-date">Applied {formattedApplied}</p>}
      {!formattedApplied && formattedUpdated && (
        <p className="JobCard-date">Updated {formattedUpdated}</p>
      )}
      {formattedDeadline && (
        <p className="JobCard-date JobCard-date--deadline">Deadline {formattedDeadline}</p>
      )}
      {recruiterSnippet && (
        <p className="JobCard-recruiter" title={recruiterTitle || undefined}>
          {recruiterSnippet}
        </p>
      )}
    </article>
  );
}
