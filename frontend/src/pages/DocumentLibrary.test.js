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
    renamingId: null,
    renameError: null,
    duplicatingId: null,
    duplicateError: null,
    viewDocument: jest.fn().mockResolvedValue('https://signed.example/doc.pdf'),
    deleteDocument: jest.fn().mockResolvedValue(true),
    renameDocument: jest.fn().mockResolvedValue({ ...baseDoc, name: 'Renamed' }),
    duplicateDocument: jest
      .fn()
      .mockResolvedValue({ ...baseDoc, id: 'doc-2', name: 'Copy of Resume_2026' }),
    clearDeleteError: jest.fn(),
    clearRenameError: jest.fn(),
    clearDuplicateError: jest.fn(),
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

  test('calls deleteDocument when Delete is clicked and confirmed', async () => {
    window.confirm = jest.fn().mockReturnValue(true);
    const deleteDocument = jest.fn().mockResolvedValue(true);
    renderPage({ deleteDocument });

    fireEvent.click(screen.getByRole('button', { name: /delete document/i }));

    await waitFor(() => {
      expect(deleteDocument).toHaveBeenCalledWith('doc-1');
    });
  });

  test('does not call deleteDocument when Delete is cancelled', async () => {
    window.confirm = jest.fn().mockReturnValue(false);
    const deleteDocument = jest.fn();
    renderPage({ deleteDocument });

    fireEvent.click(screen.getByRole('button', { name: /delete document/i }));

    await waitFor(() => {
      expect(deleteDocument).not.toHaveBeenCalled();
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

  test('shows inline rename input when rename button is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /rename document/i }));
    expect(screen.getByRole('textbox', { name: /new document name/i })).toBeInTheDocument();
  });

  test('calls renameDocument when Enter is pressed in rename input', async () => {
    const renameDocument = jest.fn().mockResolvedValue({ ...baseDoc, name: 'New Name' });
    renderPage({ renameDocument });

    fireEvent.click(screen.getByRole('button', { name: /rename document/i }));
    const input = screen.getByRole('textbox', { name: /new document name/i });
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(renameDocument).toHaveBeenCalledWith('doc-1', 'New Name');
    });
  });

  test('cancels rename and hides input when Escape is pressed', async () => {
    const renameDocument = jest.fn();
    renderPage({ renameDocument });

    fireEvent.click(screen.getByRole('button', { name: /rename document/i }));
    const input = screen.getByRole('textbox', { name: /new document name/i });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(renameDocument).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox', { name: /new document name/i })).not.toBeInTheDocument();
    });
  });

  test('calls duplicateDocument when duplicate button is clicked', async () => {
    const duplicateDocument = jest.fn().mockResolvedValue({
      ...baseDoc,
      id: 'doc-2',
      name: 'Copy of Resume_2026',
    });
    renderPage({ duplicateDocument });

    fireEvent.click(screen.getByRole('button', { name: /duplicate document/i }));

    await waitFor(() => {
      expect(duplicateDocument).toHaveBeenCalledWith('doc-1');
    });
  });

  test('renders rename error alert when renameError exists', () => {
    renderPage({ renameError: 'Failed to rename document (500)' });
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to rename document/i);
  });

  test('renders duplicate error alert when duplicateError exists', () => {
    renderPage({ duplicateError: 'Failed to duplicate document (500)', deleteError: null });
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => /failed to duplicate document/i.test(a.textContent))).toBe(true);
  });
});
