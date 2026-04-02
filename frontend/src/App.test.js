import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
