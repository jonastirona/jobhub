import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useJobs } from '../hooks/useJobs';
import AppShell from '../components/layout/AppShell';
import StatCard from '../components/common/StatCard';
import StatusBadge from '../components/common/StatusBadge';
import JobForm from '../components/JobForm/JobForm';
import JobHistory from '../components/JobHistory/JobHistory';
import { jobMatchesSearchQuery } from '../utils/jobSearch';
import '../styles/Dashboard.css';

const COMPANY_GRADIENTS = {
  Stripe: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  Amazon: 'linear-gradient(135deg, #f97316, #c2410c)',
  Google: 'linear-gradient(135deg, #22c55e, #15803d)',
  Meta: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  Netflix: 'linear-gradient(135deg, #ec4899, #be185d)',
  Datadog: 'linear-gradient(135deg, #14b8a6, #0f766e)',
  Figma: 'linear-gradient(135deg, #f59e0b, #b45309)',
  Vercel: 'linear-gradient(135deg, #6366f1, #4338ca)',
};

function getCompanyGradient(companyName) {
  return (
    COMPANY_GRADIENTS[companyName] ??
    'linear-gradient(135deg, var(--orange-500), var(--orange-600))'
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = isDateOnly ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function truncateTableNote(text, maxLen = 56) {
  if (!text?.trim()) return '—';
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

const STAT_BARS = {
  orange: [
    { height: 14, color: 'var(--orange-200)' },
    { height: 20, color: 'var(--orange-200)' },
    { height: 16, color: 'var(--orange-200)' },
    { height: 28, color: 'var(--orange-300)' },
    { height: 22, color: 'var(--orange-300)' },
    { height: 32, color: 'var(--orange-400)' },
    { height: 36, color: 'var(--orange-500)' },
  ],
  blue: [
    { height: 10, color: 'var(--blue-bg)' },
    { height: 18, color: 'var(--blue-bg)' },
    { height: 24, color: '#93c5fd' },
    { height: 14, color: '#93c5fd' },
    { height: 30, color: '#60a5fa' },
    { height: 20, color: '#60a5fa' },
    { height: 36, color: 'var(--blue)' },
  ],
  green: [
    { height: 8, color: 'var(--green-bg)' },
    { height: 12, color: 'var(--green-bg)' },
    { height: 8, color: '#86efac' },
    { height: 16, color: '#86efac' },
    { height: 10, color: '#4ade80' },
    { height: 24, color: '#22c55e' },
    { height: 36, color: 'var(--green)' },
  ],
};

const PAGE_NUMBERS = [1, 2, 3, 4, 5];

export default function Dashboard() {
  const { session } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const { jobs, loading, error, refetch } = useJobs(session?.access_token, searchTerm);
  const [formState, setFormState] = useState(null); // null | { mode: 'create' } | { mode: 'edit', job }
  const [historyJob, setHistoryJob] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletingJobId, setDeletingJobId] = useState(null);
  const [jobPendingDelete, setJobPendingDelete] = useState(null);
  const deleteOverlayRef = useRef(null);
  const deleteModalRef = useRef(null);
  const deleteCancelButtonRef = useRef(null);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredJobs = jobs.filter((job) => jobMatchesSearchQuery(job, searchTerm));

  const totalApplications = filteredJobs.length;
  const interviews = filteredJobs.filter(
    (j) => j.status === 'interviewing' || j.status === 'interview'
  ).length;
  const offers = filteredJobs.filter(
    (j) => j.status === 'offered' || j.status === 'offer' || j.status === 'accepted'
  ).length;

  const statCards = [
    {
      icon: '📁',
      label: 'Total Applications',
      value: String(totalApplications),
      trend: 'all time',
      trendDirection: 'up',
      accentClass: 'orange',
      bars: STAT_BARS.orange,
    },
    {
      icon: '💬',
      label: 'Interviews',
      value: String(interviews),
      trend: 'in progress',
      trendDirection: 'up',
      accentClass: 'blue',
      bars: STAT_BARS.blue,
    },
    {
      icon: '🎯',
      label: 'Offers',
      value: String(offers),
      trend: 'received',
      trendDirection: 'up',
      accentClass: 'green',
      bars: STAT_BARS.green,
    },
  ];

  function openCreate() {
    setFormState({ mode: 'create' });
  }

  function openEdit(job) {
    setFormState({ mode: 'edit', job });
  }

  function closeForm() {
    setFormState(null);
  }

  function handleSaved() {
    refetch();
  }

  function requestDelete(job) {
    setDeleteError('');
    setJobPendingDelete(job);
  }

  const cancelDelete = useCallback(() => {
    if (deletingJobId) return;
    setJobPendingDelete(null);
  }, [deletingJobId]);

  const handleDeleteModalKeyDown = useCallback(
    (e) => {
      const modal = deleteModalRef.current;
      if (e.key !== 'Tab' || !modal) return;

      const focusable = Array.from(
        modal.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );

      if (focusable.length === 0) {
        e.preventDefault();
        if (!modal.hasAttribute('tabindex')) {
          modal.setAttribute('tabindex', '-1');
        }
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [deleteModalRef]
  );

  function handleDeleteOverlayClick(e) {
    if (e.target === deleteOverlayRef.current) {
      cancelDelete();
    }
  }

  useEffect(() => {
    if (!jobPendingDelete) return undefined;
    deleteCancelButtonRef.current?.focus();
    function handleEscape(e) {
      if (e.key === 'Escape') {
        cancelDelete();
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [jobPendingDelete, cancelDelete]);

  useEffect(() => {
    if (jobPendingDelete && deletingJobId) {
      deleteModalRef.current?.focus();
    }
  }, [jobPendingDelete, deletingJobId]);

  async function confirmDelete() {
    if (!jobPendingDelete || deletingJobId) return;
    const jobId = jobPendingDelete.id;
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
    if (!backendBase || !session?.access_token) {
      setDeleteError('Unable to delete application right now. Please refresh and try again.');
      return;
    }

    setDeleteError('');
    setDeletingJobId(jobId);

    try {
      const res = await fetch(`${backendBase}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to delete application (${res.status})`);
      }
      await refetch();
      setJobPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete application.');
    } finally {
      setDeletingJobId(null);
    }
  }

  return (
    <AppShell title="My Dashboard" notificationCount={0}>
      <div className="dashboard-content">
        <div className="stats-row">
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        <div className="table-section">
          <div className="table-header">
            <div className="table-title">Job Applications</div>
            <button type="button" className="btn-add" onClick={openCreate}>
              + Add Job
            </button>
          </div>
          <div className="table-search-row">
            <div className="dashboard-search-box">
              <span className="dashboard-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search title, company, status, description, notes, recruiter, dates (month, year, day)..."
                aria-label="Search job applications"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          {loading && <p className="table-state">Loading jobs...</p>}
          {error && <p className="table-state table-state--error">{error}</p>}
          {!error && deleteError && !jobPendingDelete && (
            <p className="table-state table-state--error">{deleteError}</p>
          )}

          {!loading && !error && (
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Job Title</th>
                  <th>Company</th>
                  <th>Applied</th>
                  <th>Deadline</th>
                  <th>Recruiter</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty">
                      {jobs.length === 0
                        ? 'No applications yet. Add your first job!'
                        : 'No matches found. Try another keyword.'}
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job, index) => (
                    <tr key={job.id}>
                      <td className="row-number">{index + 1}</td>
                      <td>
                        <div className="job-title-cell">
                          <span className="job-title-text">{job.title}</span>
                        </div>
                      </td>
                      <td>
                        <div className="company-cell">
                          <div
                            className="company-logo"
                            style={{ background: getCompanyGradient(job.company) }}
                          >
                            {job.company?.[0]}
                          </div>
                          {job.company}
                        </div>
                      </td>
                      <td>
                        <span className="date-text">{formatDate(job.applied_date)}</span>
                      </td>
                      <td>
                        <span className="date-text date-text--deadline">
                          {formatDate(job.deadline)}
                        </span>
                      </td>
                      <td>
                        <span
                          className="table-recruiter-cell"
                          title={
                            job.recruiter_notes && String(job.recruiter_notes).trim()
                              ? String(job.recruiter_notes).trim()
                              : undefined
                          }
                        >
                          {truncateTableNote(job.recruiter_notes)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button
                            type="button"
                            className="action-btn"
                            aria-label="View stage history"
                            onClick={() => setHistoryJob(job)}
                            disabled={deletingJobId === job.id}
                          >
                            👁
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            aria-label="Edit application"
                            onClick={() => openEdit(job)}
                            disabled={deletingJobId === job.id}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            aria-label={`Delete application ${job.title}`}
                            onClick={() => requestDelete(job)}
                            disabled={deletingJobId === job.id}
                          >
                            {deletingJobId === job.id ? '…' : '🗑'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          <div className="table-footer">
            <div className="rows-select">
              Show
              <select aria-label="Rows per page">
                <option>10</option>
                <option>25</option>
                <option>50</option>
              </select>
              entries
            </div>

            <div className="pagination" role="navigation" aria-label="Pagination">
              <button type="button" className="page-btn nav-arrow" aria-label="Previous page">
                ‹
              </button>
              {PAGE_NUMBERS.map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`page-btn${page === 1 ? ' active' : ''}`}
                  aria-label={`Page ${page}`}
                  aria-current={page === 1 ? 'page' : undefined}
                >
                  {page}
                </button>
              ))}
              <button type="button" className="page-btn nav-arrow" aria-label="Next page">
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {formState && (
        <JobForm
          key={formState.mode === 'edit' ? formState.job?.id : 'create'}
          mode={formState.mode}
          job={formState.job}
          accessToken={session?.access_token}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      {historyJob && (
        <JobHistory
          job={historyJob}
          accessToken={session?.access_token}
          onClose={() => setHistoryJob(null)}
          onSaved={handleSaved}
        />
      )}

      {jobPendingDelete && (
        <div
          className="delete-modal-overlay"
          role="presentation"
          ref={deleteOverlayRef}
          onClick={handleDeleteOverlayClick}
          data-testid="delete-modal-overlay"
        >
          <div
            className="delete-modal"
            ref={deleteModalRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleDeleteModalKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            aria-describedby="delete-modal-text"
            aria-busy={Boolean(deletingJobId)}
            tabIndex={-1}
          >
            <h2 className="delete-modal-title" id="delete-modal-title">
              Delete application?
            </h2>
            <p className="delete-modal-text" id="delete-modal-text">
              You are about to delete <strong>{jobPendingDelete.title}</strong> at{' '}
              <strong>{jobPendingDelete.company}</strong>. This action cannot be undone.
            </p>
            {deleteError && (
              <p className="delete-modal-error" role="alert" aria-live="assertive">
                {deleteError}
              </p>
            )}
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-btn delete-modal-btn--cancel"
                onClick={cancelDelete}
                ref={deleteCancelButtonRef}
                disabled={Boolean(deletingJobId)}
                aria-disabled={Boolean(deletingJobId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-btn delete-modal-btn--danger"
                onClick={confirmDelete}
                disabled={Boolean(deletingJobId)}
              >
                {deletingJobId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
