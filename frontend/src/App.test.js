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

// Verifies View (eye) opens a read-only job overview, not an editable form.
test('clicking View opens read-only overview with job details', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'DevRel Engineer',
            company: 'Contoso',
            location: 'Remote',
            status: 'interviewing',
            applied_date: '2026-02-01',
            deadline: '2026-03-01',
            description: 'Talk at conferences.',
            notes: 'Great fit.',
            recruiter_notes: 'pat@example.com',
            updated_at: '2026-03-29T00:00:00+00:00',
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => screen.getByText('DevRel Engineer'));
  fireEvent.click(screen.getByRole('button', { name: /view application/i }));
  await waitFor(() => {
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /devrel engineer/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Contoso');
    expect(dialog).toHaveTextContent('Talk at conferences.');
    expect(within(dialog).queryAllByRole('textbox')).toHaveLength(0);
  });
  fireEvent.click(screen.getByRole('button', { name: /close overview/i }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

test('job overview shows linked documents sorted by latest version and supports open/download', async () => {
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

  global.fetch = jest.fn((url) => {
    if (url.startsWith('http://localhost:8000/jobs')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'job-1',
              title: 'DevRel Engineer',
              company: 'Contoso',
              location: 'Remote',
              status: 'interviewing',
              applied_date: '2026-02-01',
              deadline: '2026-03-01',
              description: 'Talk at conferences.',
              notes: 'Great fit.',
              recruiter_notes: 'pat@example.com',
            },
          ]),
      });
    }

    if (url === 'http://localhost:8000/documents') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'doc-old',
              job_id: 'job-1',
              name: 'Resume - Contoso',
              doc_type: 'Resume',
              created_at: '2026-03-01T00:00:00+00:00',
              updated_at: '2026-03-02T00:00:00+00:00',
            },
            {
              id: 'doc-latest',
              job_id: 'job-1',
              name: 'Resume - Contoso',
              doc_type: 'Resume',
              created_at: '2026-03-10T00:00:00+00:00',
              updated_at: '2026-03-11T00:00:00+00:00',
            },
          ]),
      });
    }

    if (
      url === 'http://localhost:8000/documents/doc-old/view-url' ||
      url === 'http://localhost:8000/documents/doc-latest/view-url'
    ) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ url: 'https://example.test/document.pdf' }),
      });
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });

  render(<App />);
  await waitFor(() => screen.getByText('DevRel Engineer'));

  fireEvent.click(screen.getByRole('button', { name: /view application/i }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Linked documents')).toBeInTheDocument();
  expect(await within(dialog).findByText(/Latest \(v2\)/i)).toBeInTheDocument();
  expect(within(dialog).getByText(/\bv1\b/i)).toBeInTheDocument();

  const dialogText = dialog.textContent || '';
  expect(dialogText.indexOf('Latest (v2)')).toBeLessThan(dialogText.indexOf('v1'));

  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Open Resume - Contoso (Latest (v2))' })
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Download Resume - Contoso (Latest (v2))' })
  );

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/documents/doc-latest/view-url',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } })
    );
  });

  expect(openSpy).toHaveBeenCalled();
  openSpy.mockRestore();
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
    const tableSection = document.querySelector('.table-section');
    expect(tableSection).toBeTruthy();
    expect(within(tableSection).getByText(/failed to load jobs/i)).toBeInTheDocument();
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
            deadline: '2026-04-15',
            location: 'Remote',
            description: null,
            notes: null,
            recruiter_notes: 'hiring@datacorp.com',
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
    expect(screen.getByLabelText(/job deadline/i)).toHaveValue('2026-04-15');
    expect(screen.getByLabelText(/recruiter.*contact notes/i)).toHaveValue('hiring@datacorp.com');
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
  let deleted = false;
  const jobRow = [
    {
      id: 'job-1',
      title: 'Delete Me',
      company: 'DataCorp',
      status: 'applied',
      applied_date: null,
    },
  ];
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    if (!options.method) {
      if (u.includes('/reminders')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (u.startsWith('http://localhost:8000/jobs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(deleted ? [] : jobRow),
        });
      }
    }
    if (options.method === 'DELETE') {
      deleted = true;
      return Promise.resolve({ ok: true, status: 204 });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });

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

