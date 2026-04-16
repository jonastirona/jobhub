import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../hooks/useDocuments';
import './ShellPages.css';

function formatDocumentDate(dateStr) {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getLinkedJobLabel(doc) {
  if (!doc.job_id) {
    return 'General';
  }
  if (!doc.jobs) {
    return 'Linked job';
  }
  const title = doc.jobs.title || 'Untitled role';
  const company = doc.jobs.company || 'Unknown company';
  return `${title} - ${company}`;
}

export default function DocumentLibrary() {
  const { session } = useAuth();
  const { documents, loading, error } = useDocuments(session?.access_token);

  return (
    <AppShell title="Document Library" notificationCount={0}>
      <section className="shell-card" aria-labelledby="document-library-heading">
        <div className="shell-card-header">
          <div>
            <h2 id="document-library-heading" className="shell-card-title">
              Documents
            </h2>
            <p className="shell-card-subtitle">
              Generated and edited drafts are stored here and linked to their job context.
            </p>
          </div>
        </div>

        <table className="shell-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Type</th>
              <th>Linked To</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="table-empty">
                  Loading documents...
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={6} className="table-empty table-state--error">
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && documents.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
                  No saved documents yet. Create a draft from any job in your dashboard.
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              documents.map((doc, index) => (
                <tr key={doc.id}>
                  <td className="row-number">{index + 1}</td>
                  <td className="shell-cell-strong">{doc.name}</td>
                  <td>{doc.doc_type || 'Draft'}</td>
                  <td>{getLinkedJobLabel(doc)}</td>
                  <td>
                    <span className="date-text">
                      {formatDocumentDate(doc.updated_at || doc.created_at)}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button
                        type="button"
                        className="action-btn"
                        aria-label="View document"
                        disabled
                      >
                        👁
                      </button>
                      <button
                        type="button"
                        className="action-btn"
                        aria-label="Edit document"
                        disabled
                      >
                        ✏️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
