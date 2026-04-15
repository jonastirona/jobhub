import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../hooks/useProfile';
import { useSkills } from '../hooks/useSkills';
import { EMPTY_PROFILE, REQUIRED_PROFILE_FIELDS } from '../models/profile';
import { EMPTY_SKILL, PROFICIENCY_LEVELS } from '../models/skill';
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

export default function ProfilePage() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const { profile, loading, error, saving, saveError, saveProfile } = useProfile(accessToken);
  const {
    skills,
    loading: skillsLoading,
    error: skillsError,
    saving: skillsSaving,
    saveError: skillsSaveError,
    addSkill,
    updateSkill,
    deleteSkill,
    reorderSkills,
  } = useSkills(accessToken);

  const [formData, setFormData] = useState(EMPTY_PROFILE);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [skillForm, setSkillForm] = useState(EMPTY_SKILL);
  const [editingSkillId, setEditingSkillId] = useState(null);

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

  const handleSkillFormChange = (e) => {
    const { name, value } = e.target;
    setSkillForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSkillEdit = (skill) => {
    setEditingSkillId(skill.id);
    setSkillForm({
      name: skill.name || '',
      category: skill.category || '',
      proficiency: skill.proficiency || '',
    });
  };

  const handleSkillCancelEdit = () => {
    setEditingSkillId(null);
    setSkillForm(EMPTY_SKILL);
  };

  const handleSkillSubmit = async (e) => {
    e.preventDefault();
    if (skillsSaving || !skillForm.name.trim()) return;
    const payload = {
      name: skillForm.name.trim(),
      category: skillForm.category.trim() || null,
      proficiency: skillForm.proficiency || null,
    };
    const saved = editingSkillId
      ? await updateSkill(editingSkillId, payload)
      : await addSkill(payload);
    if (saved) {
      setSkillForm(EMPTY_SKILL);
      setEditingSkillId(null);
    }
  };

  const handleSkillDelete = async (id) => {
    if (editingSkillId === id) handleSkillCancelEdit();
    await deleteSkill(id);
  };

  const handleSkillMoveUp = async (index) => {
    if (index === 0) return;
    const newOrder = [...skills];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    await reorderSkills(newOrder.map((s) => s.id));
  };

  const handleSkillMoveDown = async (index) => {
    if (index === skills.length - 1) return;
    const newOrder = [...skills];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    await reorderSkills(newOrder.map((s) => s.id));
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

        <section className="profile-card" role="region" aria-labelledby="profile-skills-title">
          <div className="profile-card-header">
            <h2 id="profile-skills-title" className="profile-card-title">
              Skills
            </h2>
          </div>

          {skillsLoading && <p className="profile-state">Loading skills...</p>}

          {skillsError && (
            <p className="profile-state profile-state--error" role="alert">
              {skillsError}
            </p>
          )}

          {!skillsLoading && (
            <>
              {skills.length === 0 && !skillsError && (
                <p className="skills-empty">No skills added yet.</p>
              )}

              {skills.length > 0 && (
                <ul className="skills-list" aria-label="Skills list">
                  {skills.map((skill, index) => (
                    <li key={skill.id} className="skills-item">
                      <div className="skills-item-info">
                        <span className="skills-item-name">{skill.name}</span>
                        {skill.category && (
                          <span className="skills-item-category">{skill.category}</span>
                        )}
                        {skill.proficiency && (
                          <span
                            className={`skills-proficiency-badge skills-proficiency-badge--${skill.proficiency}`}
                          >
                            {skill.proficiency}
                          </span>
                        )}
                      </div>
                      <div className="skills-item-actions">
                        <button
                          type="button"
                          className="skills-btn skills-btn--icon"
                          onClick={() => handleSkillMoveUp(index)}
                          disabled={index === 0 || skillsSaving}
                          aria-label={`Move ${skill.name} up`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="skills-btn skills-btn--icon"
                          onClick={() => handleSkillMoveDown(index)}
                          disabled={index === skills.length - 1 || skillsSaving}
                          aria-label={`Move ${skill.name} down`}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="skills-btn skills-btn--secondary"
                          onClick={() => handleSkillEdit(skill)}
                          aria-label={`Edit ${skill.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="skills-btn skills-btn--danger"
                          onClick={() => handleSkillDelete(skill.id)}
                          disabled={skillsSaving}
                          aria-label={`Delete ${skill.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form className="skills-form" onSubmit={handleSkillSubmit}>
                <div className="skills-form-fields">
                  <div className="profile-field">
                    <label htmlFor="skill_name" className="profile-label">
                      Skill name
                    </label>
                    <input
                      id="skill_name"
                      type="text"
                      name="name"
                      value={skillForm.name}
                      onChange={handleSkillFormChange}
                      className="profile-input"
                      placeholder="e.g. React"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="skill_category" className="profile-label">
                      Category
                    </label>
                    <input
                      id="skill_category"
                      type="text"
                      name="category"
                      value={skillForm.category}
                      onChange={handleSkillFormChange}
                      className="profile-input"
                      placeholder="e.g. Frontend"
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="skill_proficiency" className="profile-label">
                      Proficiency
                    </label>
                    <select
                      id="skill_proficiency"
                      name="proficiency"
                      value={skillForm.proficiency}
                      onChange={handleSkillFormChange}
                      className="profile-select"
                    >
                      {PROFICIENCY_LEVELS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="profile-actions">
                  {skillsSaveError && (
                    <p className="profile-save-error" role="alert">
                      {skillsSaveError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={skillsSaving || !skillForm.name.trim()}
                    className="profile-btn-save"
                  >
                    {skillsSaving ? 'Saving...' : editingSkillId ? 'Update Skill' : 'Add Skill'}
                  </button>
                  {editingSkillId && (
                    <button
                      type="button"
                      className="skills-btn skills-btn--secondary"
                      onClick={handleSkillCancelEdit}
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
