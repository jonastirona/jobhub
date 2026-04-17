import { jobMatchesSearchQuery, jobSearchFragments, parseJobDate } from './jobSearch';

const baseJob = {
  id: 'j1',
  title: 'Software Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  status: 'applied',
  applied_date: null,
  deadline: null,
  description: null,
  notes: null,
  recruiter_notes: null,
};

describe('parseJobDate', () => {
  test('parses YYYY-MM-DD prefix', () => {
    const d = parseJobDate('2026-04-10');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(10);
  });

  test('returns null for empty', () => {
    expect(parseJobDate(null)).toBeNull();
    expect(parseJobDate('')).toBeNull();
  });
});

describe('jobMatchesSearchQuery', () => {
  test('empty query matches everything', () => {
    expect(jobMatchesSearchQuery(baseJob, '')).toBe(true);
    expect(jobMatchesSearchQuery(baseJob, '   ')).toBe(true);
  });

  test('matches title and company', () => {
    expect(jobMatchesSearchQuery({ ...baseJob, title: 'Staff Engineer' }, 'staff')).toBe(true);
    expect(jobMatchesSearchQuery({ ...baseJob, company: 'DataCorp' }, 'datacorp')).toBe(true);
  });

  test('matches description and notes', () => {
    expect(
      jobMatchesSearchQuery({ ...baseJob, description: 'Kubernetes and Go services' }, 'kubernetes')
    ).toBe(true);
    expect(jobMatchesSearchQuery({ ...baseJob, notes: 'Phone screen Tuesday' }, 'tuesday')).toBe(
      true
    );
  });

  test('matches recruiter_notes and status', () => {
    expect(
      jobMatchesSearchQuery(
        { ...baseJob, recruiter_notes: 'Contact Jamie at jamie@x.com' },
        'jamie@x.com'
      )
    ).toBe(true);
    expect(jobMatchesSearchQuery({ ...baseJob, status: 'interviewing' }, 'interviewing')).toBe(
      true
    );
  });

  test('matches location', () => {
    expect(jobMatchesSearchQuery({ ...baseJob, location: 'San Francisco' }, 'francisco')).toBe(
      true
    );
  });

  test('matches full month name on deadline', () => {
    const job = { ...baseJob, deadline: '2026-04-15' };
    expect(jobMatchesSearchQuery(job, 'april')).toBe(true);
    expect(jobMatchesSearchQuery(job, 'march')).toBe(false);
  });

  test('matches abbreviated month via locale fragments', () => {
    const job = { ...baseJob, applied_date: '2026-04-15' };
    expect(jobMatchesSearchQuery(job, 'apr')).toBe(true);
  });

  test('matches year on either date field', () => {
    expect(jobMatchesSearchQuery({ ...baseJob, deadline: '2027-06-01' }, '2027')).toBe(true);
    expect(jobMatchesSearchQuery({ ...baseJob, applied_date: '2026-01-01' }, '2027')).toBe(false);
  });

  test('matches ISO date substring', () => {
    const job = { ...baseJob, applied_date: '2026-03-15' };
    expect(jobMatchesSearchQuery(job, '2026-03-15')).toBe(true);
  });

  test('matches day-of-month token', () => {
    const job = { ...baseJob, applied_date: '2026-05-14' };
    expect(jobMatchesSearchQuery(job, '14')).toBe(true);
    expect(jobMatchesSearchQuery(job, '15')).toBe(false);
  });

  test('matches locale-style formatted date substring', () => {
    const job = { ...baseJob, deadline: '2026-07-04' };
    expect(jobMatchesSearchQuery(job, 'jul 4')).toBe(true);
  });

  test('no false positive when nothing matches', () => {
    expect(jobMatchesSearchQuery(baseJob, 'zzzznotfound')).toBe(false);
  });
});

describe('jobSearchFragments', () => {
  test('includes text and date-derived tokens', () => {
    const frags = jobSearchFragments({
      ...baseJob,
      title: 'Dev',
      deadline: '2026-04-10',
    });
    const joined = frags.join('|');
    expect(joined).toContain('dev');
    expect(joined).toContain('2026-04-10');
    expect(joined).toContain('april');
  });
});
