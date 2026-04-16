import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

const mockAuthValue = {
  session: {
    user: { id: '1', email: 'test@example.com' },
    access_token: 'test-token',
  },
  user: { id: '1', email: 'test@example.com' },
  loading: false,
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(() => Promise.resolve()),
  supabaseConfigured: true,
};

jest.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => mockAuthValue,
}));

const savedBackendUrl = process.env.REACT_APP_BACKEND_URL;

beforeEach(() => {
  process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })
  );
});

afterEach(() => {
  process.env.REACT_APP_BACKEND_URL = savedBackendUrl;
  jest.clearAllMocks();
});

// Verifies authenticated users can reach the dashboard landing view.
test('renders job board heading when authenticated', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/my dashboard/i)).toBeInTheDocument();
  });
});

// Verifies the authenticated user identity is shown in the top bar.
test('shows user email in toolbar', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('test')).toBeInTheDocument();
  });
});

// Verifies the empty-state row appears when the API returns no jobs.
test('shows empty state when api returns no jobs', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/no applications yet/i)).toBeInTheDocument();
  });
});

// Verifies job data from API is rendered in the dashboard table.
test('renders job cards when api returns jobs', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Software Engineer',
            company: 'TechCorp',
            status: 'applied',
            applied_date: null,
            updated_at: '2026-03-29T00:00:00+00:00',
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
  });
  expect(screen.getByText('TechCorp')).toBeInTheDocument();
  expect(screen.getAllByText('Applied').length).toBeGreaterThan(0);
});

// Verifies API failures surface a user-visible load error message.
test('shows error state when api request fails', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 500,
    })
  );
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/failed to load jobs/i)).toBeInTheDocument();
  });
});

// Verifies sidebar logout action is available on the dashboard.
test('renders log out button in sidebar', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });
});

// Verifies primary create action is visible in the dashboard header.
test('renders Add Job button on dashboard', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /add job/i })).toBeInTheDocument();
  });
});

// Verifies clicking Add Job opens the job form modal dialog.
test('clicking Add Job opens the job form modal', async () => {
  render(<App />);
  await waitFor(() => screen.getByRole('button', { name: /add job/i }));
  fireEvent.click(screen.getByRole('button', { name: /add job/i }));
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /add job application/i })).toBeInTheDocument();
  });
});

// Verifies the create modal closes when the user clicks Cancel.
test('job form modal closes when Cancel is clicked', async () => {
  render(<App />);
  await waitFor(() => screen.getByRole('button', { name: /add job/i }));
  fireEvent.click(screen.getByRole('button', { name: /add job/i }));
  await waitFor(() => screen.getByRole('dialog'));
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// Verifies edit action opens the modal pre-filled with job data.
test('clicking Edit opens form pre-filled with that job', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Backend Engineer',
            company: 'DataCorp',
            status: 'applied',
            applied_date: '2026-03-01',
            location: 'Remote',
            description: null,
            notes: null,
            updated_at: '2026-03-29T00:00:00+00:00',
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => screen.getByText('Backend Engineer'));
  fireEvent.click(screen.getByRole('button', { name: /edit application/i }));
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /edit application/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('DataCorp')).toBeInTheDocument();
  });
});

// Verifies the edit modal closes when the user clicks Cancel.
test('edit form modal closes when Cancel is clicked', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Backend Engineer',
            company: 'DataCorp',
            status: 'applied',
            applied_date: null,
            location: null,
            description: null,
            notes: null,
            updated_at: '2026-03-29T00:00:00+00:00',
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => screen.getByText('Backend Engineer'));
  fireEvent.click(screen.getByRole('button', { name: /edit application/i }));
  await waitFor(() => screen.getByRole('dialog'));
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

test('clicking delete opens a custom confirmation modal', async () => {
  global.fetch = jest.fn((url, options = {}) => {
    if (!options.method) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'job-1',
              title: 'Backend Engineer',
              company: 'DataCorp',
              status: 'applied',
              applied_date: null,
            },
          ]),
      });
    }
    return Promise.resolve({ ok: true, status: 204 });
  });

  render(<App />);
  await waitFor(() => screen.getByText('Backend Engineer'));
  fireEvent.click(screen.getByRole('button', { name: /delete application backend engineer/i }));

  const deleteDialog = screen.getByRole('dialog');
  expect(deleteDialog).toBeInTheDocument();
  expect(within(deleteDialog).getByText(/delete application\?/i)).toBeInTheDocument();
  expect(within(deleteDialog).getByText(/backend engineer/i)).toBeInTheDocument();
  expect(within(deleteDialog).getByText(/datacorp/i)).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalledWith(
    expect.stringMatching(/\/jobs\/job-1$/),
    expect.objectContaining({ method: 'DELETE' })
  );
});

