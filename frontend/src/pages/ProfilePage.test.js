import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProfileAvatarProvider } from '../context/ProfileAvatarContext';
import ProfilePage from './ProfilePage';

const ACCESS_TOKEN = 'test-token';
const BACKEND = 'http://localhost:8000';

const mockAuthValue = {
  session: { access_token: ACCESS_TOKEN },
  user: { id: 'user-1', email: 'jane@example.com' },
  loading: false,
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(() => Promise.resolve()),
  supabaseConfigured: true,
};

jest.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => mockAuthValue,
}));

const SAMPLE_PROFILE = {
  id: 'profile-1',
  user_id: 'user-1',
  full_name: 'Jane Smith',
  headline: 'Software Engineer',
  location: 'New York, NY',
  phone: '555-123-4567',
  website: 'https://janesmith.dev',
  linkedin_url: 'https://linkedin.com/in/janesmith',
  github_url: 'https://github.com/janesmith',
  summary: 'Experienced engineer.',
};

function mockFetch({ getProfile = {}, saveProfile = SAMPLE_PROFILE } = {}) {
  global.fetch = jest.fn((url, opts = {}) => {
    if (opts.method === 'PUT') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(saveProfile) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(getProfile) });
  });
}

function mockFetchGetError(status = 500, message = 'Internal Server Error') {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status, text: () => Promise.resolve(message) })
  );
}

function mockFetchSaveError(status = 500, text = 'Server Error') {
  global.fetch = jest.fn((url, opts = {}) => {
    if (opts.method === 'PUT') {
      return Promise.resolve({ ok: false, status, text: () => Promise.resolve(text) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

function mockFetchNetworkError(message = 'Network error') {
  global.fetch = jest.fn(() => Promise.reject(new Error(message)));
}

function makePendingSave() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  global.fetch = jest.fn((url, opts = {}) => {
    if (opts.method === 'PUT') return promise;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  return () => resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PROFILE) });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfileAvatarProvider>
        <ProfilePage />
      </ProfileAvatarProvider>
    </MemoryRouter>
  );
}

const savedBackendUrl = process.env.REACT_APP_BACKEND_URL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REACT_APP_BACKEND_URL = BACKEND;
  mockFetch();
});

afterEach(() => {
  if (savedBackendUrl === undefined) {
    delete process.env.REACT_APP_BACKEND_URL;
  } else {
    process.env.REACT_APP_BACKEND_URL = savedBackendUrl;
  }
});

// ─── Page structure ───────────────────────────────────────────────────────────

describe('page structure', () => {
  test('renders "My Profile" heading in TopBar', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/my profile/i)).toBeInTheDocument();
    });
  });

  test('renders Identity section heading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /identity/i })).toBeInTheDocument();
    });
  });

  test('renders Professional Summary section heading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /professional summary/i })).toBeInTheDocument();
    });
  });

  test('renders Save Profile button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save profile/i })).toBeInTheDocument();
    });
  });

  test('renders sidebar navigation', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('loading state', () => {
  test('shows "Loading profile..." while fetch is in flight', () => {
    global.fetch = jest.fn(() => new Promise(() => undefined));
    renderPage();
    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
  });

  test('hides loading text after fetch resolves', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.queryByText(/loading profile/i)).not.toBeInTheDocument();
    });
  });
});

// ─── Load error ───────────────────────────────────────────────────────────────

describe('load error', () => {
  test('shows error message when GET /profile returns non-ok', async () => {
    mockFetchGetError(500, 'Server Error');
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load profile/i)).toBeInTheDocument();
    });
  });

  test('load error has role=alert', async () => {
    mockFetchGetError(503);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  test('still renders form after load error', async () => {
    mockFetchGetError(500);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save profile/i })).toBeInTheDocument();
    });
  });

  test('shows error when network fails on load', async () => {
    mockFetchNetworkError('No connection');
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no connection/i)).toBeInTheDocument();
    });
  });
});

// ─── Rendering — empty profile ────────────────────────────────────────────────

