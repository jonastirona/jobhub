import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobForm from './JobForm';

const ACCESS_TOKEN = 'test-token';
const BACKEND = 'http://localhost:8000';

const baseProps = {
  mode: 'create',
  job: undefined,
  accessToken: ACCESS_TOKEN,
  onClose: jest.fn(),
  onSaved: jest.fn(),
};

const sampleJob = {
  id: 'job-99',
  title: 'Software Engineer',
  company: 'Acme Corp',
  location: 'New York, NY',
  status: 'interviewing',
  applied_date: '2026-03-15',
  description: 'Build great products.',
  notes: 'Call on Monday.',
};

function mockFetchOk(body = { id: 'new-job' }) {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
}

function mockFetchError(status = 500, text = 'Internal Server Error') {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status, text: () => Promise.resolve(text) })
  );
}

function mockFetchNetworkFailure(message = 'Network error') {
  global.fetch = jest.fn(() => Promise.reject(new Error(message)));
}

function makePendingFetch() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  global.fetch = jest.fn(() => promise);
  return () => resolve({ ok: true, json: () => Promise.resolve({}) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchOk();
  process.env.REACT_APP_BACKEND_URL = BACKEND;
});

afterEach(() => {
  delete process.env.REACT_APP_BACKEND_URL;
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('rendering - create mode', () => {
  test('renders dialog with correct aria attributes', () => {
    render(<JobForm {...baseProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'jf-title');
  });

  test('shows "Add Job Application" heading', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByRole('heading', { name: /add job application/i })).toBeInTheDocument();
  });

  test('renders all form fields', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByLabelText(/job title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/applied date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/job description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  test('default status is "applied"', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByLabelText(/status/i)).toHaveValue('applied');
  });

  test('title and company inputs start empty', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByLabelText(/job title/i)).toHaveValue('');
    expect(screen.getByLabelText(/company/i)).toHaveValue('');
  });

  test('optional fields start empty', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByLabelText(/location/i)).toHaveValue('');
    expect(screen.getByLabelText(/applied date/i)).toHaveValue('');
    expect(screen.getByLabelText(/job description/i)).toHaveValue('');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('');
  });

  test('renders Add Job submit button', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByRole('button', { name: /add job/i })).toBeInTheDocument();
  });

  test('renders Cancel button', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  test('renders close (X) button', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByRole('button', { name: /close form/i })).toBeInTheDocument();
  });
});

describe('rendering - edit mode', () => {
  test('shows "Edit Application" heading', () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    expect(screen.getByRole('heading', { name: /edit application/i })).toBeInTheDocument();
  });

  test('pre-fills title and company', () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    expect(screen.getByLabelText(/job title/i)).toHaveValue('Software Engineer');
    expect(screen.getByLabelText(/company/i)).toHaveValue('Acme Corp');
  });

  test('pre-fills optional text fields', () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    expect(screen.getByLabelText(/location/i)).toHaveValue('New York, NY');
    expect(screen.getByLabelText(/job description/i)).toHaveValue('Build great products.');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('Call on Monday.');
  });

  test('pre-fills status dropdown', () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    expect(screen.getByLabelText(/status/i)).toHaveValue('interviewing');
  });

  test('pre-fills applied date', () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    expect(screen.getByLabelText(/applied date/i)).toHaveValue('2026-03-15');
  });

  test('renders Save Changes button in edit mode', () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  test('handles null optional fields gracefully', () => {
    const minimalJob = {
      id: 'job-min',
      title: 'Dev',
      company: 'Corp',
      location: null,
      status: 'applied',
      applied_date: null,
      description: null,
      notes: null,
    };
    render(<JobForm {...baseProps} mode="edit" job={minimalJob} />);
    expect(screen.getByLabelText(/location/i)).toHaveValue('');
    expect(screen.getByLabelText(/applied date/i)).toHaveValue('');
    expect(screen.getByLabelText(/job description/i)).toHaveValue('');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('');
  });

  test('strips time portion from ISO applied_date for date input', () => {
    const job = { ...sampleJob, applied_date: '2026-03-15T00:00:00+00:00' };
    render(<JobForm {...baseProps} mode="edit" job={job} />);
    expect(screen.getByLabelText(/applied date/i)).toHaveValue('2026-03-15');
  });

  test('normalizes legacy "interview" alias to canonical "interviewing"', () => {
    const job = { ...sampleJob, status: 'interview' };
    render(<JobForm {...baseProps} mode="edit" job={job} />);
    expect(screen.getByLabelText(/status/i)).toHaveValue('interviewing');
  });

  test('normalizes legacy "offer" alias to canonical "offered"', () => {
    const job = { ...sampleJob, status: 'offer' };
    render(<JobForm {...baseProps} mode="edit" job={job} />);
    expect(screen.getByLabelText(/status/i)).toHaveValue('offered');
  });

  test('preserves canonical status values as-is', () => {
    const job = { ...sampleJob, status: 'rejected' };
    render(<JobForm {...baseProps} mode="edit" job={job} />);
    expect(screen.getByLabelText(/status/i)).toHaveValue('rejected');
  });
});

