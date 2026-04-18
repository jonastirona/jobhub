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

function renderPage({ savingDraft = false } = {}) {
  mockUseAuth.mockReturnValue({
    session: { access_token: 'test-access-token' },
  });

  mockUseJobs.mockReturnValue({
    jobs: [JOB],
    loading: false,
    error: null,
    refetch: jest.fn(),
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
});
