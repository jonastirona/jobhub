import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AIDraftModal from './AIDraftModal';

const mockGenerate = jest.fn();
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

const JOB = { id: 'job-1', title: 'Engineer', company: 'Acme' };
const TOKEN = 'test-token';

function renderModal(props = {}) {
  return render(
    <AIDraftModal
      type="resume"
      job={JOB}
      accessToken={TOKEN}
      onClose={jest.fn()}
      onSaved={jest.fn()}
      {...props}
    />
  );
}

describe('AIDraftModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAIDraft.mockReturnValue({
      generate: mockGenerate,
      rewrite: mockRewrite,
      generating: false,
      rewriting: false,
      error: null,
      clearError: mockClearError,
    });
    mockGenerate.mockResolvedValue(null);
  });

  test('calls generate on mount with correct type and job id', async () => {
    renderModal();
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith('resume', 'job-1'));
  });

  test('shows loading spinner while generating', () => {
    mockUseAIDraft.mockReturnValue({
      generate: mockGenerate,
      rewrite: mockRewrite,
      generating: true,
      rewriting: false,
      error: null,
      clearError: mockClearError,
    });

    renderModal();
    expect(screen.getByText(/generating your resume draft/i)).toBeInTheDocument();
  });

  test('renders generated content after successful generation', async () => {
    mockGenerate.mockResolvedValue('# John Doe\n\nExperienced engineer.');
    renderModal();
    await waitFor(() => expect(screen.getByText(/Experienced engineer/i)).toBeInTheDocument());
  });

  test('shows error message when generation fails', () => {
    mockUseAIDraft.mockReturnValue({
      generate: mockGenerate,
      rewrite: mockRewrite,
      generating: false,
      rewriting: false,
      error: 'AI rate limit reached.',
      clearError: mockClearError,
    });

    renderModal();
    expect(screen.getByRole('alert')).toHaveTextContent('AI rate limit reached.');
  });

  test('rewrite button is disabled when instructions are empty', async () => {
    mockGenerate.mockResolvedValue('# John Doe');
    renderModal();

    await waitFor(() => screen.getByPlaceholderText(/make it more concise/i));
    expect(screen.getByRole('button', { name: /^rewrite$/i })).toBeDisabled();
  });

  test('calls rewrite with content and instructions when submitted', async () => {
    mockGenerate.mockResolvedValue('Original content.');
    mockRewrite.mockResolvedValue(null);
    renderModal();

    await waitFor(() => screen.getByPlaceholderText(/make it more concise/i));

    fireEvent.change(screen.getByPlaceholderText(/make it more concise/i), {
      target: { value: 'Make it shorter.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^rewrite$/i }));

    await waitFor(() =>
      expect(mockRewrite).toHaveBeenCalledWith('Original content.', 'Make it shorter.')
    );
  });

  test('shows comparison view after successful rewrite', async () => {
    mockGenerate.mockResolvedValue('Original content.');
    mockRewrite.mockResolvedValue('Rewritten content.');
    renderModal();

    await waitFor(() => screen.getByPlaceholderText(/make it more concise/i));

    fireEvent.change(screen.getByPlaceholderText(/make it more concise/i), {
      target: { value: 'Make it shorter.' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^rewrite$/i }));
    });

    expect(screen.getByText('Previous version')).toBeInTheDocument();
    expect(screen.getByText('Rewritten version')).toBeInTheDocument();
  });

  test('restores original content when Keep previous is clicked', async () => {
    mockGenerate.mockResolvedValue('Original content.');
    mockRewrite.mockResolvedValue('Rewritten content.');
    renderModal();

    await waitFor(() => screen.getByPlaceholderText(/make it more concise/i));
    fireEvent.change(screen.getByPlaceholderText(/make it more concise/i), {
      target: { value: 'shorter' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^rewrite$/i }));
    });

    fireEvent.click(screen.getByRole('button', { name: /keep previous/i }));
    expect(screen.queryByText('Previous version')).not.toBeInTheDocument();
  });

  test('Save as PDF button calls createDocument', async () => {
    mockGenerate.mockResolvedValue('# John Doe');
    mockCreateDocument.mockResolvedValue({ id: 'doc-1' });
    renderModal();

    await waitFor(() => screen.getByRole('button', { name: /save as pdf/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save as pdf/i }));
    });

    expect(mockCreateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('Engineer'),
        doc_type: 'Resume',
        job_id: 'job-1',
      })
    );
  });

  test('shows saved confirmation after successful save', async () => {
    mockGenerate.mockResolvedValue('# John Doe');
    mockCreateDocument.mockResolvedValue({ id: 'doc-1' });
    renderModal();

    await waitFor(() => screen.getByRole('button', { name: /save as pdf/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save as pdf/i }));
    });

    expect(screen.getByText(/saved to document library/i)).toBeInTheDocument();
  });

  test('calls onClose when close button is clicked', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close ai draft modal/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
