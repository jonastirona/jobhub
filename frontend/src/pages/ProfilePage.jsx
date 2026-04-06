import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../hooks/useProfile';
import './ProfilePage.css';

const REQUIRED_PROFILE_FIELDS = [
  { key: 'full_name', label: 'Full Name' },
  { key: 'headline', label: 'Headline' },
  { key: 'location', label: 'Location' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
];

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

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function toNullableString(value) {
  const trimmed = asText(value).trim();
  return trimmed === '' ? null : trimmed;
}

function getInitials(fullName, email) {
  const normalizedName = asText(fullName).trim();
  if (normalizedName) {
    const parts = normalizedName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return asText(email).charAt(0).toUpperCase() || 'U';
}

function getCompletionState(values, fields = REQUIRED_PROFILE_FIELDS) {
  const completedFields = fields.filter(({ key }) => asText(values[key]).trim().length > 0);
  const missingFields = fields.filter(({ key }) => asText(values[key]).trim().length === 0);
  const totalFields = fields.length;
  const completionPercentage = totalFields
    ? Math.round((completedFields.length / totalFields) * 100)
    : 0;

  return {
    completedCount: completedFields.length,
    requiredCount: totalFields,
    completionPercentage,
    isComplete: missingFields.length === 0,
    missingFields: missingFields.map(({ label }) => label),
  };
}

export default function ProfilePage() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const { profile, loading, error, saving, saveError, saveProfile } = useProfile(accessToken);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setFormData({
      full_name: asText(profile?.full_name),
      headline: asText(profile?.headline),
      location: asText(profile?.location),
      phone: asText(profile?.phone),
      website: asText(profile?.website),
      linkedin_url: asText(profile?.linkedin_url),
      github_url: asText(profile?.github_url),
      summary: asText(profile?.summary),
    });
  }, [profile]);

  const draftCompletion = useMemo(() => getCompletionState(formData), [formData]);

  const avatarInitials = useMemo(
    () => getInitials(formData.full_name, user?.email),
    [formData.full_name, user?.email]
  );

  const displayName = asText(formData.full_name).trim() || user?.email || 'User';
  const displayHeadline = asText(formData.headline).trim() || 'Add a headline';
  const summaryCount = asText(formData.summary).length;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSaveSuccess(false);
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    setSaveSuccess(false);

    const payload = {
      full_name: toNullableString(formData.full_name),
      headline: toNullableString(formData.headline),
      location: toNullableString(formData.location),
      phone: toNullableString(formData.phone),
      website: toNullableString(formData.website),
      linkedin_url: toNullableString(formData.linkedin_url),
      github_url: toNullableString(formData.github_url),
      summary: toNullableString(formData.summary),
    };

    const saved = await saveProfile(payload);
    if (saved) setSaveSuccess(true);
  };

  if (loading) {
    return (
      <AppShell title="My Profile" notificationCount={0}>
        <div className="profile-content">
          <p className="profile-state">Loading profile...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="My Profile" notificationCount={0}>
      <div className="profile-content">
        {error && (
          <p className="profile-state profile-state--error" role="alert">
            {error}
          </p>
        )}

        {!error && !draftCompletion.isComplete && (
          <section className="profile-completion" aria-labelledby="profile-completion-heading">
            <div className="profile-completion-header">
              <div>
                <h2 id="profile-completion-heading" className="profile-completion-title">
                  Profile completion
                </h2>
                <p className="profile-completion-copy">
                  {draftCompletion.completedCount}/{draftCompletion.requiredCount} required fields
                  complete.
                </p>
              </div>
              <div
                className="profile-completion-score"
                aria-label={`Draft completion ${draftCompletion.completionPercentage}%`}
              >
                {draftCompletion.completionPercentage}%
              </div>
            </div>

            <div className="profile-progress" aria-hidden="true">
              <div
                className="profile-progress-bar"
                style={{ width: `${draftCompletion.completionPercentage}%` }}
              />
            </div>

            <p className="profile-completion-footnote">
              Missing: {draftCompletion.missingFields.join(', ')}.
            </p>
          </section>
        )}

        <form className="profile-form" onSubmit={handleSubmit}>
          <section className="profile-card" role="region" aria-labelledby="profile-identity-title">
            <div className="profile-card-header">
              <h2 id="profile-identity-title" className="profile-card-title">
                Identity
              </h2>
            </div>

            <div className="profile-avatar-row">
              <div className="profile-avatar">{avatarInitials}</div>
              <div className="profile-avatar-meta">
                <div className="profile-avatar-name">{displayName}</div>
                <div className="profile-avatar-headline">{displayHeadline}</div>
              </div>
            </div>

            <div className="profile-grid">
              <div className="profile-field">
                <label htmlFor="full_name" className="profile-label">
                  Full Name
                </label>
                <input
                  id="full_name"
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  className="profile-input"
                />
              </div>

              <div className="profile-field">
                <label htmlFor="headline" className="profile-label">
                  Headline
                </label>
                <input
                  id="headline"
                  type="text"
                  name="headline"
                  value={formData.headline}
                  onChange={handleChange}
                  className="profile-input"
                />
              </div>

              <div className="profile-field">
                <label htmlFor="location" className="profile-label">
                  Location
                </label>
                <input
                  id="location"
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  className="profile-input"
                />
              </div>

              <div className="profile-field">
                <label htmlFor="phone" className="profile-label">
                  Phone
                </label>
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="profile-input"
                />
              </div>
            </div>
          </section>

          <section className="profile-card" role="region" aria-labelledby="profile-summary-title">
            <div className="profile-card-header">
              <h2 id="profile-summary-title" className="profile-card-title">
                Professional Summary
              </h2>
            </div>

            <div className="profile-grid">
              <div className="profile-field">
                <label htmlFor="website" className="profile-label">
                  Website
                </label>
                <input
                  id="website"
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  className="profile-input"
                />
              </div>

              <div className="profile-field">
                <label htmlFor="linkedin_url" className="profile-label">
                  LinkedIn URL
                </label>
                <input
                  id="linkedin_url"
                  type="url"
                  name="linkedin_url"
                  value={formData.linkedin_url}
                  onChange={handleChange}
                  className="profile-input"
                />
              </div>

              <div className="profile-field profile-field--full">
                <label htmlFor="github_url" className="profile-label">
                  GitHub URL
                </label>
                <input
                  id="github_url"
                  type="url"
                  name="github_url"
                  value={formData.github_url}
                  onChange={handleChange}
                  className="profile-input"
                />
              </div>

              <div className="profile-field profile-field--full">
                <label htmlFor="summary" className="profile-label">
                  Summary
                </label>
                <textarea
                  id="summary"
                  name="summary"
                  value={formData.summary}
                  onChange={handleChange}
                  rows="6"
                  className="profile-textarea"
                />
                <div className="profile-char-count" aria-live="polite">
                  {summaryCount} characters
                </div>
              </div>
            </div>
          </section>

          <div className="profile-actions">
            {saveError && (
              <p className="profile-save-error" role="alert">
                {saveError}
              </p>
            )}
            {saveSuccess && !saveError && (
              <p className="profile-save-success" role="status">
                Profile saved successfully.
              </p>
            )}
            <button type="submit" disabled={saving} className="profile-btn-save">
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
