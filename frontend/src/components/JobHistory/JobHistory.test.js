import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JobHistory from './JobHistory';

const BACKEND = 'http://localhost:8000';
const ACCESS_TOKEN = 'test-token';

const sampleJob = {
  id: 'job-123',
  title: 'Software Engineer',
  company: 'Acme Corp',
  notes: 'Call on Monday.',
};

const sampleHistory = [
  {
    id: 'h1',
    job_id: 'job-123',
    user_id: 'user-1',
    from_status: null,
    to_status: 'applied',
    changed_at: '2026-04-01T00:00:00+00:00',
  },
  {
    id: 'h2',
    job_id: 'job-123',
    user_id: 'user-1',
    from_status: 'applied',
    to_status: 'interviewing',
    changed_at: '2026-04-05T14:32:00+00:00',
  },
];
const sampleInterviews = [
  {
    id: 'i1',
    job_id: 'job-123',
    user_id: 'user-1',
    round_type: 'Phone Screen',
    scheduled_at: '2026-04-08T15:00:00+00:00',
    notes: 'Bring resume',
  },
];

function mockFetchOk() {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleHistory) });
    }
    if (String(url).includes('/interviews')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleInterviews) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...sampleJob, notes: 'Updated' }) });
  });
}

function mockFetchError(status = 500) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status, text: () => Promise.resolve('Server error') })
  );
}

const baseProps = {
  job: sampleJob,
  accessToken: ACCESS_TOKEN,
  onClose: jest.fn(),
  onSaved: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchOk();
  process.env.REACT_APP_BACKEND_URL = BACKEND;
});

afterEach(() => {
  delete process.env.REACT_APP_BACKEND_URL;
});

// ─── Rendering ────────────────────────────────────────────────────────────────

test('renders job title and company in header', () => {
  render(<JobHistory {...baseProps} />);
  expect(screen.getByText('Software Engineer — Acme Corp')).toBeInTheDocument();
});

test('renders Stage History title', () => {
  render(<JobHistory {...baseProps} />);
  expect(screen.getByText('Stage History')).toBeInTheDocument();
});

test('shows loading state initially', () => {
  global.fetch = jest.fn(() => new Promise(() => {}));
  render(<JobHistory {...baseProps} />);
  expect(screen.getByText('Loading history...')).toBeInTheDocument();
});

test('renders history entries after load', async () => {
  render(<JobHistory {...baseProps} />);
  await waitFor(() => expect(screen.queryByText('Loading history...')).not.toBeInTheDocument());
  expect(screen.getAllByText('Applied').length).toBeGreaterThan(0);
  expect(screen.getByText('Interviewing')).toBeInTheDocument();
});

test('renders "Created as" label for first entry with no from_status', async () => {
  render(<JobHistory {...baseProps} />);
  await waitFor(() => expect(screen.queryByText('Loading history...')).not.toBeInTheDocument());
  expect(screen.getByText('Created as')).toBeInTheDocument();
});

test('renders arrow for transition entries', async () => {
  render(<JobHistory {...baseProps} />);
  await waitFor(() => expect(screen.queryByText('Loading history...')).not.toBeInTheDocument());
  expect(screen.getByText('→')).toBeInTheDocument();
});

test('shows empty state when no history', async () => {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (String(url).includes('/interviews')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  render(<JobHistory {...baseProps} />);
  await waitFor(() =>
    expect(screen.getByText('No stage history recorded yet.')).toBeInTheDocument()
  );
});

test('shows error state on failed fetch', async () => {
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/history')) {
      return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Server error') });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
  render(<JobHistory {...baseProps} />);
  await waitFor(() => expect(screen.queryByText('Loading history...')).not.toBeInTheDocument());
  expect(screen.getByText(/500/)).toBeInTheDocument();
});

// ─── Notes ────────────────────────────────────────────────────────────────────

test('pre-fills notes textarea with job notes', () => {
  render(<JobHistory {...baseProps} />);
  expect(screen.getByRole('textbox', { name: /notes/i })).toHaveValue('Call on Monday.');
});

test('pre-fills notes as empty when job has no notes', () => {
  render(<JobHistory {...baseProps} job={{ ...sampleJob, notes: null }} />);
  expect(screen.getByRole('textbox', { name: /notes/i })).toHaveValue('');
});

test('shows Saved confirmation after successful notes save', async () => {
  render(<JobHistory {...baseProps} />);
  await waitFor(() => expect(screen.queryByText('Loading history...')).not.toBeInTheDocument());

  mockFetchOk();
  fireEvent.click(screen.getByRole('button', { name: /save notes/i }));

  await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
});

test('calls onSaved after successful notes save', async () => {
  render(<JobHistory {...baseProps} />);
  await waitFor(() => expect(screen.queryByText('Loading history...')).not.toBeInTheDocument());

  mockFetchOk();
  fireEvent.click(screen.getByRole('button', { name: /save notes/i }));

  await waitFor(() => expect(baseProps.onSaved).toHaveBeenCalled());
});

test('shows error when notes save fails', async () => {
  render(<JobHistory {...baseProps} />);
  await waitFor(() => expect(screen.queryByText('Loading history...')).not.toBeInTheDocument());

  mockFetchError(500);
  fireEvent.click(screen.getByRole('button', { name: /save notes/i }));

  await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
});

// ─── Close ────────────────────────────────────────────────────────────────────

test('calls onClose when close button is clicked', () => {
  render(<JobHistory {...baseProps} />);
  fireEvent.click(screen.getByRole('button', { name: /close/i }));
  expect(baseProps.onClose).toHaveBeenCalled();
});

test('calls onClose when overlay is clicked', () => {
  render(<JobHistory {...baseProps} />);
  fireEvent.click(screen.getByRole('presentation'));
  expect(baseProps.onClose).toHaveBeenCalled();
});

test('renders interview events section and existing interview', async () => {
  render(<JobHistory {...baseProps} />);
  await waitFor(() => expect(screen.getByText('Interview Events')).toBeInTheDocument());
  expect(screen.getByText('Phone Screen')).toBeInTheDocument();
  expect(screen.getByText('Bring resume')).toBeInTheDocument();
});

test('can add interview event', async () => {
  mockFetchOk();
  const { container } = render(<JobHistory {...baseProps} />);
  await waitFor(() => expect(screen.getByText('Interview Events')).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText(/round type/i), {
    target: { value: 'Onsite' },
  });
  const dateInput = container.querySelector('input[type="datetime-local"]');
  fireEvent.change(dateInput, { target: { value: '2026-04-20T10:30' } });
  fireEvent.click(screen.getByRole('button', { name: /add interview event/i }));
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      `${BACKEND}/jobs/${sampleJob.id}/interviews`,
      expect.objectContaining({ method: 'POST' })
    );
  });
});
