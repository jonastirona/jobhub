import { useAuth } from '../context/AuthContext';
import { useJobs } from '../hooks/useJobs';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import StatCard from '../components/common/StatCard';
import StatusBadge from '../components/common/StatusBadge';
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
  const { jobs, loading, error } = useJobs(session?.access_token);

  const totalApplications = jobs.length;
  const interviews = jobs.filter(
    (j) => j.status === 'interviewing' || j.status === 'interview'
  ).length;
  const offers = jobs.filter((j) => j.status === 'offered' || j.status === 'offer').length;

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

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-main">
        <TopBar title="My Dashboard" notificationCount={3} />

        <div className="dashboard-content">
          <div className="stats-row">
            {statCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </div>

          <div className="table-section">
            <div className="table-header">
              <div className="table-title">Job Applications</div>
              <button type="button" className="btn-add">
                + Add Job
              </button>
            </div>

            {loading && <p className="table-state">Loading jobs...</p>}
            {error && <p className="table-state table-state--error">{error}</p>}

            {!loading && !error && (
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Job Title</th>
                    <th>Company</th>
                    <th>Applied</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="table-empty">
                        No applications yet. Add your first job!
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job, index) => (
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
                          <StatusBadge status={job.status} />
                        </td>
                        <td>
                          <div className="actions-cell">
                            <button
                              type="button"
                              className="action-btn"
                              aria-label="View application"
                            >
                              👁
                            </button>
                            <button
                              type="button"
                              className="action-btn"
                              aria-label="Edit application"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="action-btn"
                              aria-label="Archive application"
                            >
                              🗂
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
      </main>
    </div>
  );
}
