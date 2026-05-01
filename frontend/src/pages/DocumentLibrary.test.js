import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentLibrary from './DocumentLibrary';

const mockUseAuth = jest.fn();
const mockUseDocuments = jest.fn();

jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
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

const baseDoc = {
  id: 'doc-1',
  name: 'Resume_2026',
  doc_type: 'Resume',
  job_id: 'job-1',
  jobs: { title: 'Backend Engineer', company: 'Datadog' },
  updated_at: '2026-04-10T00:00:00Z',
};

function renderPage(overrides = {}) {
  mockUseAuth.mockReturnValue({ session: { access_token: 'test-token' } });
  mockUseDocuments.mockReturnValue({
    documents: [baseDoc],
    loading: false,
    error: null,
    deletingId: null,
    deleteError: null,
    viewDocument: jest.fn().mockResolvedValue('https://signed.example/doc.pdf'),
    deleteDocument: jest.fn().mockResolvedValue(true),
    clearDeleteError: jest.fn(),
    ...overrides,
  });
  return render(<DocumentLibrary />);
}

describe('DocumentLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.open = jest.fn();
  });

  test('opens signed url in a new tab when View is clicked', async () => {
    const viewDocument = jest.fn().mockResolvedValue('https://signed.example/doc.pdf');
    const clearDeleteError = jest.fn();
    renderPage({ viewDocument, clearDeleteError });

    // clicking View opens the details modal
    fireEvent.click(screen.getByRole('button', { name: /view document/i }));

    // modal should show Open file button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open file/i })).toBeInTheDocument();
    });

    // clicking Open file should call viewDocument and open a new tab
    fireEvent.click(screen.getByRole('button', { name: /open file/i }));

    await waitFor(() => {
      expect(clearDeleteError).toHaveBeenCalledTimes(1);
      expect(viewDocument).toHaveBeenCalledWith('doc-1');
      expect(window.open).toHaveBeenCalledWith(
        'https://signed.example/doc.pdf',
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  test('does not open a tab when signed url is missing', async () => {
    const viewDocument = jest.fn().mockResolvedValue(null);
    renderPage({ viewDocument });

    fireEvent.click(screen.getByRole('button', { name: /view document/i }));

    // click Open file in modal
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open file/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /open file/i }));

    await waitFor(() => {
      expect(viewDocument).toHaveBeenCalledWith('doc-1');
      expect(window.open).not.toHaveBeenCalled();
    });
  });

  test('shows status and tags in details modal', async () => {
    const docWithMeta = { ...baseDoc, status: 'final', tags: ['alpha', 'beta'] };
    renderPage({ documents: [docWithMeta], viewDocument: jest.fn(), clearDeleteError: jest.fn() });

    fireEvent.click(screen.getByRole('button', { name: /view document/i }));

    await waitFor(() => {
      expect(screen.getByText(/status:/i)).toBeInTheDocument();
      expect(screen.getByText(/final/i)).toBeInTheDocument();
      expect(screen.getByText(/tags:/i)).toBeInTheDocument();
      expect(screen.getByText(/alpha/)).toBeInTheDocument();
      expect(screen.getByText(/beta/)).toBeInTheDocument();
    });
  });

  test('calls deleteDocument when Delete is clicked', async () => {
    const deleteDocument = jest.fn().mockResolvedValue(true);
    renderPage({ deleteDocument });

    fireEvent.click(screen.getByRole('button', { name: /delete document/i }));

    await waitFor(() => {
      expect(deleteDocument).toHaveBeenCalledWith('doc-1');
    });
  });

  test('renders delete error alert when deleteError exists', () => {
    renderPage({ deleteError: 'Failed to delete document (500)' });
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to delete document/i);
  });

  test('renders loading state', () => {
    renderPage({ loading: true, documents: [] });
    expect(screen.getByText(/loading documents/i)).toBeInTheDocument();
  });

  test('renders error state', () => {
    renderPage({
      documents: [],
      loading: false,
      error: 'Failed to load documents (500)',
      deletingId: null,
      deleteError: null,
      viewDocument: jest.fn(),
      deleteDocument: jest.fn(),
      clearDeleteError: jest.fn(),
    });
    expect(screen.getByText(/failed to load documents/i)).toBeInTheDocument();
  });

  test('renders empty state', () => {
    renderPage({
      documents: [],
      loading: false,
      error: null,
      deletingId: null,
      deleteError: null,
      viewDocument: jest.fn(),
      deleteDocument: jest.fn(),
      clearDeleteError: jest.fn(),
    });
    expect(screen.getByText(/no saved documents yet/i)).toBeInTheDocument();
  });
});
