import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useCareerPreferences } from '../hooks/useCareerPreferences';
import { useEducation } from '../hooks/useEducation';
import { useExperience } from '../hooks/useExperience';
import { useProfile } from '../hooks/useProfile';
import { useSkills } from '../hooks/useSkills';
import {
  EMPTY_CAREER_PREFERENCES,
  PREFERRED_LOCATION_SUGGESTIONS,
  TARGET_ROLE_SUGGESTIONS,
  WORK_MODES,
} from '../models/career';
import { EMPTY_EDUCATION } from '../models/education';
import { EMPTY_EXPERIENCE } from '../models/experience';
import { EMPTY_PROFILE, REQUIRED_PROFILE_FIELDS } from '../models/profile';
import { EMPTY_SKILL, PROFICIENCY_LEVELS } from '../models/skill';
import './ProfilePage.css';

const SALARY_TEXT_STORAGE_KEY_PREFIX = 'jobhub:career-preferences:salary-text:';

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function toNullableString(value) {
  const trimmed = asText(value).trim();
  return trimmed === '' ? null : trimmed;
}

function parseNullableSalaryInt(value) {
  const trimmed = asText(value).trim();
  if (!trimmed) {
    return { value: null, isValid: true };
  }
  const normalized = trimmed.replace(/[$,\s]/g, '');
  if (!normalized || !/^\d+$/.test(normalized)) {
    return { value: null, isValid: false };
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed)
    ? { value: parsed, isValid: true }
    : { value: null, isValid: false };
}