test('cancelling delete does not call delete endpoint', async () => {
  global.fetch = jest.fn((url, options = {}) => {
    if (!options.method) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'job-1',
              title: 'Frontend Engineer',
              company: 'UI Corp',
              status: 'applied',
              applied_date: null,
            },
          ]),
      });
    }
    return Promise.resolve({ ok: true, status: 204 });
  });

  render(<App />);
  await waitFor(() => screen.getByText('Frontend Engineer'));
  fireEvent.click(screen.getByRole('button', { name: /delete application frontend engineer/i }));
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  expect(global.fetch).not.toHaveBeenCalledWith(
    expect.stringMatching(/\/jobs\/job-1$/),
    expect.objectContaining({ method: 'DELETE' })
  );
});

test('pressing Escape closes delete modal', async () => {
  global.fetch = jest.fn((url, options = {}) => {
    if (!options.method) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'job-1',
              title: 'Escape Close',
              company: 'UI Corp',
              status: 'applied',
              applied_date: null,
            },
          ]),
      });
    }
    return Promise.resolve({ ok: true, status: 204 });
  });

  render(<App />);
  await waitFor(() => screen.getByText('Escape Close'));
  fireEvent.click(screen.getByRole('button', { name: /delete application escape close/i }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

test('clicking modal overlay closes delete modal', async () => {
  global.fetch = jest.fn((url, options = {}) => {
    if (!options.method) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'job-1',
              title: 'Overlay Close',
              company: 'UI Corp',
              status: 'applied',
              applied_date: null,
            },
          ]),
      });
    }
    return Promise.resolve({ ok: true, status: 204 });
  });

  render(<App />);
  await waitFor(() => screen.getByText('Overlay Close'));
  fireEvent.click(screen.getByRole('button', { name: /delete application overlay close/i }));
  fireEvent.click(screen.getByTestId('delete-modal-overlay'));
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

test('delete modal traps focus within its action buttons', async () => {
  global.fetch = jest.fn((url, options = {}) => {
    if (!options.method) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'job-1',
              title: 'Focus Trap',
              company: 'UI Corp',
              status: 'applied',
              applied_date: null,
            },
          ]),
      });
    }
    return Promise.resolve({ ok: true, status: 204 });
  });

  render(<App />);
  await waitFor(() => screen.getByText('Focus Trap'));
  fireEvent.click(screen.getByRole('button', { name: /delete application focus trap/i }));

  const cancelButton = screen.getByRole('button', { name: /^cancel$/i });
  const deleteButton = screen.getByRole('button', { name: /^delete$/i });
  expect(cancelButton).toHaveFocus();

  deleteButton.focus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
  expect(cancelButton).toHaveFocus();

  cancelButton.focus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
  expect(deleteButton).toHaveFocus();
});

test('confirming delete calls endpoint and refetches jobs', async () => {
  global.fetch = jest.fn((url, options = {}) => {
    if (!options.method) {
      if (url === 'http://localhost:8000/jobs') {
        getJobsCallCount += 1;
      }
      return Promise.resolve({
        ok: true,
        json: () => {
          if (getJobsCallCount === 1) {
            return Promise.resolve([
              {
                id: 'job-1',
                title: 'Delete Me',
                company: 'DataCorp',
                status: 'applied',
                applied_date: null,
              },
            ]);
          }
          return Promise.resolve([]);
        },
      });
    }
    if (options.method === 'DELETE') {
      return Promise.resolve({ ok: true, status: 204 });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
  let getJobsCallCount = 0;

  render(<App />);
  await waitFor(() => screen.getByText('Delete Me'));
  fireEvent.click(screen.getByRole('button', { name: /delete application delete me/i }));
  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/jobs/job-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-token' },
      })
    );
  });
  await waitFor(() => {
    expect(screen.queryByText('Delete Me')).not.toBeInTheDocument();
  });
});

test('shows delete error when delete request fails', async () => {
  global.fetch = jest.fn((url, options = {}) => {
    if (!options.method) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'job-1',
              title: 'Delete Failure',
              company: 'FailCorp',
              status: 'applied',
              applied_date: null,
            },
          ]),
      });
    }
    return Promise.resolve({ ok: false, status: 500 });
  });

  render(<App />);
  await waitFor(() => screen.getByText('Delete Failure'));
  fireEvent.click(screen.getByRole('button', { name: /delete application delete failure/i }));
  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  await waitFor(() => {
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
      /failed to delete application/i
    );
  });
});

