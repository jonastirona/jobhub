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
