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

test('renders job board heading when authenticated', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/my dashboard/i)).toBeInTheDocument();
  });
});

test('shows user email in toolbar', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('test')).toBeInTheDocument();
  });
});

test('shows empty state when api returns no jobs', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/no applications yet/i)).toBeInTheDocument();
  });
});

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

test('renders log out button in sidebar', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });
});

test('renders Add Job button on dashboard', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /add job/i })).toBeInTheDocument();
  });
});

test('clicking Add Job opens the job form modal', async () => {
  render(<App />);
  await waitFor(() => screen.getByRole('button', { name: /add job/i }));
  fireEvent.click(screen.getByRole('button', { name: /add job/i }));
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /add job application/i })).toBeInTheDocument();
  });
});

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

test('saves draft from job context with linked job_id', async () => {
  const job = {
    id: 'job-ctx-1',
    title: 'Backend Engineer',
    company: 'Datadog',
    status: 'applied',
    applied_date: null,
  };

  global.fetch = jest.fn((url, options = {}) => {
    if (!options.method) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([job]),
      });
    }

    if (options.method === 'POST' && url === 'http://localhost:8000/documents') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'doc-1',
            name: 'Datadog_Backend_Engineer_Draft',
            doc_type: 'Cover Letter Draft',
            content: 'Generated draft body',
            job_id: 'job-ctx-1',
          }),
      });
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });

  render(<App />);
  await waitFor(() => screen.getByText('Backend Engineer'));

  fireEvent.click(screen.getByRole('button', { name: /save draft for backend engineer/i }));
  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: /save draft from job context/i })
    ).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/draft content/i), {
    target: { value: 'Generated draft body' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save to documents/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/documents',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: expect.any(String),
      })
    );
  });

  const saveCall = global.fetch.mock.calls.find(
    ([url, options]) => url === 'http://localhost:8000/documents' && options?.method === 'POST'
  );
  expect(saveCall).toBeDefined();
  const [, saveOptions] = saveCall;
  expect(JSON.parse(saveOptions.body)).toMatchObject({
    name: 'Datadog_Backend_Engineer_Draft',
    doc_type: 'Cover Letter Draft',
    content: 'Generated draft body',
    job_id: 'job-ctx-1',
  });

  await waitFor(() => {
    expect(
      screen.queryByRole('heading', { name: /save draft from job context/i })
    ).not.toBeInTheDocument();
  });
});
