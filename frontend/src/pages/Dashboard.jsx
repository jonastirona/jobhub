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

const MOCK_APPLICATIONS = [
  {
    id: '001',
    jobTitle: 'Frontend Developer',
    location: 'Remote · Full-time',
    company: 'Stripe',
    stage: 'Interview',
    appliedDate: '03/15/2026',
    status: 'interview',
  },
  {
    id: '002',
    jobTitle: 'Software Engineer',
    location: 'New York, NY · Hybrid',
    company: 'Amazon',
    stage: 'Applied',
    appliedDate: '03/12/2026',
    status: 'applied',
  },
  {
    id: '003',
    jobTitle: 'Full Stack Developer',
    location: 'San Francisco, CA · On-site',
    company: 'Google',
    stage: 'Offer',
    appliedDate: '03/01/2026',
    status: 'offer',
  },
  {
    id: '004',
    jobTitle: 'Backend Engineer',
    location: 'Austin, TX · Remote',
    company: 'Meta',
    stage: 'Rejected',
    appliedDate: '02/28/2026',
    status: 'rejected',
  },
  {
    id: '005',
    jobTitle: 'React Developer',
    location: 'Remote · Contract',
    company: 'Netflix',
    stage: 'Applied',
    appliedDate: '03/20/2026',
    status: 'applied',
  },
  {
    id: '006',
    jobTitle: 'DevOps Engineer',
    location: 'Seattle, WA · Hybrid',
    company: 'Datadog',
    stage: 'Interested',
    appliedDate: '03/22/2026',
    status: 'interested',
  },
  {
    id: '007',
    jobTitle: 'UI/UX Engineer',
    location: 'Chicago, IL · On-site',
    company: 'Figma',
    stage: 'Interview',
    appliedDate: '03/10/2026',
    status: 'interview',
  },
  {
    id: '008',
    jobTitle: 'Platform Engineer',
    location: 'Remote · Full-time',
    company: 'Vercel',
    stage: 'Applied',
    appliedDate: '03/18/2026',
    status: 'applied',
  },
];

const STAT_CARDS = [
  {
    icon: '📁',
    label: 'Total Applications',
    value: '24',
    trend: '12% this month',
    trendDirection: 'up',
    accentClass: 'orange',
    bars: [
      { height: 14, color: 'var(--orange-200)' },
      { height: 20, color: 'var(--orange-200)' },
      { height: 16, color: 'var(--orange-200)' },
      { height: 28, color: 'var(--orange-300)' },
      { height: 22, color: 'var(--orange-300)' },
      { height: 32, color: 'var(--orange-400)' },
      { height: 36, color: 'var(--orange-500)' },
    ],
  },
  {
    icon: '💬',
    label: 'Interviews',
    value: '7',
    trend: '3 this week',
    trendDirection: 'up',
    accentClass: 'blue',
    bars: [
      { height: 10, color: 'var(--blue-bg)' },
      { height: 18, color: 'var(--blue-bg)' },
      { height: 24, color: '#93c5fd' },
      { height: 14, color: '#93c5fd' },
      { height: 30, color: '#60a5fa' },
      { height: 20, color: '#60a5fa' },
      { height: 36, color: 'var(--blue)' },
    ],
  },
  {
    icon: '🎯',
    label: 'Offers',
    value: '2',
    trend: '1 new',
    trendDirection: 'up',
    accentClass: 'green',
    bars: [
      { height: 8, color: 'var(--green-bg)' },
      { height: 12, color: 'var(--green-bg)' },
      { height: 8, color: '#86efac' },
      { height: 16, color: '#86efac' },
      { height: 10, color: '#4ade80' },
      { height: 24, color: '#22c55e' },
      { height: 36, color: 'var(--green)' },
    ],
  },
];

const PAGE_NUMBERS = [1, 2, 3, 4, 5];

export default function Dashboard() {
  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-main">
        <TopBar title="My Dashboard" notificationCount={3} />

        <div className="dashboard-content">
          <div className="stats-row">
            {STAT_CARDS.map((card) => (
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

            <table className="jobs-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Job Title</th>
                  <th>Company</th>
                  <th>Stage</th>
                  <th>Applied</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_APPLICATIONS.map((application) => (
                  <tr key={application.id}>
                    <td className="row-number">{application.id}</td>
                    <td>
                      <div className="job-title-cell">
                        <span className="job-title-text">
                          {application.jobTitle}
                        </span>
                        <span className="job-title-sub">
                          {application.location}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="company-cell">
                        <div
                          className="company-logo"
                          style={{
                            background: getCompanyGradient(application.company),
                          }}
                        >
                          {application.company[0]}
                        </div>
                        {application.company}
                      </div>
                    </td>
                    <td>{application.stage}</td>
                    <td>
                      <span className="date-text">{application.appliedDate}</span>
                    </td>
                    <td>
                      <StatusBadge status={application.status} />
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
                ))}
              </tbody>
            </table>

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