describe('status dropdown options', () => {
  test('contains all six status options', () => {
    render(<JobForm {...baseProps} />);
    const select = screen.getByLabelText(/status/i);
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining([
        'interested',
        'applied',
        'interviewing',
        'offered',
        'rejected',
        'archived',
      ])
    );
  });

  test('displays human-readable labels', () => {
    render(<JobForm {...baseProps} />);
    const select = screen.getByLabelText(/status/i);
    const labels = Array.from(select.options).map((o) => o.text);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Interested',
        'Applied',
        'Interviewing',
        'Offered',
        'Rejected',
        'Archived',
      ])
    );
  });

  test('has exactly six options', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByLabelText(/status/i).options).toHaveLength(6);
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('validation', () => {
  test('shows title error when title is empty on submit', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByText(/job title is required/i)).toBeInTheDocument();
    });
  });

  test('shows company error when company is empty on submit', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByText(/company is required/i)).toBeInTheDocument();
    });
  });

  test('shows both errors simultaneously when both fields empty', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByText(/job title is required/i)).toBeInTheDocument();
      expect(screen.getByText(/company is required/i)).toBeInTheDocument();
    });
  });

  test('does not call fetch when validation fails', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByText(/job title is required/i)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('whitespace-only title still fails validation', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), '   ');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByText(/job title is required/i)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('whitespace-only company still fails validation', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/company/i), '   ');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByText(/company is required/i)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('title error clears when user types in title field', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(screen.getByText(/job title is required/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/job title/i), 'Engineer');
    await waitFor(() => {
      expect(screen.queryByText(/job title is required/i)).not.toBeInTheDocument();
    });
  });

  test('company error clears when user types in company field', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(screen.getByText(/company is required/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/company/i), 'Acme');
    await waitFor(() => {
      expect(screen.queryByText(/company is required/i)).not.toBeInTheDocument();
    });
  });

  test('title error does not clear when typing in company field', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(screen.getByText(/job title is required/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/company/i), 'Acme');
    expect(screen.getByText(/job title is required/i)).toBeInTheDocument();
  });

  test('invalid title input has aria-invalid attribute', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/job title/i)).toHaveAttribute('aria-invalid', 'true');
    });
  });

  test('invalid company input has aria-invalid attribute', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/company/i)).toHaveAttribute('aria-invalid', 'true');
    });
  });
});

// ─── Create - POST /jobs ──────────────────────────────────────────────────────

describe('create mode - form submission', () => {
  test('calls POST /jobs with correct URL', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Frontend Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'TechCo');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(`${BACKEND}/jobs`, expect.anything());
  });

  test('uses POST method', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls[0][1].method).toBe('POST');
  });

  test('sends Authorization header with access token', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls[0][1].headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  test('sends trimmed title and company', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), '  Frontend Dev  ');
    await userEvent.type(screen.getByLabelText(/company/i), '  TechCo  ');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.title).toBe('Frontend Dev');
    expect(body.company).toBe('TechCo');
  });

  test('sends default status "applied" when unchanged', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.status).toBe('applied');
  });

  test('sends chosen status when changed', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'interested' } });
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.status).toBe('interested');
  });

  test('sends null for empty optional fields', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.location).toBeNull();
    expect(body.applied_date).toBeNull();
    expect(body.description).toBeNull();
    expect(body.notes).toBeNull();
  });

  test('sends trimmed location (null when only spaces)', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    await userEvent.type(screen.getByLabelText(/location/i), '   ');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.location).toBeNull();
  });

  test('sends applied date when provided', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.change(screen.getByLabelText(/applied date/i), {
      target: { value: '2026-04-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.applied_date).toBe('2026-04-01');
  });

  test('calls onSaved after successful create', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(baseProps.onSaved).toHaveBeenCalledTimes(1));
  });

  test('calls onClose after successful create', async () => {
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalledTimes(1));
  });
});

