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
    archivingIds: new Set(),
    archiveError: null,
    viewDocument: jest.fn().mockResolvedValue('https://signed.example/doc.pdf'),
    deleteDocument: jest.fn().mockResolvedValue(true),
    renameDocument: jest.fn().mockResolvedValue({ ...baseDoc, name: 'Renamed' }),
    duplicateDocument: jest
      .fn()
      .mockResolvedValue({ ...baseDoc, id: 'doc-2', name: 'Copy of Resume_2026' }),
    archiveDocument: jest.fn().mockResolvedValue({ ...baseDoc, status: 'archived' }),
    restoreDocument: jest.fn().mockResolvedValue({ ...baseDoc, status: 'draft' }),
    clearDeleteError: jest.fn(),
    clearRenameError: jest.fn(),
    clearDuplicateError: jest.fn(),
    clearArchiveError: jest.fn(),
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

  test('uploads a new version from the selected document', async () => {
    const created = { ...baseDoc, id: 'doc-2', version_number: 2, previous_version_id: 'doc-1' };
    const createDocument = jest.fn().mockResolvedValue(created);
    const refetch = jest.fn().mockResolvedValue(undefined);
    renderPage({ createDocument, refetch, clearDeleteError: jest.fn() });

    fireEvent.click(screen.getByRole('button', { name: /view document/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upload new version/i })).toBeInTheDocument();
    });

    const file = new File(['%PDF-1.7 new version'], 'resume-v2.pdf', { type: 'application/pdf' });
    fireEvent.click(screen.getByRole('button', { name: /upload new version/i }));
    const input = screen.getByLabelText(/upload new version file/i);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Resume_2026',
          doc_type: 'Resume',
          job_id: 'job-1',
          source_document_id: 'doc-1',
          file,
        })
      );
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  test('loads and shows version history in the modal', async () => {
    const versions = [
      { ...baseDoc, id: 'doc-2', version_number: 2, name: 'Resume_2026' },
      { ...baseDoc, id: 'doc-1', version_number: 1, name: 'Resume_2026' },
    ];
    let resolveFetch;
    global.fetch = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    renderPage({ clearDeleteError: jest.fn() });

    fireEvent.click(screen.getByRole('button', { name: /view document/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /view version history/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /view version history/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/loading version history/i);
    });

    resolveFetch({ ok: true, json: () => Promise.resolve(versions) });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /hide version history/i })).toBeInTheDocument();
      expect(screen.getByText(/Resume_2026 - v2/)).toBeInTheDocument();
      expect(screen.getByText(/Resume_2026 - v1/)).toBeInTheDocument();
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

  test('opens duplicate form and saves a renamed duplicate', async () => {
    const duplicateDocument = jest.fn().mockResolvedValue({
      ...baseDoc,
      id: 'doc-2',
      name: 'Tailored Resume Copy',
    });
    const refetch = jest.fn().mockResolvedValue(undefined);
    renderPage({ duplicateDocument, refetch });

    fireEvent.click(screen.getByRole('button', { name: /duplicate document/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save duplicate/i })).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/duplicate document name/i);
    fireEvent.change(input, { target: { value: 'Tailored Resume Copy' } });
    fireEvent.click(screen.getByRole('button', { name: /save duplicate/i }));

    await waitFor(() => {
      expect(duplicateDocument).toHaveBeenCalledWith('doc-1', 'Tailored Resume Copy');
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });

  test('calls renameDocument when rename input is blurred', async () => {
    const renameDocument = jest.fn().mockResolvedValue({ ...baseDoc, name: 'Blurred Name' });
    renderPage({ renameDocument });

    fireEvent.click(screen.getByRole('button', { name: /rename document/i }));
    const input = screen.getByRole('textbox', { name: /new document name/i });
    fireEvent.change(input, { target: { value: 'Blurred Name' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(renameDocument).toHaveBeenCalledWith('doc-1', 'Blurred Name');
    });
  });

  test('all row action buttons are disabled when duplicatingId matches the row', () => {
    renderPage({ duplicatingId: 'doc-1' });

    expect(screen.getByRole('button', { name: /view document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /rename document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /duplicate document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete document/i })).toBeDisabled();
  });

  test('all row action buttons are disabled when renamingId matches the row', () => {
    renderPage({ renamingId: 'doc-1' });

    expect(screen.getByRole('button', { name: /view document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /rename document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /duplicate document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete document/i })).toBeDisabled();
  });

  test('keeps rename input open when renameDocument returns null', async () => {
    const renameDocument = jest.fn().mockResolvedValue(null);
    renderPage({ renameDocument });

    fireEvent.click(screen.getByRole('button', { name: /rename document/i }));
    const input = screen.getByRole('textbox', { name: /new document name/i });
    fireEvent.change(input, { target: { value: 'Still Editing' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(renameDocument).toHaveBeenCalledWith('doc-1', 'Still Editing');
    });
    expect(screen.getByRole('textbox', { name: /new document name/i })).toBeInTheDocument();
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
  
  test('calls archiveDocument when archive button is clicked', async () => {
    const archiveDocument = jest.fn().mockResolvedValue({ ...baseDoc, status: 'archived' });
    renderPage({ archiveDocument });

    fireEvent.click(screen.getByRole('button', { name: /archive document/i }));

    await waitFor(() => {
      expect(archiveDocument).toHaveBeenCalledWith('doc-1');
    });
  });

  test('calls restoreDocument when restore button is clicked on archived doc', async () => {
    const archivedDoc = { ...baseDoc, status: 'archived' };
    const restoreDocument = jest.fn().mockResolvedValue({ ...baseDoc, status: 'draft' });
    renderPage({ documents: [archivedDoc], restoreDocument });

    fireEvent.click(screen.getByRole('button', { name: /restore document/i }));

    await waitFor(() => {
      expect(restoreDocument).toHaveBeenCalledWith('doc-1');
    });
  });

  test('hides rename, duplicate, delete, and AI rewrite buttons for archived documents', () => {
    const archivedDoc = { ...baseDoc, status: 'archived', content: 'some content' };
    renderPage({ documents: [archivedDoc] });

    expect(screen.queryByRole('button', { name: /rename document/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /duplicate document/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete document/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rewrite with ai/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore document/i })).toBeInTheDocument();
  });

  test('all row action buttons are disabled when archivingIds contains the row id', () => {
    renderPage({ archivingIds: new Set(['doc-1']) });

    expect(screen.getByRole('button', { name: /view document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /rename document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /duplicate document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /archive document/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete document/i })).toBeDisabled();
  });

  test('renders archive error alert when archiveError exists', () => {
    renderPage({ archiveError: 'Failed to archive document (500)' });
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => /failed to archive document/i.test(a.textContent))).toBe(true);
  });

  test('show archived checkbox toggles includeArchived in hook filters', () => {
    renderPage();
    const checkbox = screen.getByRole('checkbox', { name: /show archived/i });

    expect(checkbox).toBeInTheDocument();
    expect(mockUseDocuments.mock.calls[mockUseDocuments.mock.calls.length - 1][2]).toMatchObject({
      includeArchived: false,
    });

    fireEvent.click(checkbox);

    expect(mockUseDocuments.mock.calls[mockUseDocuments.mock.calls.length - 1][2]).toMatchObject({
      includeArchived: true,
    });
  });
});
