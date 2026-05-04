import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import JobOverviewModal from './JobOverviewModal';

// --- Mocks ---

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

const mockGenerate = jest.fn();
const mockRewrite = jest.fn();

jest.mock('../../hooks/useAIDraft', () => ({
  useAIDraft: () => ({
    generate: mockGenerate,
    rewrite: mockRewrite,
    generating: false,
    rewriting: false,
    error: null,
    clearError: jest.fn(),
  }),
}));

jest.mock('../../hooks/useDocuments', () => ({
  useDocuments: () => ({
    createDocument: jest.fn(),
    saving: false,
    saveError: null,
    clearSaveError: jest.fn(),
  }),
}));

jest.mock('../../utils/pdfGenerator', () => ({
  contentToPdfBlob: () => new Blob(['pdf'], { type: 'application/pdf' }),
}));

const TOKEN = 'test-token';
const JOB = {
  id: 'job-1',
  title: 'Backend Engineer',
  company: 'Acme',
  status: 'applied',
  location: 'Remote',
  applied_date: '2025-01-01',
  deadline: '2025-06-01',
  description: 'Build APIs',
  notes: 'Some notes',
  recruiter_notes: 'Contact Bob',
  research: '## Culture\n\nGreat place.',
};

const JOB_NO_RESEARCH = { ...JOB, research: null };

function renderModal(props = {}) {
  return render(<JobOverviewModal job={JOB} onClose={jest.fn()} accessToken={TOKEN} {...props} />);
}

describe('JobOverviewModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveResearch.mockResolvedValue(null);
    mockResearch.mockResolvedValue(null);
  });

  // ---------------------------------------------------------------------------
  // Basic rendering
  // ---------------------------------------------------------------------------

  test('renders job title and company', () => {
    renderModal();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  test('renders research icon button', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /view saved research/i })).toBeInTheDocument();
  });

  test('research icon shows active state when job has research', () => {
    renderModal();
    const btn = screen.getByRole('button', { name: /view saved research/i });
    expect(btn.className).toContain('srm-research-indicator--active');
  });

  test('research icon shows inactive state when job has no research', () => {
    renderModal({ job: JOB_NO_RESEARCH });
    const btn = screen.getByRole('button', { name: /no research saved/i });
    expect(btn.className).not.toContain('srm-research-indicator--active');
  });

  // ---------------------------------------------------------------------------
  // Opening SavedResearchModal from JobOverview
  // ---------------------------------------------------------------------------

  test('clicking research icon opens SavedResearchModal', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /view saved research/i }));
    // SavedResearchModal renders a subtitle with company — title
    expect(screen.getByText(/acme — backend engineer/i)).toBeInTheDocument();
    // Should show Edit button (from SavedResearchModal with research)
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  test('clicking research icon when no research shows empty state', () => {
    renderModal({ job: JOB_NO_RESEARCH });
    fireEvent.click(screen.getByRole('button', { name: /no research saved/i }));
    expect(screen.getByText(/no research saved for this job yet/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Opening Generate New from SavedResearchModal
  // ---------------------------------------------------------------------------

  test('can open AIResearchModal from SavedResearchModal via Generate New', () => {
    renderModal();
    // Open SavedResearchModal
    fireEvent.click(screen.getByRole('button', { name: /view saved research/i }));
    // Click Generate New
    fireEvent.click(screen.getByRole('button', { name: /generate new/i }));
    // AIResearchModal should be visible
    expect(screen.getByText(/what would you like to know about acme/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Escape key — only top-most modal closes
  // ---------------------------------------------------------------------------

  test('Escape closes JobOverviewModal when no child modals are open', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape closes SavedResearchModal without closing JobOverviewModal', () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    // Open SavedResearchModal
    fireEvent.click(screen.getByRole('button', { name: /view saved research/i }));
    expect(screen.getByText(/great place/i)).toBeInTheDocument();

    // Press Escape — should close SavedResearchModal, NOT JobOverviewModal
    fireEvent.keyDown(document, { key: 'Escape' });

    // SavedResearchModal should be gone
    expect(screen.queryByText(/great place/i)).not.toBeInTheDocument();
    // JobOverviewModal should still be open
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
  });

  test('Escape closes AIResearchModal without closing SavedResearchModal or JobOverviewModal', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    // Open SavedResearchModal
    fireEvent.click(screen.getByRole('button', { name: /view saved research/i }));
    // Open AIResearchModal (Generate New)
    fireEvent.click(screen.getByRole('button', { name: /generate new/i }));
    expect(screen.getByText(/what would you like to know about acme/i)).toBeInTheDocument();

    // Press Escape — should only close AIResearchModal
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    // AIResearchModal should be gone, SavedResearchModal back (Edit button visible)
    await waitFor(() => {
      expect(screen.queryByText(/what would you like to know about acme/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('sequential Escape presses close modals one layer at a time', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    // Open SavedResearchModal
    fireEvent.click(screen.getByRole('button', { name: /view saved research/i }));
    // Open AIResearchModal
    fireEvent.click(screen.getByRole('button', { name: /generate new/i }));

    // First Escape — closes AIResearchModal, SavedResearchModal still open (Edit visible)
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await waitFor(() => {
      expect(screen.queryByText(/what would you like to know/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();

    // Second Escape — closes SavedResearchModal
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();

    // Third Escape — closes JobOverviewModal
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Opening Company Research from AI tools
  // ---------------------------------------------------------------------------

  test('clicking Company Research AI tool button opens AIResearchModal', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /company research/i }));
    expect(screen.getByText(/what would you like to know about acme/i)).toBeInTheDocument();
  });

  test('Escape from AI tools Company Research does not close JobOverviewModal', () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    // Open AI Research via AI tools
    fireEvent.click(screen.getByRole('button', { name: /company research/i }));
    expect(screen.getByText(/what would you like to know about acme/i)).toBeInTheDocument();

    // Escape should close AIResearchModal only
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/what would you like to know about acme/i)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Close button and overlay
  // ---------------------------------------------------------------------------

  test('Close footer button calls onClose', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('X button calls onClose', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close overview/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Null job guard
  // ---------------------------------------------------------------------------

  test('renders nothing when job is null', () => {
    const { container } = render(
      <JobOverviewModal job={null} onClose={jest.fn()} accessToken={TOKEN} />
    );
    expect(container.innerHTML).toBe('');
  });
});