// ─── Edit - PUT /jobs/:id ─────────────────────────────────────────────────────

describe('edit mode - form submission', () => {
  test('calls PUT /jobs/:id with correct URL', async () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(`${BACKEND}/jobs/${sampleJob.id}`, expect.anything());
  });

  test('uses PUT method', async () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch.mock.calls[0][1].method).toBe('PUT');
  });

  test('sends updated title when changed', async () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    const titleInput = screen.getByLabelText(/job title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Staff Engineer');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.title).toBe('Staff Engineer');
  });

  test('sends updated status when changed', async () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'offered' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.status).toBe('offered');
  });

  test('sends null for cleared optional fields', async () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    await userEvent.clear(screen.getByLabelText(/location/i));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.location).toBeNull();
  });

  test('sends existing optional fields as-is', async () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.location).toBe('New York, NY');
    expect(body.description).toBe('Build great products.');
    expect(body.notes).toBe('Call on Monday.');
  });

  test('calls onSaved after successful edit', async () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(baseProps.onSaved).toHaveBeenCalledTimes(1));
  });

  test('calls onClose after successful edit', async () => {
    render(<JobForm {...baseProps} mode="edit" job={sampleJob} />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalledTimes(1));
  });
});

// ─── API Errors ───────────────────────────────────────────────────────────────

describe('API error handling', () => {
  test('shows error message from server response text', async () => {
    mockFetchError(422, 'Title is too long');
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Title is too long');
    });
  });

  test('shows fallback error with status code when response body is empty', async () => {
    mockFetchError(500, '');
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/500/);
    });
  });

  test('shows error message on network failure', async () => {
    mockFetchNetworkFailure('Failed to fetch');
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch');
    });
  });

  test('does not call onClose when request fails', async () => {
    mockFetchError(500, 'Server error');
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  test('does not call onSaved when request fails', async () => {
    mockFetchError(500, 'Server error');
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(baseProps.onSaved).not.toHaveBeenCalled();
  });

  test('retains form field values after a failed request', async () => {
    mockFetchError(500, 'Server error');
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByLabelText(/job title/i)).toHaveValue('Dev');
    expect(screen.getByLabelText(/company/i)).toHaveValue('Corp');
  });

  test('shows error when backend URL is not configured', async () => {
    delete process.env.REACT_APP_BACKEND_URL;
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/backend url is not configured/i);
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('shows error when access token is missing', async () => {
    render(<JobForm {...baseProps} accessToken={null} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not authenticated/i);
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('API error is cleared when validation fails on next submit', async () => {
    mockFetchError(500, 'Server error');
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server error'));

    // Clear required fields then submit — validation should fire and API error should clear
    await userEvent.clear(screen.getByLabelText(/job title/i));
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByText(/job title is required/i)).toBeInTheDocument();
      expect(screen.queryByText('Server error')).not.toBeInTheDocument();
    });
  });

  test('error clears when subsequent request succeeds', async () => {
    mockFetchError(500, 'Server error');
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    // Retry with success
    mockFetchOk();
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => expect(baseProps.onSaved).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ─── Saving state (loading) ───────────────────────────────────────────────────

describe('saving state', () => {
  test('submit button shows "Saving..." while request is in flight', async () => {
    const settle = makePendingFetch();
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
    });
    settle();
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
  });

  test('submit button is disabled while saving', async () => {
    const settle = makePendingFetch();
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    });
    settle();
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
  });

  test('X close button is disabled while saving', async () => {
    const settle = makePendingFetch();
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close form/i })).toBeDisabled();
    });
    settle();
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
  });

  test('double-submit is ignored while saving', async () => {
    const settle = makePendingFetch();
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => screen.getByRole('button', { name: /saving/i }));
    // Attempt a second submit while already saving
    fireEvent.submit(screen.getByRole('button', { name: /saving/i }).closest('form'));
    settle();
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
    // Only one fetch call despite two submit attempts
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('cancel button is disabled while saving', async () => {
    const settle = makePendingFetch();
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
    settle();
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
  });
});

