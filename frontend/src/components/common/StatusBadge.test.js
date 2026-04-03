import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';

test('renders known status label', () => {
  render(<StatusBadge status="applied" />);
  expect(screen.getByText('Applied')).toBeInTheDocument();
});

test('applies correct class for known status', () => {
  render(<StatusBadge status="applied" />);
  expect(screen.getByText('Applied')).toHaveClass('applied');
});

test('renders interviewing label', () => {
  render(<StatusBadge status="interviewing" />);
  expect(screen.getByText('Interviewing')).toBeInTheDocument();
});

test('renders offered label', () => {
  render(<StatusBadge status="offered" />);
  expect(screen.getByText('Offered')).toBeInTheDocument();
});

test('renders rejected label', () => {
  render(<StatusBadge status="rejected" />);
  expect(screen.getByText('Rejected')).toBeInTheDocument();
});

test('renders archived label', () => {
  render(<StatusBadge status="archived" />);
  expect(screen.getByText('Archived')).toBeInTheDocument();
});

test('unknown status renders raw status string', () => {
  render(<StatusBadge status="custom_stage" />);
  expect(screen.getByText('custom_stage')).toBeInTheDocument();
});

test('unknown status applies unknown class', () => {
  render(<StatusBadge status="custom_stage" />);
  expect(screen.getByText('custom_stage')).toHaveClass('unknown');
});

test('unknown status does not apply interested class', () => {
  render(<StatusBadge status="custom_stage" />);
  expect(screen.getByText('custom_stage')).not.toHaveClass('interested');
});
