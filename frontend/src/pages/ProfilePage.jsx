import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useEducation } from '../hooks/useEducation';
import { useProfile } from '../hooks/useProfile';
import { EMPTY_EDUCATION } from '../models/education';
import { EMPTY_PROFILE, REQUIRED_PROFILE_FIELDS } from '../models/profile';
import './ProfilePage.css';

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

function formatYearRange(startYear, endYear) {
  return endYear ? `${startYear} – ${endYear}` : `${startYear} – Present`;
}

export default function ProfilePage() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const { profile, loading, error, saving, saveError, saveProfile } = useProfile(accessToken);
  const {
    education,
    loading: educationLoading,
    error: educationError,
    saving: educationSaving,
    saveError: educationSaveError,
    addEducation,
    updateEducation,
    deleteEducation,
  } = useEducation(accessToken);

  const [formData, setFormData] = useState(EMPTY_PROFILE);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [educationForm, setEducationForm] = useState(EMPTY_EDUCATION);
  const [editingEducationId, setEditingEducationId] = useState(null);

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

  const _parseYear = (value) => {
    const n = parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(n) && Number.isInteger(n) ? n : null;
  };
  const _startYear = _parseYear(educationForm.start_year);
  const _endYear = _parseYear(educationForm.end_year);
  const _hasEndYear = String(educationForm.end_year ?? '').trim() !== '';
  const isEducationFormValid =
    educationForm.institution.trim() &&
    educationForm.degree.trim() &&
    educationForm.field_of_study.trim() &&
    _startYear !== null &&
    _startYear >= 1900 &&
    (!_hasEndYear || (_endYear !== null && _endYear >= _startYear));

  const handleEducationFormChange = (e) => {
    const { name, value } = e.target;
    setEducationForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEducationEdit = (entry) => {
    setEditingEducationId(entry.id);
    setEducationForm({
      institution: entry.institution || '',
      degree: entry.degree || '',
      field_of_study: entry.field_of_study || '',
      start_year: entry.start_year != null ? String(entry.start_year) : '',
      end_year: entry.end_year != null ? String(entry.end_year) : '',
      gpa: entry.gpa != null ? String(entry.gpa) : '',
      description: entry.description || '',
    });
  };

  const handleEducationCancelEdit = () => {
    setEditingEducationId(null);
    setEducationForm(EMPTY_EDUCATION);
  };

  const handleEducationSubmit = async (e) => {
    e.preventDefault();
    if (educationSaving || !isEducationFormValid) return;
    const payload = {
      institution: educationForm.institution.trim(),
      degree: educationForm.degree.trim(),
      field_of_study: educationForm.field_of_study.trim(),
      start_year: parseInt(educationForm.start_year, 10),
      end_year: educationForm.end_year ? parseInt(educationForm.end_year, 10) : null,
      gpa: educationForm.gpa ? parseFloat(educationForm.gpa) : null,
      description: educationForm.description.trim() || null,
    };
    const saved = editingEducationId
      ? await updateEducation(editingEducationId, payload)
      : await addEducation(payload);
    if (saved) {
      setEducationForm(EMPTY_EDUCATION);
      setEditingEducationId(null);
    }
  };

  const handleEducationDelete = async (id) => {
    if (editingEducationId === id) handleEducationCancelEdit();
    await deleteEducation(id);
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
        <section className="profile-card" role="region" aria-labelledby="profile-education-title">
          <div className="profile-card-header">
            <h2 id="profile-education-title" className="profile-card-title">
              Education
            </h2>
          </div>

          {educationLoading && <p className="profile-state">Loading education...</p>}

          {educationError && (
            <p className="profile-state profile-state--error" role="alert">
              {educationError}
            </p>
          )}

          {!educationLoading && (
            <>
              {education.length === 0 && !educationError && (
                <p className="education-empty">No education added yet.</p>
              )}

              {education.length > 0 && (
                <ul className="education-list" aria-label="Education list">
                  {education.map((entry) => (
                    <li key={entry.id} className="education-item">
                      <div className="education-item-info">
                        <span className="education-item-institution">{entry.institution}</span>
                        <span className="education-item-degree">
                          {entry.degree}, {entry.field_of_study}
                        </span>
                        <span className="education-item-years">
                          {formatYearRange(entry.start_year, entry.end_year)}
                        </span>
                        {entry.gpa != null && (
                          <span className="education-item-gpa">GPA: {entry.gpa}</span>
                        )}
                      </div>
                      <div className="education-item-actions">
                        <button
                          type="button"
                          className="education-btn education-btn--secondary"
                          onClick={() => handleEducationEdit(entry)}
                          aria-label={`Edit ${entry.institution}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="education-btn education-btn--danger"
                          onClick={() => handleEducationDelete(entry.id)}
                          disabled={educationSaving}
                          aria-label={`Delete ${entry.institution}`}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form className="education-form" onSubmit={handleEducationSubmit}>
                <div className="education-form-fields">
                  <div className="profile-field">
                    <label htmlFor="edu_institution" className="profile-label">
                      Institution
                    </label>
                    <input
                      id="edu_institution"
                      type="text"
                      name="institution"
                      value={educationForm.institution}
                      onChange={handleEducationFormChange}
                      className="profile-input"
                      placeholder="e.g. NJIT"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="edu_degree" className="profile-label">
                      Degree
                    </label>
                    <input
                      id="edu_degree"
                      type="text"
                      name="degree"
                      value={educationForm.degree}
                      onChange={handleEducationFormChange}
                      className="profile-input"
                      placeholder="e.g. Bachelor of Science"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="edu_field_of_study" className="profile-label">
                      Field of Study
                    </label>
                    <input
                      id="edu_field_of_study"
                      type="text"
                      name="field_of_study"
                      value={educationForm.field_of_study}
                      onChange={handleEducationFormChange}
                      className="profile-input"
                      placeholder="e.g. Computer Science"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="edu_start_year" className="profile-label">
                      Start Year
                    </label>
                    <input
                      id="edu_start_year"
                      type="number"
                      name="start_year"
                      value={educationForm.start_year}
                      onChange={handleEducationFormChange}
                      className="profile-input"
                      placeholder="e.g. 2020"
                      min="1900"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="edu_end_year" className="profile-label">
                      End Year
                    </label>
                    <input
                      id="edu_end_year"
                      type="number"
                      name="end_year"
                      value={educationForm.end_year}
                      onChange={handleEducationFormChange}
                      className="profile-input"
                      placeholder="Leave blank if current"
                      min="1900"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="edu_gpa" className="profile-label">
                      GPA
                    </label>
                    <input
                      id="edu_gpa"
                      type="number"
                      name="gpa"
                      value={educationForm.gpa}
                      onChange={handleEducationFormChange}
                      className="profile-input"
                      placeholder="e.g. 3.8"
                      step="0.01"
                      min="0"
                    />
                  </div>

                  <div className="profile-field profile-field--full">
                    <label htmlFor="edu_description" className="profile-label">
                      Description
                    </label>
                    <textarea
                      id="edu_description"
                      name="description"
                      value={educationForm.description}
                      onChange={handleEducationFormChange}
                      rows="3"
                      className="profile-textarea"
                      placeholder="Activities, honors, relevant coursework…"
                    />
                  </div>
                </div>

                <div className="profile-actions">
                  {educationSaveError && (
                    <p className="profile-save-error" role="alert">
                      {educationSaveError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={educationSaving || !isEducationFormValid}
                    className="profile-btn-save"
                  >
                    {educationSaving
                      ? 'Saving...'
                      : editingEducationId
                        ? 'Update Education'
                        : 'Add Education'}
                  </button>
                  {editingEducationId && (
                    <button
                      type="button"
                      className="education-btn education-btn--secondary"
                      onClick={handleEducationCancelEdit}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
