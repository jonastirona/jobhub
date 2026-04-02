import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../hooks/useProfile';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import './ProfilePage.css';

const EMPTY_FORM = {
  full_name: '',
  headline: '',
  location: '',
  phone: '',
  website: '',
  linkedin_url: '',
  github_url: '',
  summary: '',
};

function getInitials(fullName, email) {
  if (fullName && fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }
  return email?.[0]?.toUpperCase() ?? 'U';
}

function toFormValues(profile) {
  return {
    full_name: profile.full_name ?? '',
    headline: profile.headline ?? '',
    location: profile.location ?? '',
    phone: profile.phone ?? '',
    website: profile.website ?? '',
    linkedin_url: profile.linkedin_url ?? '',
    github_url: profile.github_url ?? '',
    summary: profile.summary ?? '',
  };
}

export default function ProfilePage() {
  const { session, user } = useAuth();
  const { profile, loading, error, saving, saveError, saveProfile } = useProfile(
    session?.access_token
  );

  const [values, setValues] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setValues(toFormValues(profile));
    }
  }, [profile]);

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (saved) setSaved(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setSaved(false);
    const payload = {
      full_name: values.full_name.trim() || null,
      headline: values.headline.trim() || null,
      location: values.location.trim() || null,
      phone: values.phone.trim() || null,
      website: values.website.trim() || null,
      linkedin_url: values.linkedin_url.trim() || null,
      github_url: values.github_url.trim() || null,
      summary: values.summary.trim() || null,
    };
    const success = await saveProfile(payload);
    if (success) setSaved(true);
  }

  const initials = getInitials(values.full_name, user?.email);

  return (
    <div className="profile-layout">
      <Sidebar />

      <main className="profile-main">
        <TopBar title="My Profile" notificationCount={0} />

        <div className="profile-content">
          {loading && <p className="profile-state">Loading profile...</p>}

          {!loading && (
            <>
              {error && (
                <p className="profile-state profile-state--error" role="alert">
                  {error}
                </p>
              )}

              <form className="profile-form" onSubmit={handleSubmit}>
                {/* Identity card */}
                <section className="profile-card" aria-labelledby="identity-heading">
                  <div className="profile-card-header">
                    <h2 id="identity-heading" className="profile-card-title">
                      Identity
                    </h2>
                  </div>

                  <div className="profile-avatar-row">
                    <div className="profile-avatar" aria-hidden="true">
                      {initials}
                    </div>
                    <div className="profile-avatar-meta">
                      <span className="profile-avatar-name">
                        {values.full_name.trim() || user?.email || 'Your Name'}
                      </span>
                      <span className="profile-avatar-headline">
                        {values.headline.trim() || 'Add a headline'}
                      </span>
                    </div>
                  </div>

                  <div className="profile-grid">
                    <div className="profile-field">
                      <label className="profile-label" htmlFor="pf-full-name">
                        Full Name
                      </label>
                      <input
                        id="pf-full-name"
                        className="profile-input"
                        type="text"
                        name="full_name"
                        value={values.full_name}
                        onChange={handleChange}
                        placeholder="e.g. Jane Smith"
                        autoComplete="name"
                      />
                    </div>

                    <div className="profile-field">
                      <label className="profile-label" htmlFor="pf-headline">
                        Headline
                      </label>
                      <input
                        id="pf-headline"
                        className="profile-input"
                        type="text"
                        name="headline"
                        value={values.headline}
                        onChange={handleChange}
                        placeholder="e.g. Software Engineer seeking new role"
                      />
                    </div>

                    <div className="profile-field">
                      <label className="profile-label" htmlFor="pf-location">
                        Location
                      </label>
                      <input
                        id="pf-location"
                        className="profile-input"
                        type="text"
                        name="location"
                        value={values.location}
                        onChange={handleChange}
                        placeholder="e.g. New York, NY"
                        autoComplete="address-level2"
                      />
                    </div>

                    <div className="profile-field">
                      <label className="profile-label" htmlFor="pf-phone">
                        Phone
                      </label>
                      <input
                        id="pf-phone"
                        className="profile-input"
                        type="tel"
                        name="phone"
                        value={values.phone}
                        onChange={handleChange}
                        placeholder="e.g. (555) 123-4567"
                        autoComplete="tel"
                      />
                    </div>

                    <div className="profile-field">
                      <label className="profile-label" htmlFor="pf-website">
                        Website
                      </label>
                      <input
                        id="pf-website"
                        className="profile-input"
                        type="url"
                        name="website"
                        value={values.website}
                        onChange={handleChange}
                        placeholder="https://yoursite.com"
                        autoComplete="url"
                      />
                    </div>

                    <div className="profile-field">
                      <label className="profile-label" htmlFor="pf-linkedin">
                        LinkedIn URL
                      </label>
                      <input
                        id="pf-linkedin"
                        className="profile-input"
                        type="url"
                        name="linkedin_url"
                        value={values.linkedin_url}
                        onChange={handleChange}
                        placeholder="https://linkedin.com/in/yourprofile"
                      />
                    </div>

                    <div className="profile-field profile-field--full">
                      <label className="profile-label" htmlFor="pf-github">
                        GitHub URL
                      </label>
                      <input
                        id="pf-github"
                        className="profile-input"
                        type="url"
                        name="github_url"
                        value={values.github_url}
                        onChange={handleChange}
                        placeholder="https://github.com/yourhandle"
                      />
                    </div>
                  </div>
                </section>

                {/* Summary card */}
                <section className="profile-card" aria-labelledby="summary-heading">
                  <div className="profile-card-header">
                    <h2 id="summary-heading" className="profile-card-title">
                      Professional Summary
                    </h2>
                  </div>

                  <div className="profile-field">
                    <label className="profile-label" htmlFor="pf-summary">
                      Summary
                    </label>
                    <textarea
                      id="pf-summary"
                      className="profile-textarea"
                      name="summary"
                      value={values.summary}
                      onChange={handleChange}
                      placeholder="Write a brief overview of your background, skills, and career goals..."
                      rows={6}
                    />
                    <span className="profile-char-count" aria-live="polite">
                      {values.summary.length} characters
                    </span>
                  </div>
                </section>

                {/* Actions */}
                <div className="profile-actions">
                  {saveError && (
                    <p className="profile-save-error" role="alert">
                      {saveError}
                    </p>
                  )}
                  {saved && !saveError && (
                    <p className="profile-save-success" role="status">
                      Profile saved successfully.
                    </p>
                  )}
                  <button type="submit" className="profile-btn-save" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
