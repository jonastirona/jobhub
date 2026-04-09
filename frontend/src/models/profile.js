export const PROFILE_FIELDS = [
  { key: 'full_name', label: 'Full Name', type: 'text' },
  { key: 'headline', label: 'Headline', type: 'text' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'linkedin_url', label: 'LinkedIn URL', type: 'url' },
  { key: 'github_url', label: 'GitHub URL', type: 'url' },
  { key: 'summary', label: 'Summary', type: 'textarea' },
];

export const REQUIRED_PROFILE_FIELDS = PROFILE_FIELDS.filter(({ key }) =>
  ['full_name', 'headline', 'location', 'phone', 'website', 'linkedin_url'].includes(key)
);

export const EMPTY_PROFILE = {
  full_name: '',
  headline: '',
  location: '',
  phone: '',
  website: '',
  linkedin_url: '',
  github_url: '',
  summary: '',
};
