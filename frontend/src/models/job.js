export const JOB_STATUSES = [
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'interested', label: 'Interested' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
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
