import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';

const mockUseAuth = jest.fn();
const mockUseJobs = jest.fn();
const mockUseDocuments = jest.fn();

jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../hooks/useJobs', () => ({
  useJobs: (...args) => mockUseJobs(...args),
}));

jest.mock('../hooks/useDocuments', () => ({
  useDocuments: (...args) => mockUseDocuments(...args),
}));

jest.mock('../components/layout/AppShell', () => ({
  __esModule: true,
  default: ({ children, title }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

jest.mock('../components/common/StatCard', () => ({
  __esModule: true,
  default: ({ label, value }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

jest.mock('../components/common/StatusBadge', () => ({
  __esModule: true,
  default: ({ status }) => <span>{status}</span>,
}));

jest.mock('../components/JobAnalyticsCard/JobAnalyticsCard', () => ({
  __esModule: true,
  default: () => <div data-testid="job-analytics-card">Job Analytics</div>,
}));

jest.mock('../components/JobForm/JobForm', () => ({
  __esModule: true,
  default: () => <div>Job Form</div>,
}));

jest.mock('../components/JobHistory/JobHistory', () => ({
  __esModule: true,
  default: () => <div>Job History</div>,
}));

jest.mock('../components/JobOverviewModal/JobOverviewModal', () => ({
  __esModule: true,
  default: () => <div>Job Overview</div>,
}));

const JOB = {
  id: 'job-1',
  title: 'Backend Engineer',
  company: 'Stripe',
  status: 'applied',
  applied_date: '2026-03-15',
  deadline: '2026-04-01',
  recruiter_notes: 'Recruiter contact',
};

function renderPage({ savingDraft = false, jobsHookOverrides = {} } = {}) {
  mockUseAuth.mockReturnValue({
    session: { access_token: 'test-access-token' },
  });

  mockUseJobs.mockReturnValue({
    jobs: [JOB],
    meta: {
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      availableStatuses: [],
      availableLocations: [],
      statusCounts: { interviewing: 0, offered: 0 },
    },
    loading: false,
    error: null,
    refetch: jest.fn(),
    ...jobsHookOverrides,
  });

  mockUseDocuments.mockReturnValue({
    createDocument: jest.fn(),
    clearSaveError: jest.fn(),
    saving: savingDraft,
    saveError: '',
  });

  return render(<Dashboard />);
}

describe('Dashboard draft modal accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
  });

  test('focuses Cancel button when draft modal opens', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save draft for backend engineer/i }));

    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    expect(cancelButton).toHaveFocus();
  });

  test('closes draft modal on Escape key', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save draft for backend engineer/i }));

    expect(
      await screen.findByRole('heading', { name: /save draft from job context/i })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /save draft from job context/i })
      ).not.toBeInTheDocument();
    });
  });

  test('traps keyboard focus inside draft modal with Tab and Shift+Tab', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save draft for backend engineer/i }));

    const modal = await screen.findByRole('dialog', { name: /save draft from job context/i });
    const nameInput = screen.getByLabelText(/document name/i);
    const saveButton = screen.getByRole('button', { name: /save to documents/i });

    saveButton.focus();
    expect(saveButton).toHaveFocus();

    fireEvent.keyDown(modal, { key: 'Tab' });
    expect(nameInput).toHaveFocus();

    nameInput.focus();
    expect(nameInput).toHaveFocus();

    fireEvent.keyDown(modal, { key: 'Tab', shiftKey: true });
    expect(saveButton).toHaveFocus();
  });

  test('does not close draft modal on overlay click while saving', async () => {
    renderPage({ savingDraft: true });

    fireEvent.click(screen.getByRole('button', { name: /save draft for backend engineer/i }));

    const heading = await screen.findByRole('heading', { name: /save draft from job context/i });
    expect(heading).toBeInTheDocument();

    const overlay = heading.closest('.draft-modal')?.parentElement;
    expect(overlay).toBeTruthy();

    fireEvent.click(overlay);

    expect(
      screen.getByRole('heading', { name: /save draft from job context/i })
    ).toBeInTheDocument();
  });

  test('passes includeArchived option when show archived is toggled', async () => {
    renderPage();
    expect(mockUseJobs).toHaveBeenLastCalledWith(
      'test-access-token',
      '',
      expect.objectContaining({ includeArchived: false })
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /show archived jobs/i }));

    expect(mockUseJobs).toHaveBeenLastCalledWith(
      'test-access-token',
      '',
      expect.objectContaining({ includeArchived: true })
    );
  });

  test('archives an active job from the actions column', async () => {
    const refetch = jest.fn().mockResolvedValue(undefined);
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    renderPage({
      jobsHookOverrides: {
        jobs: [{ ...JOB, is_archived: false }],
        meta: {
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          availableStatuses: [],
          availableLocations: [],
          statusCounts: { interviewing: 0, offered: 0 },
        },
        loading: false,
        error: null,
        refetch,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /archive application backend engineer/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/jobs/job-1',
      expect.objectContaining({
        method: 'PUT',
      })
    );
    const [, request] = global.fetch.mock.calls[0];
    expect(request.body).toBe(JSON.stringify({ is_archived: true }));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  test('action buttons have correct title tooltips', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /view application/i })).toHaveAttribute(
      'title',
      'View application'
    );
    expect(screen.getByRole('button', { name: /view stage history/i })).toHaveAttribute(
      'title',
      'View stage history'
    );
    expect(screen.getByRole('button', { name: /edit application/i })).toHaveAttribute(
      'title',
      'Edit application'
    );
    expect(
      screen.getByRole('button', { name: /save draft for backend engineer/i })
    ).toHaveAttribute('title', 'Save draft');
    expect(
      screen.getByRole('button', { name: /archive application backend engineer/i })
    ).toHaveAttribute('title', 'Archive application');
    expect(
      screen.getByRole('button', { name: /delete application backend engineer/i })
    ).toHaveAttribute('title', 'Delete application');
  });

  test('research button shows "No research saved" tooltip when no research exists', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /no research saved/i })).toHaveAttribute(
      'title',
      'No research saved'
    );
  });

  test('research button shows "View saved research" tooltip when research exists', () => {
    renderPage({
      jobsHookOverrides: {
        jobs: [{ ...JOB, research: 'Some research notes' }],
        meta: {
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          availableStatuses: [],
          availableLocations: [],
          statusCounts: { interviewing: 0, offered: 0 },
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      },
    });
    expect(screen.getByRole('button', { name: /view saved research/i })).toHaveAttribute(
      'title',
      'View saved research'
    );
  });

  test('archive button shows "Restore application" tooltip for an archived job', () => {
    renderPage({
      jobsHookOverrides: {
        jobs: [{ ...JOB, is_archived: true }],
        meta: {
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          availableStatuses: [],
          availableLocations: [],
          statusCounts: { interviewing: 0, offered: 0 },
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      },
    });
    expect(
      screen.getByRole('button', { name: /restore application backend engineer/i })
    ).toHaveAttribute('title', 'Restore application');
  });
});