describe('rendering — empty profile (no existing data)', () => {
  test('all text fields start empty when profile is {}', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveValue('');
    });
    expect(screen.getByLabelText(/headline/i)).toHaveValue('');
    expect(screen.getByLabelText(/location/i)).toHaveValue('');
    expect(screen.getByLabelText(/phone/i)).toHaveValue('');
    expect(screen.getByLabelText(/website/i)).toHaveValue('');
    expect(screen.getByLabelText(/linkedin url/i)).toHaveValue('');
    expect(screen.getByLabelText(/github url/i)).toHaveValue('');
    expect(screen.getByLabelText('Summary')).toHaveValue('');
  });

  test('avatar falls back to email initial when no full_name', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveValue('');
    });
    // email is jane@example.com → initial is 'J'
    const profileAvatar = document.querySelector('.profile-avatar');
    expect(profileAvatar).toHaveTextContent('J');
  });

  test('shows placeholder name row with email when no full_name', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    });
  });

  test('shows "Add a headline" when no headline', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/add a headline/i)).toBeInTheDocument();
    });
  });

  test('summary character count starts at 0', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('0 characters')).toBeInTheDocument();
    });
  });
});

// ─── Rendering — existing profile ─────────────────────────────────────────────

describe('rendering — existing profile', () => {
  test('pre-fills all text fields from loaded profile', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith');
    });
    expect(screen.getByLabelText(/headline/i)).toHaveValue('Software Engineer');
    expect(screen.getByLabelText(/location/i)).toHaveValue('New York, NY');
    expect(screen.getByLabelText(/phone/i)).toHaveValue('555-123-4567');
    expect(screen.getByLabelText(/website/i)).toHaveValue('https://janesmith.dev');
    expect(screen.getByLabelText(/linkedin url/i)).toHaveValue('https://linkedin.com/in/janesmith');
    expect(screen.getByLabelText(/github url/i)).toHaveValue('https://github.com/janesmith');
    expect(screen.getByLabelText('Summary')).toHaveValue('Experienced engineer.');
  });

  test('avatar shows initials from full_name', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('JS')).toBeInTheDocument();
    });
  });

  test('avatar row shows full name', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  test('avatar row shows headline', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Software Engineer').length).toBeGreaterThan(0);
    });
  });

  test('summary character count reflects loaded summary length', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => {
      const len = SAMPLE_PROFILE.summary.length;
      expect(screen.getByText(`${len} characters`)).toBeInTheDocument();
    });
  });

  test('handles null optional fields gracefully', async () => {
    const profile = {
      ...SAMPLE_PROFILE,
      location: null,
      phone: null,
      website: null,
      linkedin_url: null,
      github_url: null,
      summary: null,
    };
    mockFetch({ getProfile: profile });
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/location/i)).toHaveValue('');
    });
    expect(screen.getByLabelText(/phone/i)).toHaveValue('');
    expect(screen.getByLabelText('Summary')).toHaveValue('');
  });

  test('single-word full_name uses first letter as initial', async () => {
    mockFetch({ getProfile: { ...SAMPLE_PROFILE, full_name: 'Jane' } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('J')).toBeInTheDocument();
    });
  });
});

// ─── Form interaction ─────────────────────────────────────────────────────────

describe('form interaction', () => {
  test('typing in full_name updates the field', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/full name/i), 'John Doe');
    expect(screen.getByLabelText(/full name/i)).toHaveValue('John Doe');
  });

  test('typing updates avatar initials live', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/full name/i), 'A');
    const profileAvatar = document.querySelector('.profile-avatar');
    expect(profileAvatar).toHaveTextContent('A');
  });

  test('typing in headline updates avatar headline preview', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/headline/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/headline/i), 'Dev');
    expect(screen.getByText('Dev')).toBeInTheDocument();
  });

  test('typing in summary updates character count', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Summary')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('Summary'), 'Hello');
    expect(screen.getByText('5 characters')).toBeInTheDocument();
  });

  test('clearing a field changes its value to empty', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    await userEvent.clear(screen.getByLabelText(/full name/i));
    expect(screen.getByLabelText(/full name/i)).toHaveValue('');
  });
});

// ─── Save — success ───────────────────────────────────────────────────────────

