import './StatusBadge.css';

const STATUS_CONFIG = {
  interested: { label: 'Interested', className: 'interested' },
  applied: { label: 'Applied', className: 'applied' },
  interview: { label: 'Interview', className: 'interview' },
  interviewing: { label: 'Interviewing', className: 'interview' },
  offer: { label: 'Offer', className: 'offer' },
  offered: { label: 'Offered', className: 'offer' },
  accepted: { label: 'Accepted', className: 'offer' },
  declined: { label: 'Declined', className: 'rejected' },
  rejected: { label: 'Rejected', className: 'rejected' },
  withdrawn: { label: 'Withdrawn', className: 'archived' },
  archived: { label: 'Archived', className: 'archived' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'unknown' };

  return (
    <span className={`status-badge ${config.className}`}>
      <span className="status-dot" aria-hidden="true" />
      {config.label}
    </span>
  );
}