function parseMultiValueList(value, { allowComma = true } = {}) {
  if (!value) return [];
  const seen = new Set();
  const separator = allowComma ? /[\n,;]+/ : /[\n;]+/;
  return asText(value)
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const normalized = item.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function addUniqueListItem(items, value) {
  const nextValue = asText(value).trim();
  if (!nextValue) return items;
  const exists = items.some((item) => item.toLowerCase() === nextValue.toLowerCase());
  if (exists) return items;
  return [...items, nextValue];
}

function removeListItem(items, value) {
  return items.filter((item) => item !== value);
}

function toNullableJoinedList(items) {
  return toNullableString(items.join('; '));
}

function createEmptyPreferencesFormState() {
  return {
    ...EMPTY_CAREER_PREFERENCES,
    target_roles: [],
    preferred_locations: [],
    target_roles_input: '',
    preferred_locations_input: '',
  };
}

function formatStoredSalaryText(value) {
  const trimmed = asText(value).trim();
  if (!trimmed) return '';
  return trimmed;
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

function validateUrl(value, label) {
  const trimmed = asText(value).trim();
  if (trimmed === '') return '';
  try {
    new URL(trimmed);
    return '';
  } catch {
    return `${label} must be a valid URL.`;
  }
}

function getIdentityFieldErrors(values) {
  return {
    full_name: asText(values.full_name).trim() ? '' : 'Full Name is required.',
    headline: asText(values.headline).trim() ? '' : 'Headline is required.',
    location: asText(values.location).trim() ? '' : 'Location is required.',
    phone: asText(values.phone).trim() ? '' : 'Phone is required.',
  };
}

function getSummaryFieldErrors(values) {
  return {
    website: validateUrl(values.website, 'Website'),
    linkedin_url: validateUrl(values.linkedin_url, 'LinkedIn URL'),
    github_url: validateUrl(values.github_url, 'GitHub URL'),
  };
}

function buildIdentityPayload(values) {
  return {
    full_name: toNullableString(values.full_name),
    headline: toNullableString(values.headline),
    location: toNullableString(values.location),
    phone: toNullableString(values.phone),
  };
}

function buildSummaryPayload(values) {
  return {
    website: toNullableString(values.website),
    linkedin_url: toNullableString(values.linkedin_url),
    github_url: toNullableString(values.github_url),
    summary: toNullableString(values.summary),
  };
}

const parseYear = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
};

function validateExperienceForm(form, startYear, endYear, hasEndYear) {
  if (!form.title.trim() || !form.company.trim())
    return { isValid: false, hint: 'Title and Company are required.' };
  if (startYear === null || startYear < 1900)
    return { isValid: false, hint: 'Enter a valid Start Year (e.g. 2021).' };
  if (hasEndYear && (endYear === null || endYear < startYear))
    return { isValid: false, hint: 'End Year must be on or after Start Year.' };
  return { isValid: true, hint: null };
}

function validateEducationForm(form, startYear, endYear, hasEndYear) {
  if (!form.institution.trim()) return { isValid: false, hint: 'Institution is required.' };
  if (!form.degree.trim()) return { isValid: false, hint: 'Degree is required.' };
  if (!form.field_of_study.trim()) return { isValid: false, hint: 'Field of Study is required.' };
  if (startYear === null || startYear < 1900)
    return { isValid: false, hint: 'Enter a valid Start Year (e.g. 2021).' };
  if (hasEndYear && (endYear === null || endYear < startYear))
    return { isValid: false, hint: 'End Year must be on or after Start Year.' };
  return { isValid: true, hint: null };
}

export default function ProfilePage() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const { profile, loading, error, saving, saveProfile } = useProfile(accessToken);
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
    education,
    loading: educationLoading,
    error: educationError,
    saving: educationSaving,
    saveError: educationSaveError,
    addEducation,
    updateEducation,
    deleteEducation,
  } = useEducation(accessToken);
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
  const {
    preferences,
    loading: prefsLoading,
    error: prefsError,
    saving: prefsSaving,
    saveError: prefsSaveError,
    savePreferences,
  } = useCareerPreferences(accessToken);

  const [formData, setFormData] = useState(EMPTY_PROFILE);
  const [identitySaveSuccess, setIdentitySaveSuccess] = useState(false);
  const [identitySaveError, setIdentitySaveError] = useState('');
  const [identityValidationAttempted, setIdentityValidationAttempted] = useState(false);
  const [summarySaveSuccess, setSummarySaveSuccess] = useState(false);
  const [summarySaveError, setSummarySaveError] = useState('');
  const [summaryValidationAttempted, setSummaryValidationAttempted] = useState(false);
  const [activeProfileSaveSection, setActiveProfileSaveSection] = useState(null);

  const [prefsData, setPrefsData] = useState(createEmptyPreferencesFormState);
  const [prefsSaveSuccess, setPrefsSaveSuccess] = useState(false);
  const [prefsValidationError, setPrefsValidationError] = useState('');

  const [experienceForm, setExperienceForm] = useState(EMPTY_EXPERIENCE);
  const [editingExperienceId, setEditingExperienceId] = useState(null);
  const [experienceSaveSuccess, setExperienceSaveSuccess] = useState(false);
  const [experienceValidationAttempted, setExperienceValidationAttempted] = useState(false);

  const [educationForm, setEducationForm] = useState(EMPTY_EDUCATION);
  const [editingEducationId, setEditingEducationId] = useState(null);
  const [educationSaveSuccess, setEducationSaveSuccess] = useState(false);
  const [educationValidationAttempted, setEducationValidationAttempted] = useState(false);

  const [skillForm, setSkillForm] = useState(EMPTY_SKILL);
  const [editingSkillId, setEditingSkillId] = useState(null);
  const [skillSaveSuccess, setSkillSaveSuccess] = useState(false);

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
      let persistedSalaryText = { min: '', max: '' };
      if (user?.id) {
        const storageKey = `${SALARY_TEXT_STORAGE_KEY_PREFIX}${user.id}`;
        try {
          const raw = window.localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            persistedSalaryText = {
              min: asText(parsed?.min),
              max: asText(parsed?.max),
            };
          }
        } catch {
          persistedSalaryText = { min: '', max: '' };
        }
      }

      const nextMinSalary =
        preferences.salary_min != null
          ? String(preferences.salary_min)
          : persistedSalaryText.min || '';
      const nextMaxSalary =
        preferences.salary_max != null
          ? String(preferences.salary_max)
          : persistedSalaryText.max || '';

      setPrefsData((prev) => ({
        ...EMPTY_CAREER_PREFERENCES,
        target_roles: parseMultiValueList(preferences.target_roles, { allowComma: true }),
        preferred_locations: parseMultiValueList(preferences.preferred_locations, {
          allowComma: false,
        }),
        target_roles_input: '',
        preferred_locations_input: '',
        work_mode: asText(preferences.work_mode),
        salary_min: nextMinSalary || prev.salary_min || '',
        salary_max: nextMaxSalary || prev.salary_max || '',
      }));
    }
  }, [preferences, user?.id]);

  const draftCompletion = useMemo(() => getCompletionState(formData), [formData]);
  const identityFieldErrors = useMemo(() => getIdentityFieldErrors(formData), [formData]);
  const summaryFieldErrors = useMemo(() => getSummaryFieldErrors(formData), [formData]);

  const hasIdentityValidationErrors = Object.values(identityFieldErrors).some(Boolean);
  const hasSummaryValidationErrors = Object.values(summaryFieldErrors).some(Boolean);

  const avatarInitials = useMemo(
    () => getInitials(formData.full_name, user?.email),
    [formData.full_name, user?.email]
  );

  const displayName = asText(formData.full_name).trim() || user?.email || 'User';
  const displayHeadline = asText(formData.headline).trim() || 'Add a headline';
  const summaryCount = asText(formData.summary).length;

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (['full_name', 'headline', 'location', 'phone'].includes(name)) {
      setIdentitySaveSuccess(false);
      setIdentitySaveError('');
    } else {
      setSummarySaveSuccess(false);
      setSummarySaveError('');
    }
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleIdentitySubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    setIdentityValidationAttempted(true);
    setIdentitySaveSuccess(false);
    setIdentitySaveError('');

    if (hasIdentityValidationErrors) return;

    setActiveProfileSaveSection('identity');
    try {
      const saved = await saveProfile(buildIdentityPayload(formData));
      if (saved.ok) {
        setIdentitySaveSuccess(true);
      } else if (saved.error == null) {
        return;
      } else {
        setIdentitySaveError(saved.error || 'Unable to save identity right now.');
      }
    } finally {
      setActiveProfileSaveSection(null);
    }
  };

  const handleSummarySubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    setSummaryValidationAttempted(true);
    setSummarySaveSuccess(false);
    setSummarySaveError('');

    if (hasSummaryValidationErrors) return;

    setActiveProfileSaveSection('summary');
    try {
      const saved = await saveProfile(buildSummaryPayload(formData));
      if (saved.ok) {
        setSummarySaveSuccess(true);
      } else if (saved.error == null) {
        return;
      } else {
        setSummarySaveError(saved.error || 'Unable to save summary right now.');
      }
    } finally {
      setActiveProfileSaveSection(null);
    }
  };

  const handlePrefsChange = (e) => {
    const { name, value } = e.target;
    setPrefsSaveSuccess(false);
    setPrefsValidationError('');
    setPrefsData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePrefsListInputChange = (field) => (e) => {
    const inputField = `${field}_input`;
    setPrefsSaveSuccess(false);
    setPrefsValidationError('');
    setPrefsData((prev) => ({ ...prev, [inputField]: e.target.value }));
  };

  const addPrefsListItem = (field, rawValue) => {
    const inputField = `${field}_input`;
    setPrefsSaveSuccess(false);
    setPrefsValidationError('');
    setPrefsData((prev) => {
      const list = prev[field];
      const nextList = addUniqueListItem(list, rawValue ?? prev[inputField]);
      return {
        ...prev,
        [field]: nextList,
        [inputField]: '',
      };
    });
  };

  const removePrefsListValue = (field, value) => {
    setPrefsSaveSuccess(false);
    setPrefsValidationError('');
    setPrefsData((prev) => ({
      ...prev,
      [field]: removeListItem(prev[field], value),
    }));
  };

  const handlePrefsListKeyDown = (field) => (e) => {
    const shouldAdd =
      e.key === 'Enter' || e.key === ';' || (field === 'target_roles' && e.key === ',');
    if (shouldAdd) {
      e.preventDefault();
      addPrefsListItem(field);
    }
  };

  const handlePrefsSubmit = async (e) => {
    e.preventDefault();
    if (prefsSaving) return;
    setPrefsSaveSuccess(false);
    setPrefsValidationError('');

    const finalizedTargetRoles = addUniqueListItem(
      prefsData.target_roles,
      prefsData.target_roles_input
    );
    const finalizedPreferredLocations = addUniqueListItem(
      prefsData.preferred_locations,
      prefsData.preferred_locations_input
    );

    if (
      finalizedTargetRoles.length !== prefsData.target_roles.length ||
      finalizedPreferredLocations.length !== prefsData.preferred_locations.length
    ) {
      setPrefsData((prev) => ({
        ...prev,
        target_roles: finalizedTargetRoles,
        preferred_locations: finalizedPreferredLocations,
        target_roles_input: '',
        preferred_locations_input: '',
      }));
    }

    const parsedSalaryMin = parseNullableSalaryInt(prefsData.salary_min);
    const parsedSalaryMax = parseNullableSalaryInt(prefsData.salary_max);
    if (!parsedSalaryMin.isValid || !parsedSalaryMax.isValid) {
      setPrefsValidationError(
        'Salary values must be whole numbers. You can include $ and commas (for example: $95,000).'
      );
      return;
    }

    const payload = {
      target_roles: toNullableJoinedList(finalizedTargetRoles),
      preferred_locations: toNullableJoinedList(finalizedPreferredLocations),
      work_mode: toNullableString(prefsData.work_mode),
      salary_min: parsedSalaryMin.value,
      salary_max: parsedSalaryMax.value,
    };
    const saved = await savePreferences(payload);
    if (saved) {
      setPrefsSaveSuccess(true);
      const minText = formatStoredSalaryText(prefsData.salary_min);
      const maxText = formatStoredSalaryText(prefsData.salary_max);

      if (user?.id) {
        const storageKey = `${SALARY_TEXT_STORAGE_KEY_PREFIX}${user.id}`;
        try {
          window.localStorage.setItem(storageKey, JSON.stringify({ min: minText, max: maxText }));
        } catch {
          // Ignore storage write failures; backend persistence still applies.
        }
      }
    }
  };

  const expStartYear = parseYear(experienceForm.start_year);
  const expEndYear = parseYear(experienceForm.end_year);
  const expHasEndYear = String(experienceForm.end_year ?? '').trim() !== '';
  const { isValid: isExperienceFormValid, hint: experienceValidationHint } = validateExperienceForm(
    experienceForm,
    expStartYear,
    expEndYear,
    expHasEndYear
  );

  const handleExperienceFormChange = (e) => {
    const { name, value } = e.target;
    setExperienceSaveSuccess(false);
    setExperienceValidationAttempted(true);
    setExperienceForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleExperienceEdit = (entry) => {
    setExperienceSaveSuccess(false);
    setExperienceValidationAttempted(false);
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
    setExperienceSaveSuccess(false);
    setExperienceValidationAttempted(false);
    setEditingExperienceId(null);
    setExperienceForm(EMPTY_EXPERIENCE);
  };

  const handleExperienceSubmit = async (e) => {
    e.preventDefault();
    setExperienceValidationAttempted(true);
    setExperienceSaveSuccess(false);
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
      setExperienceSaveSuccess(true);
      setExperienceValidationAttempted(false);
    }
  };

  const handleExperienceDelete = async (id) => {
    setExperienceSaveSuccess(false);
    setExperienceValidationAttempted(false);
    const deleted = await deleteExperience(id);
    if (deleted && editingExperienceId === id) handleExperienceCancelEdit();
  };

  const eduStartYear = parseYear(educationForm.start_year);
  const eduEndYear = parseYear(educationForm.end_year);
  const eduHasEndYear = String(educationForm.end_year ?? '').trim() !== '';
  const { isValid: isEducationFormValid, hint: educationValidationHint } = validateEducationForm(
    educationForm,
    eduStartYear,
    eduEndYear,
    eduHasEndYear
  );

  const handleEducationFormChange = (e) => {
    const { name, value } = e.target;
    setEducationSaveSuccess(false);
    setEducationValidationAttempted(true);
    setEducationForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEducationEdit = (entry) => {
    setEducationSaveSuccess(false);
    setEducationValidationAttempted(false);
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
    setEducationSaveSuccess(false);
    setEducationValidationAttempted(false);
    setEditingEducationId(null);
    setEducationForm(EMPTY_EDUCATION);
  };

  const handleEducationSubmit = async (e) => {
    e.preventDefault();
    setEducationValidationAttempted(true);
    setEducationSaveSuccess(false);
    if (educationSaving || !isEducationFormValid) return;
    const payload = {
      institution: educationForm.institution.trim(),
      degree: educationForm.degree.trim(),
      field_of_study: educationForm.field_of_study.trim(),
      start_year: parseYear(educationForm.start_year),
      end_year: eduHasEndYear ? parseYear(educationForm.end_year) : null,
      gpa: educationForm.gpa.trim() !== '' ? parseFloat(educationForm.gpa) : null,
      description: educationForm.description.trim() || null,
    };
    const saved = editingEducationId
      ? await updateEducation(editingEducationId, payload)
      : await addEducation(payload);
    if (saved) {
      setEducationForm(EMPTY_EDUCATION);
      setEditingEducationId(null);
      setEducationSaveSuccess(true);
      setEducationValidationAttempted(false);
    }
  };

  const handleEducationDelete = async (id) => {
    setEducationSaveSuccess(false);
    setEducationValidationAttempted(false);
    const deleted = await deleteEducation(id);
    if (deleted && editingEducationId === id) handleEducationCancelEdit();
  };

  const handleExperienceMoveUp = async (index) => {
    if (index === 0) return;
    setExperienceSaveSuccess(false);
    setExperienceValidationAttempted(false);
    const newOrder = [...experience];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    await reorderExperience(newOrder.map((e) => e.id));
  };

  const handleExperienceMoveDown = async (index) => {
    if (index === experience.length - 1) return;
    setExperienceSaveSuccess(false);
    setExperienceValidationAttempted(false);
    const newOrder = [...experience];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    await reorderExperience(newOrder.map((e) => e.id));
  };

  const handleSkillFormChange = (e) => {
    const { name, value } = e.target;
    setSkillSaveSuccess(false);
    setSkillForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSkillEdit = (skill) => {
    setSkillSaveSuccess(false);
    setEditingSkillId(skill.id);
    setSkillForm({
      name: skill.name || '',
      category: skill.category || '',
      proficiency: skill.proficiency || '',
    });
  };

  const handleSkillCancelEdit = () => {
    setSkillSaveSuccess(false);
    setEditingSkillId(null);
    setSkillForm(EMPTY_SKILL);
  };

  const handleSkillSubmit = async (e) => {
    e.preventDefault();
    setSkillSaveSuccess(false);
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
      setSkillSaveSuccess(true);
    }
  };

  const handleSkillDelete = async (id) => {
    setSkillSaveSuccess(false);
    const deleted = await deleteSkill(id);
    if (deleted && editingSkillId === id) handleSkillCancelEdit();
  };

  const handleSkillMoveUp = async (index) => {
    if (index === 0) return;
    setSkillSaveSuccess(false);
    const newOrder = [...skills];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    await reorderSkills(newOrder.map((s) => s.id));
  };

  const handleSkillMoveDown = async (index) => {
    if (index === skills.length - 1) return;
    setSkillSaveSuccess(false);
    const newOrder = [...skills];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    await reorderSkills(newOrder.map((s) => s.id));
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

        <div className="profile-form">
          <form className="profile-form" onSubmit={handleIdentitySubmit} noValidate>
            <section
              className="profile-card"
              role="region"
              aria-labelledby="profile-identity-title"
            >
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
                    className={`profile-input${
                      identityValidationAttempted && identityFieldErrors.full_name
                        ? ' profile-input--error'
                        : ''
                    }`}
                    aria-invalid={
                      identityValidationAttempted && identityFieldErrors.full_name
                        ? true
                        : undefined
                    }
                    aria-describedby={
                      identityValidationAttempted && identityFieldErrors.full_name
                        ? 'profile-full-name-error'
                        : undefined
                    }
                  />
                  {identityValidationAttempted && identityFieldErrors.full_name && (
                    <p id="profile-full-name-error" className="profile-field-error" role="alert">
                      {identityFieldErrors.full_name}
                    </p>
                  )}
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
                    className={`profile-input${
                      identityValidationAttempted && identityFieldErrors.headline
                        ? ' profile-input--error'
                        : ''
                    }`}
                    aria-invalid={
                      identityValidationAttempted && identityFieldErrors.headline ? true : undefined
                    }
                    aria-describedby={
                      identityValidationAttempted && identityFieldErrors.headline
                        ? 'profile-headline-error'
                        : undefined
                    }
                  />
                  {identityValidationAttempted && identityFieldErrors.headline && (
                    <p id="profile-headline-error" className="profile-field-error" role="alert">
                      {identityFieldErrors.headline}
                    </p>
                  )}
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
                    className={`profile-input${
                      identityValidationAttempted && identityFieldErrors.location
                        ? ' profile-input--error'
                        : ''
                    }`}
                    aria-invalid={
                      identityValidationAttempted && identityFieldErrors.location ? true : undefined
                    }
                    aria-describedby={
                      identityValidationAttempted && identityFieldErrors.location
                        ? 'profile-location-error'
                        : undefined
                    }
                  />
                  {identityValidationAttempted && identityFieldErrors.location && (
                    <p id="profile-location-error" className="profile-field-error" role="alert">
                      {identityFieldErrors.location}
                    </p>
                  )}
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
                    className={`profile-input${
                      identityValidationAttempted && identityFieldErrors.phone
                        ? ' profile-input--error'
                        : ''
                    }`}
                    aria-invalid={
                      identityValidationAttempted && identityFieldErrors.phone ? true : undefined
                    }
                    aria-describedby={
                      identityValidationAttempted && identityFieldErrors.phone
                        ? 'profile-phone-error'
                        : undefined
                    }
                  />
                  {identityValidationAttempted && identityFieldErrors.phone && (
                    <p id="profile-phone-error" className="profile-field-error" role="alert">
                      {identityFieldErrors.phone}
                    </p>
                  )}
                </div>
              </div>

              <div className="profile-actions profile-actions--section">
                {identityValidationAttempted && hasIdentityValidationErrors && (
                  <p className="profile-save-error" role="alert">
                    Complete the highlighted identity fields before saving.
                  </p>
                )}
                {identitySaveError && (
                  <p className="profile-save-error" role="alert">
                    {identitySaveError}
                  </p>
                )}
                {identitySaveSuccess && !identitySaveError && (
                  <p className="profile-save-success" role="status">
                    Identity saved successfully.
                  </p>
                )}
                <button type="submit" disabled={saving} className="profile-btn-save">
                  {saving && activeProfileSaveSection === 'identity'
                    ? 'Saving...'
                    : 'Save Identity'}
                </button>
              </div>
            </section>
          </form>

          <form className="profile-form" onSubmit={handleSummarySubmit} noValidate>
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
                    className={`profile-input${
                      summaryValidationAttempted && summaryFieldErrors.website
                        ? ' profile-input--error'
                        : ''
                    }`}
                    aria-invalid={
                      summaryValidationAttempted && summaryFieldErrors.website ? true : undefined
                    }
                    aria-describedby={
                      summaryValidationAttempted && summaryFieldErrors.website
                        ? 'profile-website-error'
                        : undefined
                    }
                  />
                  {summaryValidationAttempted && summaryFieldErrors.website && (
                    <p id="profile-website-error" className="profile-field-error" role="alert">
                      {summaryFieldErrors.website}
                    </p>
                  )}
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
                    className={`profile-input${
                      summaryValidationAttempted && summaryFieldErrors.linkedin_url
                        ? ' profile-input--error'
                        : ''
                    }`}
                    aria-invalid={
                      summaryValidationAttempted && summaryFieldErrors.linkedin_url
                        ? true
                        : undefined
                    }
                    aria-describedby={
                      summaryValidationAttempted && summaryFieldErrors.linkedin_url
                        ? 'profile-linkedin-url-error'
                        : undefined
                    }
                  />
                  {summaryValidationAttempted && summaryFieldErrors.linkedin_url && (
                    <p id="profile-linkedin-url-error" className="profile-field-error" role="alert">
                      {summaryFieldErrors.linkedin_url}
                    </p>
                  )}
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
                    className={`profile-input${
                      summaryValidationAttempted && summaryFieldErrors.github_url
                        ? ' profile-input--error'
                        : ''
                    }`}
                    aria-invalid={
                      summaryValidationAttempted && summaryFieldErrors.github_url ? true : undefined
                    }
                    aria-describedby={
                      summaryValidationAttempted && summaryFieldErrors.github_url
                        ? 'profile-github-url-error'
                        : undefined
                    }
                  />
                  {summaryValidationAttempted && summaryFieldErrors.github_url && (
                    <p id="profile-github-url-error" className="profile-field-error" role="alert">
                      {summaryFieldErrors.github_url}
                    </p>
                  )}
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

              <div className="profile-actions profile-actions--section">
                {summaryValidationAttempted && hasSummaryValidationErrors && (
                  <p className="profile-save-error" role="alert">
                    Fix the highlighted summary fields before saving.
                  </p>
                )}
                {summarySaveError && (
                  <p className="profile-save-error" role="alert">
                    {summarySaveError}
                  </p>
                )}
                {summarySaveSuccess && !summarySaveError && (
                  <p className="profile-save-success" role="status">
                    Summary saved successfully.
                  </p>
                )}
                <button type="submit" disabled={saving} className="profile-btn-save">
                  {saving && activeProfileSaveSection === 'summary' ? 'Saving...' : 'Save Summary'}
                </button>
              </div>
            </section>
          </form>
        </div>

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
                      type="text"
                      inputMode="numeric"
                      name="start_year"
                      value={experienceForm.start_year}
                      onChange={handleExperienceFormChange}
                      className="profile-input"
                      placeholder="e.g. 2020"
                      maxLength={4}
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="exp_end_year" className="profile-label">
                      End Year
                    </label>
                    <input
                      id="exp_end_year"
                      type="text"
                      inputMode="numeric"
                      name="end_year"
                      value={experienceForm.end_year}
                      onChange={handleExperienceFormChange}
                      className="profile-input"
                      placeholder="Leave blank if current"
                      maxLength={4}
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
                  {experienceSaveSuccess && !experienceSaveError && !experienceSaving && (
                    <p className="profile-save-success" role="status">
                      Experience saved.
                    </p>
                  )}
                  {experienceValidationAttempted &&
                    !isExperienceFormValid &&
                    experienceValidationHint && (
                      <p className="profile-validation-hint" role="note">
                        {experienceValidationHint}
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
                      type="text"
                      inputMode="numeric"
                      name="start_year"
                      value={educationForm.start_year}
                      onChange={handleEducationFormChange}
                      className="profile-input"
                      placeholder="e.g. 2020"
                      maxLength={4}
                    />
                  </div>

                  <div className="profile-field">
                    <label htmlFor="edu_end_year" className="profile-label">
                      End Year
                    </label>
                    <input
                      id="edu_end_year"
                      type="text"
                      inputMode="numeric"
                      name="end_year"
                      value={educationForm.end_year}
                      onChange={handleEducationFormChange}
                      className="profile-input"
                      placeholder="Leave blank if current"
                      maxLength={4}
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
                      max="9.99"
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
                  {educationSaveSuccess && !educationSaveError && !educationSaving && (
                    <p className="profile-save-success" role="status">
                      Education saved.
                    </p>
                  )}
                  {educationValidationAttempted &&
                    !isEducationFormValid &&
                    educationValidationHint && (
                      <p className="profile-validation-hint" role="note">
                        {educationValidationHint}
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
                  {skillSaveSuccess && !skillsSaveError && !skillsSaving && (
                    <p className="profile-save-success" role="status">
                      Skill saved.
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
                <label htmlFor="target_roles_input" className="profile-label">
                  Target Roles
                </label>
                <div className="profile-multi-input-row">
                  <input
                    id="target_roles_input"
                    type="text"
                    list="target-role-suggestions"
                    value={prefsData.target_roles_input}
                    onChange={handlePrefsListInputChange('target_roles')}
                    onKeyDown={handlePrefsListKeyDown('target_roles')}
                    className="profile-input"
                    placeholder="Type a role and press Enter or Add"
                  />
                  <button
                    type="button"
                    className="profile-chip-add-btn"
                    onClick={() => addPrefsListItem('target_roles')}
                    disabled={!prefsData.target_roles_input.trim()}
                  >
                    Add Role
                  </button>
                </div>
                <datalist id="target-role-suggestions">
                  {TARGET_ROLE_SUGGESTIONS.map((role) => (
                    <option key={role} value={role} />
                  ))}
                </datalist>

                {prefsData.target_roles.length > 0 ? (
                  <ul className="profile-chip-list" aria-label="Selected target roles">
                    {prefsData.target_roles.map((role) => (
                      <li key={role} className="profile-chip-item">
                        <span>{role}</span>
                        <button
                          type="button"
                          className="profile-chip-remove-btn"
                          onClick={() => removePrefsListValue('target_roles', role)}
                          aria-label={`Remove ${role}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="profile-chip-empty">No target roles added yet.</p>
                )}
              </div>

              <div className="profile-field profile-field--full">
                <label htmlFor="preferred_locations_input" className="profile-label">
                  Preferred Locations
                </label>
                <div className="profile-multi-input-row">
                  <input
                    id="preferred_locations_input"
                    type="text"
                    list="preferred-location-suggestions"
                    value={prefsData.preferred_locations_input}
                    onChange={handlePrefsListInputChange('preferred_locations')}
                    onKeyDown={handlePrefsListKeyDown('preferred_locations')}
                    className="profile-input"
                    placeholder="Type a location and press Enter or Add"
                  />
                  <button
                    type="button"
                    className="profile-chip-add-btn"
                    onClick={() => addPrefsListItem('preferred_locations')}
                    disabled={!prefsData.preferred_locations_input.trim()}
                  >
                    Add Location
                  </button>
                </div>
                <datalist id="preferred-location-suggestions">
                  {PREFERRED_LOCATION_SUGGESTIONS.map((location) => (
                    <option key={location} value={location} />
                  ))}
                </datalist>

                {prefsData.preferred_locations.length > 0 ? (
                  <ul className="profile-chip-list" aria-label="Selected preferred locations">
                    {prefsData.preferred_locations.map((location) => (
                      <li key={location} className="profile-chip-item">
                        <span>{location}</span>
                        <button
                          type="button"
                          className="profile-chip-remove-btn"
                          onClick={() => removePrefsListValue('preferred_locations', location)}
                          aria-label={`Remove ${location}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="profile-chip-empty">No preferred locations added yet.</p>
                )}
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
                  type="text"
                  name="salary_min"
                  value={prefsData.salary_min}
                  onChange={handlePrefsChange}
                  className="profile-input"
                  placeholder="e.g. 80000"
                />
              </div>

              <div className="profile-field">
                <label htmlFor="salary_max" className="profile-label">
                  Maximum Salary (USD / yr)
                </label>
                <input
                  id="salary_max"
                  type="text"
                  name="salary_max"
                  value={prefsData.salary_max}
                  onChange={handlePrefsChange}
                  className="profile-input"
                  placeholder="e.g. 120000"
                />
              </div>
            </div>

            <div className="profile-actions profile-actions--section">
              {prefsValidationError && (
                <p className="profile-save-error" role="alert">
                  {prefsValidationError}
                </p>
              )}
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
          </section>
        </form>
      </div>
    </AppShell>
  );
}
