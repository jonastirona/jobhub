import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useJobs } from '../hooks/useJobs';
import JobCard from '../components/JobCard';
import '../AuthPages.css';
import '../Dashboard.css';

export default function Home() {
  const { user, session, signOut } = useAuth();
  const navigate = useNavigate();
  const { jobs, loading, error } = useJobs(session?.access_token ?? null);

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="Dashboard">
      <div className="HomeToolbar">
        <span title={user?.email || ''}>{user?.email}</span>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>

      <main className="Dashboard-main">
        <h1 className="Dashboard-heading">My Jobs</h1>

        {loading && (
          <p className="Dashboard-state">Loading jobs…</p>
        )}

        {!loading && error && (
          <p className="Dashboard-state Dashboard-state--error">{error}</p>
        )}

        {!loading && !error && jobs.length === 0 && (
          <p className="Dashboard-state">
            No jobs yet. Add your first application to get started.
          </p>
        )}

        {!loading && !error && jobs.length > 0 && (
          <div className="JobBoard">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
