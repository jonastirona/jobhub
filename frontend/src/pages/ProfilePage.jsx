import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useCareerPreferences } from '../hooks/useCareerPreferences';
import { useExperience } from '../hooks/useExperience';
import { useProfile } from '../hooks/useProfile';
import { EMPTY_CAREER_PREFERENCES, WORK_MODES } from '../models/career';
import { EMPTY_EXPERIENCE } from '../models/experience';
import { EMPTY_PROFILE, REQUIRED_PROFILE_FIELDS } from '../models/profile';
import './ProfilePage.css';

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function toNullableString(value) {
  const trimmed = asText(value).trim();
  return trimmed === '' ? null : trimmed;
}

function toNullableInt(value) {
  const trimmed = asText(value).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : null;
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

function formatYearRange(startYear, endYear) {
  if (endYear == null) return `${startYear} – Present`;
  return `${startYear} – ${endYear}`;
}

const parseYear = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
};

export default function ProfilePage() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const { profile, loading, error, saving, saveError, saveProfile } = useProfile(accessToken);
  const {
    experience,
    loading: experienceLoading,
    error: experienceError,
    saving: experienceSaving,
    saveError: experienceSaveError,
    addExperience,
    updateExperience,
    deleteExperience,
    reorderExperience,
  } = useExperience(accessToken);
  const {
    preferences,
    loading: prefsLoading,
    error: prefsError,
    saving: prefsSaving,
    saveError: prefsSaveError,
    savePreferences,
  } = useCareerPreferences(accessToken);

  const [formData, setFormData] = useState(EMPTY_PROFILE);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [prefsData, setPrefsData] = useState(EMPTY_CAREER_PREFERENCES);
  const [prefsSaveSuccess, setPrefsSaveSuccess] = useState(false);

  const [experienceForm, setExperienceForm] = useState(EMPTY_EXPERIENCE);
  const [editingExperienceId, setEditingExperienceId] = useState(null);

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

  useEffect(() => {
    if (preferences) {
      setPrefsData({
        target_roles: asText(preferences.target_roles),
        preferred_locations: asText(preferences.preferred_locations),
        work_mode: asText(preferences.work_mode),
        salary_min: preferences.salary_min != null ? String(preferences.salary_min) : '',
        salary_max: preferences.salary_max != null ? String(preferences.salary_max) : '',
      });
    }
  }, [preferences]);

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

  const handlePrefsChange = (e) => {
    const { name, value } = e.target;
    setPrefsSaveSuccess(false);
    setPrefsData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePrefsSubmit = async (e) => {
    e.preventDefault();
    if (prefsSaving) return;
    setPrefsSaveSuccess(false);
    const payload = {
      target_roles: toNullableString(prefsData.target_roles),
      preferred_locations: toNullableString(prefsData.preferred_locations),
      work_mode: toNullableString(prefsData.work_mode),
      salary_min: toNullableInt(prefsData.salary_min),
      salary_max: toNullableInt(prefsData.salary_max),
    };
    const saved = await savePreferences(payload);
    if (saved) setPrefsSaveSuccess(true);
  };

  const expStartYear = parseYear(experienceForm.start_year);
  const expEndYear = parseYear(experienceForm.end_year);
  const expHasEndYear = String(experienceForm.end_year ?? '').trim() !== '';
  const isExperienceFormValid =
    experienceForm.title.trim().length > 0 &&
    experienceForm.company.trim().length > 0 &&
    expStartYear !== null &&
    expStartYear >= 1900 &&
    (!expHasEndYear || (expEndYear !== null && expEndYear >= expStartYear));

  const handleExperienceFormChange = (e) => {
    const { name, value } = e.target;
    setExperienceForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleExperienceEdit = (entry) => {
    setEditingExperienceId(entry.id);
    setExperienceForm({
      title: entry.title || '',
      company: entry.company || '',
      location: entry.location || '',
      start_year: entry.start_year != null ? String(entry.start_year) : '',
      end_year: entry.end_year != null ? String(entry.end_year) : '',
      description: entry.description || '',
    });
  };

  const handleExperienceCancelEdit = () => {
    setEditingExperienceId(null);
    setExperienceForm(EMPTY_EXPERIENCE);
  };

  const handleExperienceSubmit = async (e) => {
    e.preventDefault();
    if (experienceSaving || !isExperienceFormValid) return;
    const payload = {
      title: experienceForm.title.trim(),
      company: experienceForm.company.trim(),
      location: experienceForm.location.trim() || null,
      start_year: parseYear(experienceForm.start_year),
      end_year: expHasEndYear ? parseYear(experienceForm.end_year) : null,
      description: experienceForm.description.trim() || null,
    };
    const saved = editingExperienceId
      ? await updateExperience(editingExperienceId, payload)
      : await addExperience(payload);
    if (saved) {
      setExperienceForm(EMPTY_EXPERIENCE);
      setEditingExperienceId(null);
    }
  };

  const handleExperienceDelete = async (id) => {
    if (editingExperienceId === id) handleExperienceCancelEdit();
    await deleteExperience(id);
  };

  const handleExperienceMoveUp = async (index) => {
    if (index === 0) return;
    const newOrder = [...experience];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    await reorderExperience(newOrder.map((e) => e.id));
  };

  const handleExperienceMoveDown = async (index) => {
    if (index === experience.length - 1) return;
    const newOrder = [...experience];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    await reorderExperience(newOrder.map((e) => e.id));
  };

  if (loading || prefsLoading) {
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

        <section className="profile-card" role="region" aria-labelledby="profile-experience-title">
          <div className="profile-card-header">
            <h2 id="profile-experience-title" className="profile-card-title">
              Experience
            </h2>
          </div>

          {experienceLoading && <p className="profile-state">Loading experience...</p>}

          {experienceError && (
            <p className="profile-state profile-state--error" role="alert">
              {experienceError}
            </p>
          )}

          {!experienceLoading && (
            <>
              {experience.length === 0 && !experienceError && (
                <p className="experience-empty">No experience added yet.</p>
              )}

              {experience.length > 0 && (
                <ul className="experience-list" aria-label="Experience list">
                  {experience.map((entry, index) => (
                    <li key={entry.id} className="experience-item">
                      <div className="experience-item-info">
                        <span className="experience-item-title">{entry.title}</span>
                        <span className="experience-item-company">{entry.company}</span>
                        {entry.location && (
                          <span className="experience-item-location">{entry.location}</span>
                        )}
                        <span className="experience-item-years">
                          {formatYearRange(entry.start_year, entry.end_year)}
                        </span>
                      </div>
                      <div className="experience-item-actions">
                        <button
                          type="button"
                          className="experience-btn experience-btn--icon"
                          onClick={() => handleExperienceMoveUp(index)}
                          disabled={index === 0 || experienceSaving}
                          aria-label={`Move ${entry.title} up`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="experience-btn experience-btn--icon"
                          onClick={() => handleExperienceMoveDown(index)}
                          disabled={index === experience.length - 1 || experienceSaving}
                          aria-label={`Move ${entry.title} down`}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="experience-btn experience-btn--secondary"
                          onClick={() => handleExperienceEdit(entry)}
                          aria-label={`Edit ${entry.title}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="experience-btn experience-btn--danger"
                          onClick={() => handleExperienceDelete(entry.id)}
                          disabled={experienceSaving}
                          aria-label={`Delete ${entry.title}`}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form className="experience-form" onSubmit={handleExperienceSubmit}>
                <div className="experience-form-fields">
                  <div className="profile-field">
                    <label htmlFor="exp_title" className="profile-label">
                      Title
                    </label>
                    <input
                      id="exp_title"
                      type="text"
                      name="title"
                      value={experienceForm.title}
                      onChange={handleExperienceFormChange}
                      className="profile-input"
                      placeholder="e.g. Software Engineer"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="exp_company" className="profile-label">
                      Company
                    </label>
                    <input
                      id="exp_company"
                      type="text"
                      name="company"
                      value={experienceForm.company}
                      onChange={handleExperienceFormChange}
                      className="profile-input"
                      placeholder="e.g. Acme Corp"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="exp_location" className="profile-label">
                      City / State
                    </label>
                    <input
                      id="exp_location"
                      type="text"
                      name="location"
                      value={experienceForm.location}
                      onChange={handleExperienceFormChange}
                      className="profile-input"
                      placeholder="e.g. New York, NY"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="exp_start_year" className="profile-label">
                      Start Year
                    </label>
                    <input
                      id="exp_start_year"
                      type="number"
                      name="start_year"
                      value={experienceForm.start_year}
                      onChange={handleExperienceFormChange}
                      className="profile-input"
                      placeholder="e.g. 2020"
                      min="1900"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="exp_end_year" className="profile-label">
                      End Year
                    </label>
                    <input
                      id="exp_end_year"
                      type="number"
                      name="end_year"
                      value={experienceForm.end_year}
                      onChange={handleExperienceFormChange}
                      className="profile-input"
                      placeholder="Leave blank if current"
                      min="1900"
                    />
                  </div>

                  <div className="profile-field profile-field--full">
                    <label htmlFor="exp_description" className="profile-label">
                      Description
                    </label>
                    <textarea
                      id="exp_description"
                      name="description"
                      value={experienceForm.description}
                      onChange={handleExperienceFormChange}
                      rows="3"
                      className="profile-textarea"
                      placeholder="Key responsibilities and achievements…"
                    />
                  </div>
                </div>

                <div className="profile-actions">
                  {experienceSaveError && (
                    <p className="profile-save-error" role="alert">
                      {experienceSaveError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={experienceSaving || !isExperienceFormValid}
                    className="profile-btn-save"
                  >
                    {experienceSaving
                      ? 'Saving...'
                      : editingExperienceId
                        ? 'Update Experience'
                        : 'Add Experience'}
                  </button>
                  {editingExperienceId && (
                    <button
                      type="button"
                      className="experience-btn experience-btn--secondary"
                      onClick={handleExperienceCancelEdit}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </section>

        <form
          className="profile-form"
          onSubmit={handlePrefsSubmit}
          aria-label="Career preferences form"
        >
          <section
            className="profile-card"
            role="region"
            aria-labelledby="profile-career-prefs-title"
          >
            <div className="profile-card-header">
              <h2 id="profile-career-prefs-title" className="profile-card-title">
                Career Preferences
              </h2>
            </div>

            {prefsError && (
              <p className="profile-state profile-state--error" role="alert">
                {prefsError}
              </p>
            )}

            <div className="profile-grid">
              <div className="profile-field profile-field--full">
                <label htmlFor="target_roles" className="profile-label">
                  Target Roles
                </label>
                <input
                  id="target_roles"
                  type="text"
                  name="target_roles"
                  value={prefsData.target_roles}
                  onChange={handlePrefsChange}
                  className="profile-input"
                  placeholder="e.g. Software Engineer, Frontend Developer"
                />
              </div>

              <div className="profile-field profile-field--full">
                <label htmlFor="preferred_locations" className="profile-label">
                  Preferred Locations
                </label>
                <input
                  id="preferred_locations"
                  type="text"
                  name="preferred_locations"
                  value={prefsData.preferred_locations}
                  onChange={handlePrefsChange}
                  className="profile-input"
                  placeholder="e.g. New York, NY; Remote"
                />
              </div>

              <div className="profile-field">
                <label htmlFor="work_mode" className="profile-label">
                  Work Mode
                </label>
                <select
                  id="work_mode"
                  name="work_mode"
                  value={prefsData.work_mode}
                  onChange={handlePrefsChange}
                  className="profile-select"
                >
                  {WORK_MODES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="profile-field" />

              <div className="profile-field">
                <label htmlFor="salary_min" className="profile-label">
                  Minimum Salary (USD / yr)
                </label>
                <input
                  id="salary_min"
                  type="number"
                  name="salary_min"
                  value={prefsData.salary_min}
                  onChange={handlePrefsChange}
                  className="profile-input"
                  placeholder="e.g. 80000"
                  min="0"
                  step="1"
                />
              </div>

              <div className="profile-field">
                <label htmlFor="salary_max" className="profile-label">
                  Maximum Salary (USD / yr)
                </label>
                <input
                  id="salary_max"
                  type="number"
                  name="salary_max"
                  value={prefsData.salary_max}
                  onChange={handlePrefsChange}
                  className="profile-input"
                  placeholder="e.g. 120000"
                  min="0"
                  step="1"
                />
              </div>
            </div>
          </section>

          <div className="profile-actions">
            {prefsSaveError && (
              <p className="profile-save-error" role="alert">
                {prefsSaveError}
              </p>
            )}
            {prefsSaveSuccess && !prefsSaveError && (
              <p className="profile-save-success" role="status">
                Career preferences saved successfully.
              </p>
            )}
            <button type="submit" disabled={prefsSaving} className="profile-btn-save">
              {prefsSaving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
