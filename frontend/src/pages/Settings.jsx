import AppShell from '../components/layout/AppShell';
import './ShellPages.css';

export default function Settings() {
  return (
    <AppShell title="Settings" notificationCount={0}>
      <div className="shell-page-grid">
        <section className="shell-card" aria-labelledby="account-preferences-heading">
          <div className="shell-card-header shell-card-header--stacked">
            <h2 id="account-preferences-heading" className="shell-card-title">
              Account Preferences
            </h2>
            <p className="shell-card-subtitle">Update profile visibility and communication choices.</p>
          </div>

          <form className="settings-form" onSubmit={(e) => e.preventDefault()}>
            <label className="settings-field" htmlFor="email-notifications">
              <span className="settings-label">Email Notifications</span>
              <select id="email-notifications" className="settings-input" defaultValue="important-only">
                <option value="all">All updates</option>
                <option value="important-only">Important only</option>
                <option value="none">Do not send</option>
              </select>
            </label>

            <label className="settings-field" htmlFor="weekly-report">
              <span className="settings-label">Weekly Progress Report</span>
              <select id="weekly-report" className="settings-input" defaultValue="enabled">
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>

            <div className="settings-actions">
              <button type="button" className="btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn-add">
                Save Changes
              </button>
            </div>
          </form>
        </section>

        <section className="shell-card" aria-labelledby="security-heading">
          <div className="shell-card-header shell-card-header--stacked">
            <h2 id="security-heading" className="shell-card-title">
              Security
            </h2>
            <p className="shell-card-subtitle">Manage session and credential related controls.</p>
          </div>

          <div className="security-actions">
            <button type="button" className="btn-secondary">
              Sign Out Other Sessions
            </button>
            <button type="button" className="btn-danger">
              Reset API Tokens
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
