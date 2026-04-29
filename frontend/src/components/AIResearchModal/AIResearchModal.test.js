import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AIResearchModal from './AIResearchModal';

const mockResearch = jest.fn();
const mockClearError = jest.fn();
const mockUseAIResearch = jest.fn();

jest.mock('../../hooks/useAIResearch', () => ({
  useAIResearch: (...args) => mockUseAIResearch(...args),
}));

const JOB = { id: 'job-1', title: 'Backend Engineer', company: 'Acme' };
const TOKEN = 'test-token';

function renderModal(props = {}) {
  return render(
    <AIResearchModal job={JOB} accessToken={TOKEN} onClose={jest.fn()} {...props} />
  );
}

describe('AIResearchModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAIResearch.mockReturnValue({
      research: mockResearch,
      researching: false,
      error: null,
      clearError: mockClearError,
    });
    mockResearch.mockResolvedValue(null);
  });

  test('renders input step with textarea and Research button on mount', () => {
    renderModal();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^research$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  test('shows company name in label and subtitle', () => {
    renderModal();
    expect(screen.getByText(/acme/i, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/what would you like to know about acme/i)).toBeInTheDocument();
  });

  test('Research button is disabled when textarea is empty', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /^research$/i })).toBeDisabled();
  });

  test('Research button is enabled after typing context', () => {
    renderModal();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What is the culture?' } });
    expect(screen.getByRole('button', { name: /^research$/i })).toBeEnabled();
  });

  test('calls research with job id and trimmed context on submit', async () => {
    mockResearch.mockResolvedValue(null);
    renderModal();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  What tech stack do they use?  ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^research$/i }));
    });

    expect(mockResearch).toHaveBeenCalledWith('job-1', 'What tech stack do they use?');
  });

  test('shows loading state while researching', () => {
    mockUseAIResearch.mockReturnValue({
      research: mockResearch,
      researching: true,
      error: null,
      clearError: mockClearError,
    });
    renderModal();
    expect(screen.getByText(/researching acme/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^research$/i })).toBeDisabled();
  });

  test('shows results after successful research', async () => {
    mockResearch.mockResolvedValue('## Culture\n\nGreat place to work.');
    renderModal();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Tell me about culture.' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^research$/i }));
    });

    await waitFor(() => expect(screen.getByText(/great place to work/i)).toBeInTheDocument());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('shows Research Again and Close buttons after results', async () => {
    mockResearch.mockResolvedValue('## Results\n\nSome info.');
    renderModal();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Tell me something.' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^research$/i }));
    });

    await waitFor(() => screen.getByRole('button', { name: /research again/i }));
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
  });

  test('Research Again resets to input step', async () => {
    mockResearch.mockResolvedValue('## Results\n\nSome info.');
    renderModal();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Tell me something.' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^research$/i }));
    });

    await waitFor(() => screen.getByRole('button', { name: /research again/i }));
    fireEvent.click(screen.getByRole('button', { name: /research again/i }));

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  test('shows error message when research fails', () => {
    mockUseAIResearch.mockReturnValue({
      research: mockResearch,
      researching: false,
      error: 'AI rate limit reached.',
      clearError: mockClearError,
    });
    renderModal();
    expect(screen.getByRole('alert')).toHaveTextContent('AI rate limit reached.');
  });

  test('calls onClose when X button is clicked', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close company research modal/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('calls onClose when Cancel is clicked', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('calls onClose when overlay is clicked', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('dialog').parentElement);
    expect(onClose).toHaveBeenCalled();
  });
});
