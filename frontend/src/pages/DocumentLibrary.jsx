import AppShell from '../components/layout/AppShell';
import './ShellPages.css';

const DOCUMENTS = [
  {
    id: 1,
    name: 'Resume_v3.pdf',
    type: 'Resume',
    linkedTo: 'Backend Engineer - Datadog',
    updatedAt: 'Apr 2, 2026',
  },
  {
    id: 2,
    name: 'CoverLetter_Stripe.docx',
    type: 'Cover Letter',
    linkedTo: 'Product Analyst - Stripe',
    updatedAt: 'Mar 27, 2026',
  },
  {
    id: 3,
    name: 'Portfolio_Summary.pdf',
    type: 'Portfolio',
    linkedTo: 'General',
    updatedAt: 'Mar 18, 2026',
  },
];

export default function DocumentLibrary() {
  return (
    <AppShell title="Document Library" notificationCount={0}>
      <section className="shell-card" aria-labelledby="document-library-heading">
        <div className="shell-card-header">
          <div>
            <h2 id="document-library-heading" className="shell-card-title">
              Documents
            </h2>
            <p className="shell-card-subtitle">
              Manage resumes, cover letters, and attachments used across applications.
            </p>
          </div>
          <button type="button" className="btn-add">
            + Add Document
          </button>
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
            {DOCUMENTS.map((doc, index) => (
              <tr key={doc.id}>
                <td className="row-number">{index + 1}</td>
                <td className="shell-cell-strong">{doc.name}</td>
                <td>{doc.type}</td>
                <td>{doc.linkedTo}</td>
                <td>
                  <span className="date-text">{doc.updatedAt}</span>
                </td>
                <td>
                  <div className="actions-cell">
                    <button type="button" className="action-btn" aria-label="View document">
                      👁
                    </button>
                    <button type="button" className="action-btn" aria-label="Edit document">
                      ✏️
                    </button>
                    <button type="button" className="action-btn" aria-label="Archive document">
                      🗂
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
