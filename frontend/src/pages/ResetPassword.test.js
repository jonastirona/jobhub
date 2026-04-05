import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPassword from './ResetPassword';

const mockUpdatePassword = jest.fn();
const mockNavigate = jest.fn();

const mockAuthValue = {
  updatePassword: mockUpdatePassword,
  supabaseConfigured: true,
};

jest.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => mockAuthValue,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdatePassword.mockResolvedValue({ error: null });
});

// ─── Page structure ────────────────────────────────────────────────────────────

describe('page structure', () => {
  test('renders "New password" heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /new password/i })).toBeInTheDocument();
  });

  test('renders new password input', () => {
    renderPage();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  });

  test('renders confirm password input', () => {
    renderPage();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  test('renders update password button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
  });
});

// ─── Validation ────────────────────────────────────────────────────────────────

describe('validation', () => {
  test('shows error when passwords do not match', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i);
    });
  });

  test('does not call updatePassword when passwords do not match', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });
});

// ─── Submission — success ──────────────────────────────────────────────────────

describe('submission — success', () => {
  test('calls updatePassword with the entered password', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith('newpassword123');
    });
  });

  test('redirects to /dashboard after successful update', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });
});

// ─── Submission — error ────────────────────────────────────────────────────────

describe('submission — error', () => {
  test('shows error message when updatePassword returns an error', async () => {
    mockUpdatePassword.mockResolvedValue({ error: new Error('Token expired') });
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Token expired');
    });
  });

  test('does not navigate on error', async () => {
    mockUpdatePassword.mockResolvedValue({ error: new Error('Token expired') });
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ─── Submitting state ──────────────────────────────────────────────────────────

describe('submitting state', () => {
  test('button shows "Updating..." while request is in flight', async () => {
    mockUpdatePassword.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /updating/i })).toBeInTheDocument();
    });
  });

  test('button is disabled while submitting', async () => {
    mockUpdatePassword.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'newpassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /updating/i })).toBeDisabled();
    });
  });
});

// ─── Supabase not configured ───────────────────────────────────────────────────

describe('supabase not configured', () => {
  beforeEach(() => {
    mockAuthValue.supabaseConfigured = false;
  });

  afterEach(() => {
    mockAuthValue.supabaseConfigured = true;
  });

  test('shows missing env vars warning', () => {
    renderPage();
    expect(screen.getByText(/REACT_APP_SUPABASE_URL/)).toBeInTheDocument();
  });

  test('button is disabled when supabase is not configured', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();
  });
});