// ─── Close behavior ───────────────────────────────────────────────────────────

describe('close behavior', () => {
  test('calls onClose when Cancel is clicked', () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when X button is clicked', () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /close form/i }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when Escape key is pressed', () => {
    render(<JobForm {...baseProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when clicking the overlay backdrop', () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(document.querySelector('.jf-overlay'));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  test('does NOT close when clicking inside the modal content', () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByLabelText(/job title/i));
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  test('Escape key does not close while saving', async () => {
    const settle = makePendingFetch();
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => screen.getByRole('button', { name: /saving/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(baseProps.onClose).not.toHaveBeenCalled();
    settle();
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
  });

  test('backdrop click does not close while saving', async () => {
    const settle = makePendingFetch();
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => screen.getByRole('button', { name: /saving/i }));
    fireEvent.click(document.querySelector('.jf-overlay'));
    expect(baseProps.onClose).not.toHaveBeenCalled();
    settle();
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
  });

  test('does NOT close when clicking a button inside the modal', () => {
    render(<JobForm {...baseProps} />);
    // Clicking the submit button should not directly call onClose
    // (it may fail validation and stay open, but onClose is not directly invoked)
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  test('Escape key closes once per press', () => {
    render(<JobForm {...baseProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(baseProps.onClose).toHaveBeenCalledTimes(2);
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('accessibility', () => {
  test('error messages have role=alert', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('API error has role=alert', async () => {
    mockFetchError(500, 'Oops');
    render(<JobForm {...baseProps} />);
    await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
    await userEvent.type(screen.getByLabelText(/company/i), 'Corp');
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(within(alert).getByText('Oops')).toBeInTheDocument();
    });
  });

  test('title input linked to error via aria-describedby', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/job title/i)).toHaveAttribute(
        'aria-describedby',
        'jf-title-error'
      );
      expect(screen.getByLabelText(/job title/i)).toHaveAttribute('aria-invalid', 'true');
    });
  });

  test('company input linked to error via aria-describedby', async () => {
    render(<JobForm {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add job/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/company/i)).toHaveAttribute(
        'aria-describedby',
        'jf-company-error'
      );
      expect(screen.getByLabelText(/company/i)).toHaveAttribute('aria-invalid', 'true');
    });
  });

  test('title input has no aria-invalid when no error', () => {
    render(<JobForm {...baseProps} />);
    expect(screen.getByLabelText(/job title/i)).not.toHaveAttribute('aria-invalid');
  });
});

// ─── Focus trap ───────────────────────────────────────────────────────────────

describe('focus trap', () => {
  function getFocusable() {
    return Array.from(
      document
        .querySelector('.jf-modal')
        .querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        )
    );
  }

  test('Tab on last focusable element wraps to first', () => {
    render(<JobForm {...baseProps} />);
    const focusable = getFocusable();
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(document.querySelector('.jf-modal'), { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(focusable[0]);
  });

  test('Shift+Tab on first focusable element wraps to last', () => {
    render(<JobForm {...baseProps} />);
    const focusable = getFocusable();
    focusable[0].focus();
    fireEvent.keyDown(document.querySelector('.jf-modal'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  test('Tab mid-modal does not wrap', () => {
    render(<JobForm {...baseProps} />);
    const focusable = getFocusable();
    const mid = focusable[1];
    mid.focus();
    fireEvent.keyDown(document.querySelector('.jf-modal'), { key: 'Tab', shiftKey: false });
    // focus stays on mid — no wrapping occurred
    expect(document.activeElement).toBe(mid);
  });
});
