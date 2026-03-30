import './JobCard.css';

const STATUS_LABELS = {
  applied: 'Applied',
  interviewing: 'Interviewing',
  offered: 'Offered',
  rejected: 'Rejected',
};

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

export default function JobCard({ job }) {
  const { title, company, status, applied_date, updated_at } = job;
  const activityDate = applied_date || updated_at;
  const formattedDate = formatDate(activityDate);
  const statusLabel = STATUS_LABELS[status] || status;

  return (
    <article className="JobCard">
      <div className="JobCard-header">
        <h3 className="JobCard-title">{title}</h3>
        <span className={`JobCard-badge JobCard-badge--${status}`}>
          {statusLabel}
        </span>
      </div>
      <p className="JobCard-company">{company}</p>
      {formattedDate && (
        <p className="JobCard-date">{formattedDate}</p>
      )}
    </article>
  );
}