describe('save — success', () => {
  test('calls PUT /profile with trimmed payload on submit', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [url, opts] = global.fetch.mock.calls[1];
    expect(url).toBe(`${BACKEND}/profile`);
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body);
    expect(body.full_name).toBe('Jane Smith');
  });

  test('sends Authorization header on PUT', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [, opts] = global.fetch.mock.calls[1];
    expect(opts.headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  test('shows "Profile saved successfully." after save', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByText(/profile saved successfully/i)).toBeInTheDocument();
    });
  });

  test('success message has role=status', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  test('sends null for whitespace-only fields', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/full name/i), '   ');
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(body.full_name).toBeNull();
  });

  test('success message disappears after editing any field', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() =>
      expect(screen.getByText(/profile saved successfully/i)).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'John' } });
    expect(screen.queryByText(/profile saved successfully/i)).not.toBeInTheDocument();
  });

  test('updates profile state with server response after save', async () => {
    const updated = { ...SAMPLE_PROFILE, full_name: 'John Doe' };
    mockFetch({ getProfile: {}, saveProfile: updated });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/full name/i), 'John Doe');
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() =>
      expect(screen.getByText(/profile saved successfully/i)).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/full name/i)).toHaveValue('John Doe');
  });
});

// ─── Save — error ─────────────────────────────────────────────────────────────

describe('save — error', () => {
  test('shows API error text when PUT returns non-ok', async () => {
    mockFetchSaveError(500, 'Database connection failed');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByText('Database connection failed')).toBeInTheDocument();
    });
  });

  test('save error has role=alert', async () => {
    mockFetchSaveError(500, 'Error');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  test('shows network error message when fetch rejects on save', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'PUT') return Promise.reject(new Error('Connection refused'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByText(/connection refused/i)).toBeInTheDocument();
    });
  });

  test('shows error when backend URL is missing', async () => {
    delete process.env.REACT_APP_BACKEND_URL;
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/backend url is not configured/i);
    });
  });

  test('save error clears success message', async () => {
    // First save succeeds, second fails
    let callCount = 0;
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'PUT') {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PROFILE) });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error'),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    // First save
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() =>
      expect(screen.getByText(/profile saved successfully/i)).toBeInTheDocument()
    );
    // Second save fails
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/profile saved successfully/i)).not.toBeInTheDocument();
  });
});

// ─── Saving state ─────────────────────────────────────────────────────────────

describe('saving state', () => {
  test('button shows "Saving..." while request is in flight', async () => {
    const settle = makePendingSave();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
    });
    settle();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save profile/i })).toBeInTheDocument()
    );
  });

  test('save button is disabled while saving', async () => {
    const settle = makePendingSave();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    });
    settle();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save profile/i })).not.toBeDisabled()
    );
  });

  test('does not dispatch duplicate fetch on re-submit while saving', async () => {
    const settle = makePendingSave();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => screen.getByRole('button', { name: /saving/i }));
    fireEvent.click(screen.getByRole('button', { name: /saving/i }));
    settle();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save profile/i })).toBeInTheDocument()
    );
    const putCalls = global.fetch.mock.calls.filter(([, opts = {}]) => opts.method === 'PUT');
    expect(putCalls).toHaveLength(1);
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('accessibility', () => {
  test('all inputs have associated labels', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/headline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/linkedin url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/github url/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Summary')).toBeInTheDocument();
  });

  test('identity section has aria-labelledby pointing to its heading', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    const section = screen.getByRole('region', { name: /identity/i });
    expect(section).toBeInTheDocument();
  });

  test('summary section has aria-labelledby pointing to its heading', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Summary')).toBeInTheDocument());
    const section = screen.getByRole('region', { name: /professional summary/i });
    expect(section).toBeInTheDocument();
  });

  test('character count has aria-live="polite"', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('0 characters')).toBeInTheDocument());
    const counter = screen.getByText('0 characters');
    expect(counter).toHaveAttribute('aria-live', 'polite');
  });

  test('save error has role=alert for screen readers', async () => {
    mockFetchSaveError(500, 'Oops');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Oops');
    });
  });

  test('success message has role=status', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/profile saved successfully/i);
    });
  });
});

// ─── Fetch payload ────────────────────────────────────────────────────────────

describe('fetch payload', () => {
  test('PUT includes all eight profile fields', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse(global.fetch.mock.calls[1][1].body);
    for (const field of [
      'full_name',
      'headline',
      'location',
      'phone',
      'website',
      'linkedin_url',
      'github_url',
      'summary',
    ]) {
      expect(body).toHaveProperty(field);
    }
  });

  test('GET /profile is called with Authorization header', async () => {
    renderPage();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe(`${BACKEND}/profile`);
    expect(opts.headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  test('empty string fields are sent as null', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(body.full_name).toBeNull();
    expect(body.summary).toBeNull();
  });
});
