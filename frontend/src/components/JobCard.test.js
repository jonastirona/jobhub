import { render, screen } from '@testing-library/react';
import JobCard from './JobCard';

const baseJob = {
  id: 'job-1',
  title: 'Frontend Engineer',
  company: 'Acme Corp',
  status: 'applied',
  applied_date: '2026-03-15',
  updated_at: '2026-03-20T10:00:00+00:00',
};

test('renders job title', () => {
  render(<JobCard job={baseJob} />);
  expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
});

test('renders company name', () => {
  render(<JobCard job={baseJob} />);
  expect(screen.getByText('Acme Corp')).toBeInTheDocument();
});

test('renders applied status badge', () => {
  render(<JobCard job={baseJob} />);
  expect(screen.getByText('Applied')).toBeInTheDocument();
});

test('renders interviewing status badge', () => {
  render(<JobCard job={{ ...baseJob, status: 'interviewing' }} />);
  expect(screen.getByText('Interviewing')).toBeInTheDocument();
});

test('renders offered status badge', () => {
  render(<JobCard job={{ ...baseJob, status: 'offered' }} />);
  expect(screen.getByText('Offered')).toBeInTheDocument();
});

test('renders rejected status badge', () => {
  render(<JobCard job={{ ...baseJob, status: 'rejected' }} />);
  expect(screen.getByText('Rejected')).toBeInTheDocument();
});

test('unknown status renders the raw value as badge text', () => {
  render(<JobCard job={{ ...baseJob, status: 'custom_stage' }} />);
  expect(screen.getByText('custom_stage')).toBeInTheDocument();
});

test('unknown status uses safe fallback CSS class', () => {
  render(<JobCard job={{ ...baseJob, status: 'custom_stage' }} />);
  expect(screen.getByText('custom_stage')).toHaveClass('JobCard-badge--unknown');
});

test('badge has correct CSS class for status', () => {
  render(<JobCard job={baseJob} />);
  expect(screen.getByText('Applied')).toHaveClass('JobCard-badge--applied');
});

test('renders applied_date as activity date when present', () => {
  render(<JobCard job={baseJob} />);
  expect(screen.getByText(/Mar 15, 2026/i)).toBeInTheDocument();
});

test('falls back to updated_at when applied_date is null', () => {
  render(<JobCard job={{ ...baseJob, applied_date: null }} />);
  expect(screen.getByText(/Mar 20, 2026/i)).toBeInTheDocument();
});

test('renders no date when both applied_date and updated_at are null', () => {
  render(<JobCard job={{ ...baseJob, applied_date: null, updated_at: null }} />);
  expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
});

test('renders as an article element', () => {
  render(<JobCard job={baseJob} />);
  expect(screen.getByRole('article')).toBeInTheDocument();
});