test('location filter options only show locations still present after delete', async () => {
  let deleted = false;
  const twoJobsPayload = {
    items: [
      { id: 'job-1', title: 'Boston Role', company: 'Acme', status: 'applied' },
      { id: 'job-2', title: 'Remote Role', company: 'Beta', status: 'applied' },
    ],
    total: 2,
    page: 1,
    page_size: 10,
    total_pages: 1,
    available_statuses: ['applied'],
    available_locations: ['Boston, MA', 'Remote'],
    status_counts: { interviewing: 0, offered: 0 },
  };
  const oneJobPayload = {
    items: [{ id: 'job-2', title: 'Remote Role', company: 'Beta', status: 'applied' }],
    total: 1,
    page: 1,
    page_size: 10,
    total_pages: 1,
    available_statuses: ['applied'],
    available_locations: ['Remote'],
    status_counts: { interviewing: 0, offered: 0 },
  };
  global.fetch = jest.fn((url, options = {}) => {
    const u = String(url);
    if (!options.method) {
      if (u.includes('/reminders')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (u.startsWith('http://localhost:8000/jobs')) {
        const body = deleted ? oneJobPayload : twoJobsPayload;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
      }
    }
    if (options.method === 'DELETE') {
      deleted = true;
      return Promise.resolve({ ok: true, status: 204 });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });

  render(<App />);
  await waitFor(() => screen.getByText('Boston Role'));
  fireEvent.click(screen.getByRole('button', { name: /delete application boston role/i }));
  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
  await waitFor(() => expect(screen.queryByText('Boston Role')).not.toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Location' }));
  expect(await screen.findByRole('checkbox', { name: 'Remote' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Boston, MA' })).not.toBeInTheDocument();
});

test('clamps currentPage back into range after deleting the last item on the last page', async () => {
  const makeItems = (count, startId = 1) =>
    Array.from({ length: count }, (_, i) => ({
      id: `job-${startId + i}`,
      title: `Role ${startId + i}`,
      company: 'Acme',
      status: 'applied',
    }));

  const page1BeforeDelete = {
    items: makeItems(10, 1),
    total: 11,
    page: 1,
    page_size: 10,
    total_pages: 2,
    available_statuses: ['applied'],
    available_locations: [],
    status_counts: { interviewing: 0, offered: 0 },
  };
  const page2BeforeDelete = {
    items: [{ id: 'job-last', title: 'Last Page Role', company: 'Acme', status: 'applied' }],
    total: 11,
    page: 2,
    page_size: 10,
    total_pages: 2,
    available_statuses: ['applied'],
    available_locations: [],
    status_counts: { interviewing: 0, offered: 0 },
  };
  // After delete: only 10 items remain, so total_pages collapses to 1.
  // If the client still asks for page=2 before clamping, backend returns an
  // empty page but reports total_pages=1 so the clamp effect can react.
  const page2AfterDelete = {
    items: [],
    total: 10,
    page: 2,
    page_size: 10,
    total_pages: 1,
    available_statuses: ['applied'],
    available_locations: [],
    status_counts: { interviewing: 0, offered: 0 },
  };
  const page1AfterDelete = {
    items: makeItems(10, 1),
    total: 10,
    page: 1,
    page_size: 10,
    total_pages: 1,
    available_statuses: ['applied'],
    available_locations: [],
    status_counts: { interviewing: 0, offered: 0 },
  };

  let deleted = false;
  global.fetch = jest.fn((url, options = {}) => {
    if (!options.method) {
      const parsed = new URL(String(url));
      const pageParam = parsed.searchParams.get('page');
      let body;
      if (!deleted) {
        body = pageParam === '2' ? page2BeforeDelete : page1BeforeDelete;
      } else {
        body = pageParam === '2' ? page2AfterDelete : page1AfterDelete;
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }
    if (options.method === 'DELETE') {
      deleted = true;
      return Promise.resolve({ ok: true, status: 204 });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });

  render(<App />);
  await waitFor(() => screen.getByText('Role 1'));

  fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
  await waitFor(() => screen.getByText('Last Page Role'));

  fireEvent.click(screen.getByRole('button', { name: /delete application last page role/i }));
  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  await waitFor(() => expect(screen.queryByText('Last Page Role')).not.toBeInTheDocument());
  // After the clamp, the user should be shown the new last (only) page with
  // the 10 remaining jobs, instead of being stranded on an empty page.
  await waitFor(() => expect(screen.getByText('Role 1')).toBeInTheDocument());
  expect(screen.getByText('Role 10')).toBeInTheDocument();
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

// Verifies typing in the dashboard table search input immediately updates visible dashboard rows.
test('filters jobs immediately when typing in dashboard table search input', async () => {
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
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:8000/jobs'),
      expect.anything()
    );
  });

  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'acme' },
  });

  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('http://localhost:8000/jobs?q=acme'),
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

// Verifies table lists Deadline and Recruiter columns for job rows.
test('renders Deadline and Recruiter column headers', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Analyst',
            company: 'Metrics Inc',
            status: 'applied',
            applied_date: '2026-03-01',
            deadline: '2026-06-01',
            recruiter_notes: 'team@metrics.inc',
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('columnheader', { name: /^deadline$/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /^recruiter$/i })).toBeInTheDocument();
  });
});

// Verifies formatted deadline appears in the dashboard table.
test('shows formatted deadline in table when job has deadline', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'SRE',
            company: 'OpsCo',
            status: 'applied',
            applied_date: null,
            deadline: '2026-07-04',
            recruiter_notes: null,
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('Jul 4, 2026')).toBeInTheDocument();
  });
});

