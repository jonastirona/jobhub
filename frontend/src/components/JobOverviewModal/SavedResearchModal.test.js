import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SavedResearchModal from './SavedResearchModal';

const mockSaveResearch = jest.fn();
const mockClearError = jest.fn();

jest.mock('../../hooks/useJobResearch', () => ({
  useJobResearch: () => ({
    saveResearch: mockSaveResearch,
    saving: false,
    error: null,
    clearError: mockClearError,
  }),
}));

const mockResearch = jest.fn();
const mockClearResearchError = jest.fn();

jest.mock('../../hooks/useAIResearch', () => ({
  useAIResearch: () => ({
    research: mockResearch,
    researching: false,
    error: null,
    clearError: mockClearResearchError,
  }),
}));

const TOKEN = 'test-token';
const JOB_WITH_RESEARCH = {
  id: 'job-1',
  title: 'Backend Engineer',
  company: 'Acme',
  research: '## Culture\n\nGreat place to work.',
};
const JOB_WITHOUT_RESEARCH = {
  id: 'job-2',
  title: 'Frontend Engineer',
  company: 'Globex',
  research: null,
};

function renderModal(props = {}) {
  return render(
    <SavedResearchModal
      job={JOB_WITH_RESEARCH}
      accessToken={TOKEN}
      onClose={jest.fn()}
      onResearchUpdated={jest.fn()}
      {...props}
    />
  );
}

describe('SavedResearchModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveResearch.mockResolvedValue(null);
    mockResearch.mockResolvedValue(null);
  });

  // ---------------------------------------------------------------------------
  // Rendering — job WITH research
  // ---------------------------------------------------------------------------

  test('renders research content when job has research', () => {
    const { container } = renderModal();
    const contentArea = container.querySelector('.srm-content');
    expect(contentArea).toBeInTheDocument();
    expect(contentArea.textContent).toMatch(/great place to work/i);
  });

  test('shows company and title in subtitle', () => {
    renderModal();
    expect(screen.getByText(/acme — backend engineer/i)).toBeInTheDocument();
  });

  test('shows Edit, Generate New, and Close buttons when research exists', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate new/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
  });

  test('does not show empty state when research exists', () => {
    renderModal();
    expect(screen.queryByText(/no research saved/i)).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Rendering — job WITHOUT research
  // ---------------------------------------------------------------------------

  test('shows empty state when job has no research', () => {
    renderModal({ job: JOB_WITHOUT_RESEARCH });
    expect(screen.getByText(/no research saved for this job yet/i)).toBeInTheDocument();
  });

  test('shows Generate Research button in empty state', () => {
    renderModal({ job: JOB_WITHOUT_RESEARCH });
    expect(screen.getByRole('button', { name: /generate research/i })).toBeInTheDocument();
  });

  test('does not show Edit or Close footer buttons in empty state', () => {
    renderModal({ job: JOB_WITHOUT_RESEARCH });
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Editing flow
  // ---------------------------------------------------------------------------

  test('clicking Edit shows textarea with current research content', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('## Culture\n\nGreat place to work.');
  });

  test('shows Save Changes and Cancel buttons in edit mode', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  test('Cancel exits edit mode and restores original content', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Modified content' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    // Should be back in view mode showing original research
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/great place to work/i)).toBeInTheDocument();
  });

  test('Save Changes calls saveResearch with edited content', async () => {
    mockSaveResearch.mockResolvedValue({ ...JOB_WITH_RESEARCH, research: 'Updated' });
    const onResearchUpdated = jest.fn();
    renderModal({ onResearchUpdated });

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Updated' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    expect(mockSaveResearch).toHaveBeenCalledWith('job-1', 'Updated');
  });

  test('successful save exits edit mode and calls onResearchUpdated', async () => {
    const updatedJob = { ...JOB_WITH_RESEARCH, research: 'Updated' };
    mockSaveResearch.mockResolvedValue(updatedJob);
    const onResearchUpdated = jest.fn();
    renderModal({ onResearchUpdated });

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Updated' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    expect(onResearchUpdated).toHaveBeenCalledWith(updatedJob);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('failed save stays in edit mode', async () => {
    mockSaveResearch.mockResolvedValue(null);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Updated' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    // Still in edit mode
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Generate New — opens AIResearchModal
  // ---------------------------------------------------------------------------

  test('clicking Generate New opens AIResearchModal', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /generate new/i }));
    // AIResearchModal should now be rendered (has its own title)
    expect(screen.getByText(/what would you like to know about acme/i)).toBeInTheDocument();
  });

  test('clicking Generate Research in empty state opens AIResearchModal', () => {
    renderModal({ job: JOB_WITHOUT_RESEARCH });
    fireEvent.click(screen.getByRole('button', { name: /generate research/i }));
    expect(screen.getByText(/what would you like to know about globex/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Close behavior
  // ---------------------------------------------------------------------------

  test('calls onClose when X button is clicked', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close saved research modal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when Close footer button is clicked', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when overlay is clicked', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('dialog').parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Escape key behavior
  // ---------------------------------------------------------------------------

  test('Escape calls onClose when no child modal is open', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape does not call onClose when AIResearchModal (Generate New) is open', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    // Open child modal
    fireEvent.click(screen.getByRole('button', { name: /generate new/i }));
    // Press Escape — should close child, not call parent onClose
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Escape stopImmediatePropagation prevents sibling document listeners', () => {
    const siblingListener = jest.fn();
    // Register a sibling listener AFTER the component mounts (so it comes later in order)
    const onClose = jest.fn();
    renderModal({ onClose });
    document.addEventListener('keydown', siblingListener);

    fireEvent.keyDown(document, { key: 'Escape' });

    // Our modal's onClose was called
    expect(onClose).toHaveBeenCalledTimes(1);
    // Sibling listener should NOT have fired due to stopImmediatePropagation
    expect(siblingListener).not.toHaveBeenCalled();

    document.removeEventListener('keydown', siblingListener);
  });

  // ---------------------------------------------------------------------------
  // Syncing editedContent when job prop changes
  // ---------------------------------------------------------------------------

  test('editedContent syncs when job.research prop changes', () => {
    const { rerender } = render(
      <SavedResearchModal
        job={JOB_WITH_RESEARCH}
        accessToken={TOKEN}
        onClose={jest.fn()}
        onResearchUpdated={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByRole('textbox')).toHaveValue('## Culture\n\nGreat place to work.');

    const updatedJob = { ...JOB_WITH_RESEARCH, research: '## Updated\n\nNew content.' };
    rerender(
      <SavedResearchModal
        job={updatedJob}
        accessToken={TOKEN}
        onClose={jest.fn()}
        onResearchUpdated={jest.fn()}
      />
    );

    expect(screen.getByRole('textbox')).toHaveValue('## Updated\n\nNew content.');
  });
});
