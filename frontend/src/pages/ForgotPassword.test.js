import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPassword from './ForgotPassword';

const mockResetPassword = jest.fn();

const mockAuthValue = {
  resetPassword: mockResetPassword,
  supabaseConfigured: true,
};

jest.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => mockAuthValue,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResetPassword.mockResolvedValue({ error: null });
});

// ─── Page structure ────────────────────────────────────────────────────────────

describe('page structure', () => {
  test('renders "Reset password" heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
  });

  test('renders email input', () => {
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  test('renders send reset link button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  test('renders back to sign in link', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
  });
});

// ─── Submission — success ──────────────────────────────────────────────────────

describe('submission — success', () => {
  test('calls resetPassword with trimmed email on submit', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: '  test@example.com  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('test@example.com');
    });
  });

  test('shows confirmation message after successful submit', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });

  test('hides the form after successful submit', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /send reset link/i })).not.toBeInTheDocument();
    });
  });
});

// ─── Submission — error ────────────────────────────────────────────────────────

describe('submission — error', () => {
  test('shows error message when resetPassword returns an error', async () => {
    mockResetPassword.mockResolvedValue({ error: new Error('User not found') });
    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('User not found');
    });
  });

  test('keeps the form visible after an error', async () => {
    mockResetPassword.mockResolvedValue({ error: new Error('Failed') });
    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });
});

// ─── Submitting state ──────────────────────────────────────────────────────────

describe('submitting state', () => {
  test('button shows "Sending..." while request is in flight', async () => {
    mockResetPassword.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sending/i })).toBeInTheDocument();
    });
  });

  test('button is disabled while submitting', async () => {
    mockResetPassword.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeDisabled();
  });
});