// Verifies recruiter snippet appears in the recruiter column.
test('shows recruiter_notes text in recruiter column', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'PM',
            company: 'PlanCo',
            status: 'applied',
            applied_date: '2026-01-01',
            deadline: null,
            recruiter_notes: 'Jamie — jamie@planco.com',
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/jamie.*jamie@planco\.com/i)).toBeInTheDocument();
  });
});

// Verifies hybrid client filter matches recruiter_notes.
test('filters jobs by recruiter_notes text', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Role A',
            company: 'Co',
            status: 'applied',
            recruiter_notes: 'Call Morgan Lee before Friday',
          },
          {
            id: 'job-2',
            title: 'Role B',
            company: 'Co',
            status: 'applied',
            recruiter_notes: 'Different hiring manager',
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => expect(screen.getByText('Role A')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'morgan lee' },
  });
  await waitFor(() => {
    expect(screen.getByText('Role A')).toBeInTheDocument();
    expect(screen.queryByText('Role B')).not.toBeInTheDocument();
  });
});

// Verifies hybrid client filter matches formatted deadline (not only raw ISO).
test('filters jobs by formatted deadline text', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Role A',
            company: 'X',
            status: 'applied',
            deadline: '2026-07-04',
          },
          {
            id: 'job-2',
            title: 'Role B',
            company: 'Y',
            status: 'applied',
            deadline: '2026-12-01',
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => expect(screen.getByText('Role A')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'jul 4' },
  });
  await waitFor(() => {
    expect(screen.getByText('Role A')).toBeInTheDocument();
    expect(screen.queryByText('Role B')).not.toBeInTheDocument();
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

// Verifies hybrid client filter matches calendar month name on deadline or applied date.
test('filters jobs by month name across deadline and applied_date', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'April Role',
            company: 'X',
            status: 'applied',
            deadline: '2026-04-10',
            applied_date: null,
          },
          {
            id: 'job-2',
            title: 'March Role',
            company: 'Y',
            status: 'applied',
            applied_date: '2026-03-20',
            deadline: null,
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => expect(screen.getByText('April Role')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: 'april' },
  });
  await waitFor(() => {
    expect(screen.getByText('April Role')).toBeInTheDocument();
    expect(screen.queryByText('March Role')).not.toBeInTheDocument();
  });
});

