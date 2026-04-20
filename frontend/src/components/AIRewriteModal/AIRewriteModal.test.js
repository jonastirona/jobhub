import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AIRewriteModal from './AIRewriteModal';

const mockRewrite = jest.fn();
const mockClearError = jest.fn();
const mockCreateDocument = jest.fn();
const mockClearSaveError = jest.fn();
const mockUseAIDraft = jest.fn();

jest.mock('../../hooks/useAIDraft', () => ({
  useAIDraft: (...args) => mockUseAIDraft(...args),
}));

jest.mock('../../hooks/useDocuments', () => ({
  useDocuments: () => ({
    createDocument: mockCreateDocument,
    saving: false,
    saveError: null,
    clearSaveError: mockClearSaveError,
  }),
}));

jest.mock('../../utils/pdfGenerator', () => ({
  contentToPdfBlob: () => new Blob(['pdf'], { type: 'application/pdf' }),
}));

const DOC = {
  id: 'doc-1',
  name: 'My Resume',
  doc_type: 'Resume',
  job_id: 'job-1',
  content: '# John Doe\n\nOriginal content.',
  jobs: { title: 'Engineer', company: 'Acme' },
};
const TOKEN = 'test-token';

function renderModal(props = {}) {
  return render(
    <AIRewriteModal
      doc={DOC}
      accessToken={TOKEN}
      onClose={jest.fn()}
      onSaved={jest.fn()}
      {...props}
    />
  );
}

describe('AIRewriteModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAIDraft.mockReturnValue({
      rewrite: mockRewrite,
      rewriting: false,
      error: null,
      clearError: mockClearError,
    });
  });

  test('renders document name in header', () => {
    renderModal();
    expect(screen.getByText(/My Resume/i)).toBeInTheDocument();
  });

  test('renders linked job in header subtitle', () => {
    renderModal();
    expect(screen.getByText(/Engineer at Acme/i)).toBeInTheDocument();
  });

  test('renders existing document content on open', () => {
    renderModal();
    expect(screen.getByText(/Original content/i)).toBeInTheDocument();
  });

  test('rewrite button is disabled when instructions are empty', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /^rewrite$/i })).toBeDisabled();
  });

  test('rewrite button is enabled when instructions are filled', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/make it more concise/i), {
      target: { value: 'Make it shorter.' },
    });
    expect(screen.getByRole('button', { name: /^rewrite$/i })).not.toBeDisabled();
  });

  test('calls rewrite with current content and instructions', async () => {
    mockRewrite.mockResolvedValue(null);
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/make it more concise/i), {
      target: { value: 'Make it shorter.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^rewrite$/i }));

    await waitFor(() => expect(mockRewrite).toHaveBeenCalledWith(DOC.content, 'Make it shorter.'));
  });

  test('shows comparison view after successful rewrite', async () => {
    mockRewrite.mockResolvedValue('Rewritten content.');
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/make it more concise/i), {
      target: { value: 'shorter' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^rewrite$/i }));
    });

    expect(screen.getByText('Previous version')).toBeInTheDocument();
    expect(screen.getByText('Rewritten version')).toBeInTheDocument();
  });

  test('restores previous content when Keep previous is clicked', async () => {
    mockRewrite.mockResolvedValue('Rewritten content.');
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/make it more concise/i), {
      target: { value: 'shorter' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^rewrite$/i }));
    });

    fireEvent.click(screen.getByRole('button', { name: /keep previous/i }));
    expect(screen.queryByText('Previous version')).not.toBeInTheDocument();
  });

  test('Save as new PDF is disabled before any rewrite', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /save as new pdf/i })).toBeDisabled();
  });

  test('Save as new PDF calls createDocument after rewrite', async () => {
    mockRewrite.mockResolvedValue('Rewritten content.');
    mockCreateDocument.mockResolvedValue({ id: 'doc-2' });
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/make it more concise/i), {
      target: { value: 'shorter' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^rewrite$/i }));
    });

    fireEvent.click(screen.getByRole('button', { name: /keep rewrite/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save as new pdf/i }));
    });

    expect(mockCreateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('My Resume'),
        doc_type: 'Resume',
        job_id: 'job-1',
      })
    );
  });

  test('shows saved confirmation after successful save', async () => {
    mockRewrite.mockResolvedValue('Rewritten content.');
    mockCreateDocument.mockResolvedValue({ id: 'doc-2' });
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/make it more concise/i), {
      target: { value: 'shorter' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^rewrite$/i }));
    });

    fireEvent.click(screen.getByRole('button', { name: /keep rewrite/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save as new pdf/i }));
    });

    expect(screen.getByText(/saved as new document/i)).toBeInTheDocument();
  });

  test('shows error message when rewrite fails', () => {
    mockUseAIDraft.mockReturnValue({
      rewrite: mockRewrite,
      rewriting: false,
      error: 'AI generation failed.',
      clearError: mockClearError,
    });

    renderModal();
    expect(screen.getByRole('alert')).toHaveTextContent('AI generation failed.');
  });

  test('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close rewrite modal/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
