export const WORK_MODES = [
  { value: '', label: 'No preference' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
  { value: 'any', label: 'Any' },
];

export const TARGET_ROLE_SUGGESTIONS = [
  'Software Engineer',
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'Data Analyst',
  'Data Scientist',
  'Machine Learning Engineer',
  'DevOps Engineer',
  'Product Manager',
  'UX Designer',
];

export const PREFERRED_LOCATION_SUGGESTIONS = [
  'Remote',
  'Hybrid',
  'New York, NY',
  'Jersey City, NJ',
  'Newark, NJ',
  'San Francisco, CA',
  'Seattle, WA',
  'Austin, TX',
  'Boston, MA',
  'Chicago, IL',
];

export const EMPTY_CAREER_PREFERENCES = {
  target_roles: '',
  preferred_locations: '',
  work_mode: '',
  salary_min: '',
  salary_max: '',
};