// Verifies hybrid client filter matches year token on date fields.
test('filters jobs by year on deadline', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'job-1',
            title: 'Future',
            company: 'Z',
            status: 'applied',
            deadline: '2027-01-01',
          },
          {
            id: 'job-2',
            title: 'Past',
            company: 'Z',
            status: 'applied',
            deadline: '2026-12-31',
          },
        ]),
    })
  );
  render(<App />);
  await waitFor(() => expect(screen.getByText('Future')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/search job applications/i), {
    target: { value: '2027' },
  });
  await waitFor(() => {
    expect(screen.getByText('Future')).toBeInTheDocument();
    expect(screen.queryByText('Past')).not.toBeInTheDocument();
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
            doc_type: 'Cover Letter',
            storage_path: 'test-user/doc-1.pdf',
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

  fireEvent.change(screen.getByLabelText(/document name/i), {
    target: { value: 'Datadog_Backend_Engineer_Draft' },
  });

  const file = new File(['%PDF-1.7\nmock'], 'draft.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(screen.getByLabelText(/upload document/i), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: /save to documents/i }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalled();
  });

  const saveCall = global.fetch.mock.calls.find(
    ([url, options]) => url === 'http://localhost:8000/documents' && options?.method === 'POST'
  );
  expect(saveCall).toBeDefined();
  const [, saveOptions] = saveCall;
  expect(saveOptions.headers).toMatchObject({ Authorization: 'Bearer test-token' });
  expect(saveOptions.body).toBeInstanceOf(FormData);
  expect(saveOptions.body.get('name')).toBe('Datadog_Backend_Engineer_Draft');
  expect(saveOptions.body.get('doc_type')).toBe('Cover Letter');
  expect(saveOptions.body.get('job_id')).toBe('job-ctx-1');
  expect(saveOptions.body.get('file')).toBe(file);

  await waitFor(() => {
    expect(
      screen.queryByRole('heading', { name: /save draft from job context/i })
    ).not.toBeInTheDocument();
  });
});

test('stage dropdown supports multi-select and uncheck clearing', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            { id: 'job-1', title: 'Role 1', company: 'Acme', status: 'applied' },
            { id: 'job-2', title: 'Role 2', company: 'Beta', status: 'interviewing' },
          ],
          total: 2,
          page: 1,
          page_size: 10,
          total_pages: 1,
          // Backend uses faceted filtering: the status facet excludes the status
          // filter itself, so all selectable statuses stay visible regardless of
          // which statuses are currently checked.
          available_statuses: ['applied', 'interviewing', 'archived'],
          available_locations: ['Remote'],
          status_counts: { interviewing: 1, offered: 0 },
        }),
    })
  );

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Stage' }));
  const appliedCheckbox = await screen.findByRole('checkbox', { name: 'applied' });
  const interviewingCheckbox = await screen.findByRole('checkbox', { name: 'interviewing' });
  fireEvent.click(appliedCheckbox);
  fireEvent.click(interviewingCheckbox);

  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('statuses=applied'),
      expect.anything()
    );
  });
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('statuses=interviewing'),
      expect.anything()
    );
  });

  fireEvent.click(appliedCheckbox);
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.not.stringContaining('statuses=applied'),
      expect.anything()
    );
  });

  const stageButton = screen.getByRole('button', { name: /Stage/ });
  fireEvent.click(stageButton);
  fireEvent.click(stageButton);
  expect(await screen.findByRole('checkbox', { name: 'archived' })).toBeInTheDocument();
});

test('location and deadline dropdown selections persist and clear by unchecking', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [{ id: 'job-1', title: 'Role 1', company: 'Acme', status: 'applied' }],
          total: 1,
          page: 1,
          page_size: 10,
          total_pages: 1,
          available_statuses: ['applied'],
          available_locations: ['Remote', 'Boston, MA'],
          status_counts: { interviewing: 0, offered: 0 },
        }),
    })
  );

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Location' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Remote' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Boston, MA' }));

  fireEvent.click(screen.getByRole('button', { name: 'Deadline' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Upcoming' }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('locations=Remote'),
      expect.anything()
    );
  });
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('locations=Boston%2C+MA'),
      expect.anything()
    );
  });
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('deadline_states=upcoming'),
      expect.anything()
    );
  });

  fireEvent.click(screen.getByRole('button', { name: /Location/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Remote' }));
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.not.stringContaining('locations=Remote'),
      expect.anything()
    );
  });
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('locations=Boston%2C+MA'),
      expect.anything()
    );
  });

  fireEvent.click(screen.getByRole('button', { name: /Deadline/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Upcoming' }));
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.not.stringContaining('deadline_states=upcoming'),
      expect.anything()
    );
  });
});

test('sort dropdown sends selected sort mode to backend', async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [{ id: 'job-1', title: 'Role 1', company: 'Acme', status: 'applied' }],
          total: 1,
          page: 1,
          page_size: 10,
          total_pages: 1,
          available_statuses: ['applied'],
          available_locations: ['Remote'],
          status_counts: { interviewing: 0, offered: 0 },
        }),
    })
  );

  render(<App />);
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sort_by=created_at'),
      expect.anything()
    );
  });

  fireEvent.change(screen.getByLabelText(/sort jobs by/i), { target: { value: 'company' } });
  await waitFor(() => {
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('sort_by=company'),
      expect.anything()
    );
  });
});
