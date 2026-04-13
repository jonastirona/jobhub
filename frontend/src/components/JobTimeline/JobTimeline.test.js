import { fireEvent, render, screen } from '@testing-library/react';
import JobTimeline, { buildTimelineEvents } from './JobTimeline';

const baseJob = {
  id: 'job-1',
  title: 'Software Engineer',
  company: 'Acme Corp',
  location: 'New York, NY',
  status: 'applied',
  applied_date: '2026-03-15',
  description: 'Build great products.',
  notes: '',
  created_at: '2026-03-10T12:00:00Z',
  updated_at: '2026-03-15T09:00:00Z',
};

const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── buildTimelineEvents ──────────────────────────────────────────────────────

describe('buildTimelineEvents', () => {
  test('always includes tracked event', () => {
    const events = buildTimelineEvents(baseJob);
    expect(events.some((e) => e.id === 'tracked')).toBe(true);
  });

  test('includes applied event when applied_date is set', () => {
    const events = buildTimelineEvents(baseJob);
    expect(events.some((e) => e.id === 'applied')).toBe(true);
  });

  test('does not include applied event when applied_date is missing', () => {
    const events = buildTimelineEvents({ ...baseJob, applied_date: null });
    expect(events.some((e) => e.id === 'applied')).toBe(false);
  });

  test('includes interviewing milestone for interviewing status', () => {
    const events = buildTimelineEvents({ ...baseJob, status: 'interviewing' });
    expect(events.some((e) => e.id === 'status-interviewing')).toBe(true);
  });

  test('includes offer milestone for offered status', () => {
    const events = buildTimelineEvents({ ...baseJob, status: 'offered' });
    expect(events.some((e) => e.id === 'status-offered')).toBe(true);
  });

  test('includes rejected milestone for rejected status', () => {
    const events = buildTimelineEvents({ ...baseJob, status: 'rejected' });
    expect(events.some((e) => e.id === 'status-rejected')).toBe(true);
  });

  test('includes archived milestone for archived status', () => {
    const events = buildTimelineEvents({ ...baseJob, status: 'archived' });
    expect(events.some((e) => e.id === 'status-archived')).toBe(true);
  });

  test('does not include status milestone for applied status', () => {
    const events = buildTimelineEvents({ ...baseJob, status: 'applied' });
    expect(events.some((e) => e.id?.startsWith('status-'))).toBe(false);
  });

  test('includes notes event when notes are non-empty', () => {
    const events = buildTimelineEvents({ ...baseJob, notes: 'Follow up Monday.' });
    expect(events.some((e) => e.id === 'notes')).toBe(true);
  });

  test('does not include notes event when notes are empty', () => {
    const events = buildTimelineEvents({ ...baseJob, notes: '' });
    expect(events.some((e) => e.id === 'notes')).toBe(false);
  });

  test('does not include notes event when notes is null', () => {
    const events = buildTimelineEvents({ ...baseJob, notes: null });
    expect(events.some((e) => e.id === 'notes')).toBe(false);
  });

  test('truncates long notes to 80 chars with ellipsis', () => {
    const longNote = 'a'.repeat(100);
    const events = buildTimelineEvents({ ...baseJob, notes: longNote });
    const noteEvent = events.find((e) => e.id === 'notes');
    expect(noteEvent.detail.length).toBeLessThanOrEqual(82); // 80 + ellipsis char
    expect(noteEvent.detail).toContain('…');
  });

  test('tracked event detail mentions job title and company', () => {
    const events = buildTimelineEvents(baseJob);
    const tracked = events.find((e) => e.id === 'tracked');
    expect(tracked.detail).toContain('Software Engineer');
    expect(tracked.detail).toContain('Acme Corp');
  });
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering', () => {
  test('renders dialog with correct aria attributes', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'jt-title');
  });

  test('renders title and subtitle', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
    expect(screen.getByText(/Software Engineer — Acme Corp/)).toBeInTheDocument();
  });

  test('renders location when present', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    expect(screen.getByText('New York, NY')).toBeInTheDocument();
  });

  test('does not render location when absent', () => {
    render(<JobTimeline job={{ ...baseJob, location: '' }} onClose={onClose} />);
    expect(screen.queryByText('New York, NY')).not.toBeInTheDocument();
  });

  test('renders timeline list with accessible label', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    expect(screen.getByRole('list', { name: /application timeline/i })).toBeInTheDocument();
  });

  test('renders Application Tracked event', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    expect(screen.getByText('Application Tracked')).toBeInTheDocument();
  });

  test('renders Applied event when applied_date present', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    expect(screen.getByText('Applied')).toBeInTheDocument();
  });

  test('does not render Applied event when applied_date missing', () => {
    render(<JobTimeline job={{ ...baseJob, applied_date: null }} onClose={onClose} />);
    expect(screen.queryByText('Applied')).not.toBeInTheDocument();
  });

  test('renders Interview Scheduled for interviewing status', () => {
    render(<JobTimeline job={{ ...baseJob, status: 'interviewing' }} onClose={onClose} />);
    expect(screen.getByText('Interview Scheduled')).toBeInTheDocument();
  });

  test('renders Offer Received for offered status', () => {
    render(<JobTimeline job={{ ...baseJob, status: 'offered' }} onClose={onClose} />);
    expect(screen.getByText('Offer Received')).toBeInTheDocument();
  });

  test('renders Application Rejected for rejected status', () => {
    render(<JobTimeline job={{ ...baseJob, status: 'rejected' }} onClose={onClose} />);
    expect(screen.getByText('Application Rejected')).toBeInTheDocument();
  });

  test('renders notes event detail text', () => {
    render(
      <JobTimeline job={{ ...baseJob, notes: 'Call recruiter Monday.' }} onClose={onClose} />
    );
    expect(screen.getByText('Call recruiter Monday.')).toBeInTheDocument();
  });

  test('renders Notes label when notes are present', () => {
    render(
      <JobTimeline job={{ ...baseJob, notes: 'Some note.' }} onClose={onClose} />
    );
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  test('renders close button with accessible label', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    expect(screen.getByRole('button', { name: /close timeline/i })).toBeInTheDocument();
  });
});

// ─── Interactions ─────────────────────────────────────────────────────────────

describe('interactions', () => {
  test('calls onClose when close button clicked', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close timeline/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when Escape key pressed', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when overlay background clicked', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    const overlay = document.querySelector('.jt-overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not call onClose when modal content clicked', () => {
    render(<JobTimeline job={baseJob} onClose={onClose} />);
    const modal = document.querySelector('.jt-modal');
    fireEvent.click(modal);
    expect(onClose).not.toHaveBeenCalled();
  });
});