// Verifies typing in the top search input immediately updates visible dashboard rows.
test('filters jobs immediately when typing in search input', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Backend Engineer',
            company: 'DataCorp',
            status: 'applied',
            location: 'Remote',
          },
          {
            id: 'job-2',
            title: 'Frontend Engineer',
            company: 'Pixel Labs',
            status: 'interviewing',
            location: 'Austin',
          },
        ]),
    })
  );

  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'pixel' },
  });

  await waitFor(() => {
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Backend Engineer')).not.toBeInTheDocument();
  });
});

// Verifies search text is sent to the backend as the q query parameter.
test('passes search text to GET /jobs q query param', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })
  );

  render(<App />);
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/jobs', expect.anything());
  });

  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'acme' },
  });

  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      'http://localhost:8000/jobs?q=acme',
      expect.anything()
    );
  });
});

// Verifies the dashboard search input exists in the table section and topbar search is removed.
test('uses table-level search input instead of topbar search input', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByLabelText(/search job applications/i)).toBeInTheDocument();
  });
  expect(screen.queryByLabelText(/search jobs and companies/i)).not.toBeInTheDocument();
});

// Verifies status text can be used to filter matching jobs.
test('filters jobs by status keyword', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Platform Engineer',
            company: 'InfraWorks',
            status: 'interviewing',
            applied_date: '2026-03-15',
          },
          {
            id: 'job-2',
            title: 'QA Analyst',
            company: 'Test Labs',
            status: 'applied',
            applied_date: '2026-03-16',
          },
        ]),
    })
  );

  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('Platform Engineer')).toBeInTheDocument();
    expect(screen.getByText('QA Analyst')).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'interviewing' },
  });

  await waitFor(() => {
    expect(screen.getByText('Platform Engineer')).toBeInTheDocument();
    expect(screen.queryByText('QA Analyst')).not.toBeInTheDocument();
  });
});

// Verifies applied date text can be used to filter rows.
test('filters jobs by formatted applied date text', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Data Engineer',
            company: 'DataCorp',
            status: 'applied',
            applied_date: '2026-03-15',
          },
          {
            id: 'job-2',
            title: 'Support Engineer',
            company: 'HelpDesk',
            status: 'applied',
            applied_date: '2026-01-01',
          },
        ]),
    })
  );

  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('Data Engineer')).toBeInTheDocument();
    expect(screen.getByText('Support Engineer')).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'mar 15' },
  });

  await waitFor(() => {
    expect(screen.getByText('Data Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Support Engineer')).not.toBeInTheDocument();
  });
});

// Verifies description content (not visible in table) can still be searched.
test('filters jobs by description text', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'ML Engineer',
            company: 'Neuron Labs',
            status: 'applied',
            applied_date: '2026-03-15',
            description: 'Build ranking and recommendation pipelines',
          },
          {
            id: 'job-2',
            title: 'Frontend Engineer',
            company: 'Pixel Labs',
            status: 'applied',
            applied_date: '2026-03-15',
            description: 'Build design systems',
          },
        ]),
    })
  );

  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('ML Engineer')).toBeInTheDocument();
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'recommendation' },
  });

  await waitFor(() => {
    expect(screen.getByText('ML Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Frontend Engineer')).not.toBeInTheDocument();
  });
});

// Verifies title text can be used to filter matching jobs.
test('filters jobs by title text', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Backend Engineer',
            company: 'InfraWorks',
            status: 'applied',
            applied_date: '2026-03-15',
          },
          {
            id: 'job-2',
            title: 'Marketing Analyst',
            company: 'Growth Labs',
            status: 'applied',
            applied_date: '2026-03-16',
          },
        ]),
    })
  );

  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Marketing Analyst')).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'backend' },
  });

  await waitFor(() => {
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Marketing Analyst')).not.toBeInTheDocument();
  });
});

// Verifies company text can be used to filter matching jobs.
test('filters jobs by company text', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Data Engineer',
            company: 'Acme Robotics',
            status: 'applied',
            applied_date: '2026-03-15',
          },
          {
            id: 'job-2',
            title: 'Data Engineer',
            company: 'Nimbus Cloud',
            status: 'applied',
            applied_date: '2026-03-16',
          },
        ]),
    })
  );

  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('Acme Robotics')).toBeInTheDocument();
    expect(screen.getByText('Nimbus Cloud')).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'acme' },
  });

  await waitFor(() => {
    expect(screen.getByText('Acme Robotics')).toBeInTheDocument();
    expect(screen.queryByText('Nimbus Cloud')).not.toBeInTheDocument();
  });
});
