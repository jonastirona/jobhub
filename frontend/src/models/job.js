export const JOB_STATUSES = [
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
];

export const JOB_STATUS_ALIAS = { interview: 'interviewing', offer: 'offered' };

export const EMPTY_JOB = {
  title: '',
  company: '',
  location: '',
  status: 'applied',
  applied_date: '',
  deadline: '',
  description: '',
  notes: '',
  recruiter_notes: '',
};
