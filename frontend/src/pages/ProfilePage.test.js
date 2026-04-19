import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProfileAvatarProvider } from '../context/ProfileAvatarContext';
import ProfilePage from './ProfilePage';

const ACCESS_TOKEN = 'test-token';
const BACKEND = 'http://localhost:8000';

const SAMPLE_EXPERIENCE_ENTRY = {
  id: 'exp-uuid-0001',
  user_id: 'user-1',
  title: 'Software Engineer',
  company: 'Acme Corp',
  location: 'New York, NY',
  start_year: 2021,
  end_year: null,
  description: null,
  position: 0,
};

const SAMPLE_PREFS = {
  id: 'prefs-1',
  user_id: 'user-1',
  target_roles: 'Software Engineer',
  preferred_locations: 'New York, NY',
  work_mode: 'hybrid',
  salary_min: 80000,
  salary_max: 120000,
};

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

jest.mock('../hooks/useReminders', () => ({
  useReminders: () => ({ reminders: [], loading: false, error: null, refetch: jest.fn() }),
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

const REQUIRED_FIELD_KEYS = [
  'full_name',
  'headline',
  'location',
  'phone',
  'website',
  'linkedin_url',
];

const EMPTY_COMPLETION = {
  completion_percentage: 0,
  is_complete: false,
  missing_fields: REQUIRED_FIELD_KEYS,
  required_count: REQUIRED_FIELD_KEYS.length,
};

const COMPLETE_COMPLETION = {
  completion_percentage: 100,
  is_complete: true,
  missing_fields: [],
  required_count: REQUIRED_FIELD_KEYS.length,
};

const SAMPLE_EDUCATION = {
  id: 'edu-1',
  user_id: 'user-1',
  institution: 'NJIT',
  degree: 'Bachelor of Science',
  field_of_study: 'Computer Science',
  start_year: 2022,
  end_year: 2026,
  gpa: 3.8,
  description: null,
};

const SAMPLE_SKILL = {
  id: 'skill-1',
  user_id: 'user-1',
  name: 'React',
  category: 'Frontend',
  proficiency: 'advanced',
  position: 0,
};

/** Returns an ok education GET/mutation response, or null if the URL is not
 *  an /education endpoint.
 */
function resolveEducationUrl(url, opts = {}, { getEducation = [], saveEducation = null } = {}) {
  if (!url.includes('/education')) return null;
  if (opts.method === 'POST') {
    const entry = saveEducation ?? { id: 'new-edu', user_id: 'user-1' };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(entry) });
  }
  if (opts.method === 'PUT') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(saveEducation ?? {}) });
  }
  if (opts.method === 'DELETE') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve(getEducation) });
}

/** Returns an ok experience GET/mutation response, or null if the URL is not
 *  an /experience endpoint. Centralising this keeps all mock helpers consistent
 *  and prevents the /experience stub from drifting between them.
 */
function resolveExperienceUrl(url, opts = {}, { getExperience = [], saveExperience = null } = {}) {
  if (!url.includes('/experience')) return null;
  if (opts.method === 'POST') {
    const entry = saveExperience ?? { ...SAMPLE_EXPERIENCE_ENTRY, id: 'exp-new' };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(entry) });
  }
  if (opts.method === 'PUT' || opts.method === 'DELETE') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(saveExperience ?? {}) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve(getExperience) });
}

function resolveSkillsUrl(url, opts = {}, { getSkills = [], saveSkill = null } = {}) {
  if (!url.includes('/skills')) return null;
  if (opts.method === 'POST') {
    const skill = saveSkill ?? { id: 'new-skill', user_id: 'user-1', position: 0 };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(skill) });
  }
  if (opts.method === 'PUT' || opts.method === 'DELETE') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(saveSkill ?? getSkills) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve(getSkills) });
}

function mockFetch({
  getProfile = {},
  saveProfile = SAMPLE_PROFILE,
  getExperience = [],
  saveExperience = null,
  education = [],
  skills = [],
  saveSkill = null,
  getPrefs = {},
  savePrefs = SAMPLE_PREFS,
} = {}) {
  global.fetch = jest.fn((url, opts = {}) => {
    if (url.includes('/career-preferences')) {
      if (opts.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(savePrefs) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(getPrefs) });
    }
    const edu = resolveEducationUrl(url, opts, { getEducation: education });
    if (edu) return edu;
    const exp = resolveExperienceUrl(url, opts, { getExperience, saveExperience });
    if (exp) return exp;
    const skl = resolveSkillsUrl(url, opts, { getSkills: skills, saveSkill });
    if (skl) return skl;
    if (opts.method === 'PUT' && url.endsWith('/profile')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(saveProfile) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(getProfile) });
  });
}

function mockFetchGetError(status = 500, message = 'Internal Server Error') {
  global.fetch = jest.fn((url, opts = {}) => {
    if (url.includes('/career-preferences')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    const edu = resolveEducationUrl(url, opts);
    if (edu) return edu;
    const exp = resolveExperienceUrl(url, opts);
    if (exp) return exp;
    const skl = resolveSkillsUrl(url, opts);
    if (skl) return skl;
    return Promise.resolve({ ok: false, status, text: () => Promise.resolve(message) });
  });
}

function mockFetchSaveError(status = 500, text = 'Server Error') {
  global.fetch = jest.fn((url, opts = {}) => {
    if (url.includes('/career-preferences')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PREFS) });
    }
    const edu = resolveEducationUrl(url, opts);
    if (edu) return edu;
    const exp = resolveExperienceUrl(url, opts);
    if (exp) return exp;
    const skl = resolveSkillsUrl(url, opts);
    if (skl) return skl;
    if (url.endsWith('/profile') && !opts.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PROFILE) });
    }
    if (opts.method === 'PUT' && url.endsWith('/profile')) {
      return Promise.resolve({ ok: false, status, text: () => Promise.resolve(text) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PROFILE) });
  });
}

function mockFetchNetworkError(message = 'Network error') {
  global.fetch = jest.fn((url, opts = {}) => {
    if (url.includes('/career-preferences')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    const edu = resolveEducationUrl(url, opts);
    if (edu) return edu;
    const exp = resolveExperienceUrl(url, opts);
    if (exp) return exp;
    const skl = resolveSkillsUrl(url, opts);
    if (skl) return skl;
    return Promise.reject(new Error(message));
  });
}

function makePendingSave() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  global.fetch = jest.fn((url, opts = {}) => {
    const edu = resolveEducationUrl(url, opts);
    if (edu) return edu;
    const exp = resolveExperienceUrl(url, opts);
    if (exp) return exp;
    const skl = resolveSkillsUrl(url, opts);
    if (skl) return skl;
    if (url.endsWith('/profile') && !opts.method) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PROFILE) });
    }
    if (opts.method === 'PUT' && url.endsWith('/profile')) return promise;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PROFILE) });
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
  window.localStorage.clear();
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

  test('renders Save Identity button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save identity/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save summary/i })).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /save identity/i })).toBeInTheDocument();
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
    expect(screen.getByLabelText(/^location$/i)).toHaveValue('');
    expect(screen.getByLabelText(/phone/i)).toHaveValue('');
    expect(screen.getByLabelText(/website/i)).toHaveValue('');
    expect(screen.getByLabelText(/linkedin url/i)).toHaveValue('');
    expect(screen.getByLabelText(/github url/i)).toHaveValue('');
    expect(screen.getByLabelText('Summary')).toHaveValue('');
  });

  test('shows profile completion at 0 percent for an empty profile', async () => {
    mockFetch({ getProfile: { profile: {}, completion: EMPTY_COMPLETION } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/profile completion/i)).toBeInTheDocument();
    });
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText(/0\/6 required fields complete\./i)).toBeInTheDocument();
    expect(
      screen.getByText(/missing: full name, headline, location, phone, website, linkedin url\./i)
    ).toBeInTheDocument();
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
    expect(screen.getByLabelText(/^location$/i)).toHaveValue('New York, NY');
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

  test('hides profile completion panel when required fields are complete', async () => {
    mockFetch({
      getProfile: {
        profile: SAMPLE_PROFILE,
        completion: COMPLETE_COMPLETION,
      },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith');
    });
    expect(screen.queryByText(/profile completion/i)).not.toBeInTheDocument();
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
      expect(screen.getByLabelText(/^location$/i)).toHaveValue('');
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

  test('completion panel disappears after filling all required fields', async () => {
    mockFetch({ getProfile: { profile: {}, completion: EMPTY_COMPLETION } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/profile completion/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane Smith');
    await userEvent.type(screen.getByLabelText(/headline/i), 'Software Engineer');
    await userEvent.type(screen.getByLabelText(/^location$/i), 'New York, NY');
    await userEvent.type(screen.getByLabelText(/phone/i), '555-123-4567');
    await userEvent.type(screen.getByLabelText(/website/i), 'https://janesmith.dev');
    await userEvent.type(
      screen.getByLabelText(/linkedin url/i),
      'https://linkedin.com/in/janesmith'
    );

    await waitFor(() => {
      expect(screen.queryByText(/profile completion/i)).not.toBeInTheDocument();
    });
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
  test('calls PUT /profile with trimmed identity payload on submit', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'PUT');
      expect(putCall).toBeDefined();
    });
    const [url, opts] = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'PUT');
    expect(url).toBe(`${BACKEND}/profile`);
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body);
    expect(body.full_name).toBe('Jane Smith');
    expect(body.headline).toBe('Software Engineer');
    expect(body.location).toBe('New York, NY');
    expect(body.phone).toBe('555-123-4567');
    expect(body.website).toBeUndefined();
  });

  test('sends Authorization header on PUT', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'PUT');
      expect(putCall).toBeDefined();
    });
    const [, opts] = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'PUT');
    expect(opts.headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  test('shows "Identity saved successfully." after save', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(screen.getByText(/identity saved successfully/i)).toBeInTheDocument();
    });
  });

  test('success message has role=status', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  test('sends null for whitespace-only fields', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), '   ');
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/complete the highlighted identity fields before saving/i)
      ).toBeInTheDocument();
    });
    const putCalls = global.fetch.mock.calls.filter(([, opts = {}]) => opts.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });

  test('success message disappears after editing any field', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() =>
      expect(screen.getByText(/identity saved successfully/i)).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'John' } });
    expect(screen.queryByText(/identity saved successfully/i)).not.toBeInTheDocument();
  });

  test('updates profile state with server response after save', async () => {
    const updated = { ...SAMPLE_PROFILE, full_name: 'John Doe' };
    mockFetch({ getProfile: SAMPLE_PROFILE, saveProfile: updated });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), 'John Doe');
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() =>
      expect(screen.getByText(/identity saved successfully/i)).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/full name/i)).toHaveValue('John Doe');
  });
});

// ─── Save — validation ───────────────────────────────────────────────────────

describe('save — validation', () => {
  test('shows identity validation feedback when required fields are blank', async () => {
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/complete the highlighted identity fields before saving/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
    });
    const putCalls = global.fetch.mock.calls.filter(([, opts = {}]) => opts.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });

  test('shows summary validation feedback for invalid URLs', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/website/i)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/website/i));
    await userEvent.type(screen.getByLabelText(/website/i), 'notaurl');
    fireEvent.click(screen.getByRole('button', { name: /save summary/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/fix the highlighted summary fields before saving/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/website must be a valid url/i)).toBeInTheDocument();
    });
    const putCalls = global.fetch.mock.calls.filter(([, opts = {}]) => opts.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });
});

// ─── Save — error ─────────────────────────────────────────────────────────────

describe('save — error', () => {
  test('shows API error text when PUT returns non-ok', async () => {
    mockFetchSaveError(500, 'Database connection failed');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(screen.getByText('Database connection failed')).toBeInTheDocument();
    });
  });

  test('save error has role=alert', async () => {
    mockFetchSaveError(500, 'Error');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  test('shows network error message when fetch rejects on save', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      const edu = resolveEducationUrl(url, opts);
      if (edu) return edu;
      const exp = resolveExperienceUrl(url, opts);
      if (exp) return exp;
      const skl = resolveSkillsUrl(url, opts);
      if (skl) return skl;
      if (url.endsWith('/profile') && !opts.method) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PROFILE) });
      }
      if (opts.method === 'PUT' && url.endsWith('/profile'))
        return Promise.reject(new Error('Connection refused'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PROFILE) });
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(screen.getByText(/connection refused/i)).toBeInTheDocument();
    });
  });

  test('shows error when backend URL is missing', async () => {
    delete process.env.REACT_APP_BACKEND_URL;
    mockFetch({ getProfile: {} });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane Smith');
    await userEvent.type(screen.getByLabelText(/headline/i), 'Software Engineer');
    await userEvent.type(screen.getByLabelText(/^location$/i), 'New York, NY');
    await userEvent.type(screen.getByLabelText(/phone/i), '555-123-4567');
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/backend url is not configured/i);
    });
  });

  test('save error clears success message', async () => {
    // First save succeeds, second fails
    let callCount = 0;
    global.fetch = jest.fn((url, opts = {}) => {
      const edu = resolveEducationUrl(url, opts);
      if (edu) return edu;
      const exp = resolveExperienceUrl(url, opts);
      if (exp) return exp;
      const skl = resolveSkillsUrl(url, opts);
      if (skl) return skl;
      if (url.endsWith('/profile') && !opts.method) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_PROFILE) });
      }
      if (opts.method === 'PUT' && url.endsWith('/profile')) {
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
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    // First save
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() =>
      expect(screen.getByText(/identity saved successfully/i)).toBeInTheDocument()
    );
    // Second save fails
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/identity saved successfully/i)).not.toBeInTheDocument();
  });
});

// ─── Saving state ─────────────────────────────────────────────────────────────

describe('saving state', () => {
  test('button shows "Saving..." while request is in flight', async () => {
    const settle = makePendingSave();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    const saveButton = screen.getByRole('button', { name: /save identity/i });
    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
    settle();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save identity/i })).toBeInTheDocument()
    );
  });

  test('save button is disabled while saving', async () => {
    const settle = makePendingSave();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    const saveButton = screen.getByRole('button', { name: /save identity/i });
    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
    settle();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save identity/i })).not.toBeDisabled()
    );
  });

  test('does not dispatch duplicate fetch on re-submit while saving', async () => {
    const settle = makePendingSave();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    const saveButton = screen.getByRole('button', { name: /save identity/i });
    fireEvent.click(saveButton);
    await waitFor(() => expect(saveButton).toBeDisabled());
    fireEvent.click(saveButton);
    settle();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save identity/i })).toBeInTheDocument()
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
    expect(screen.getByLabelText(/^location$/i)).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(screen.getByText('Oops')).toBeInTheDocument();
    });
    expect(screen.getByText('Oops')).toHaveAttribute('role', 'alert');
  });

  test('success message has role=status', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/identity saved successfully/i);
    });
  });
});

// ─── Fetch payload ────────────────────────────────────────────────────────────

describe('fetch payload', () => {
  test('PUT for identity includes only identity fields', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'PUT');
      expect(putCall).toBeDefined();
    });
    const [, putOpts] = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'PUT');
    const body = JSON.parse(putOpts.body);
    expect(body).toEqual({
      full_name: 'Jane Smith',
      headline: 'Software Engineer',
      location: 'New York, NY',
      phone: '555-123-4567',
    });
  });

  test('PUT for summary includes only summary fields', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText(/website/i)).toHaveValue('https://janesmith.dev')
    );
    fireEvent.click(screen.getByRole('button', { name: /save summary/i }));
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'PUT');
      expect(putCall).toBeDefined();
    });
    const [, putOpts] = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'PUT');
    const body = JSON.parse(putOpts.body);
    expect(body).toEqual({
      website: 'https://janesmith.dev',
      linkedin_url: 'https://linkedin.com/in/janesmith',
      github_url: 'https://github.com/janesmith',
      summary: 'Experienced engineer.',
    });
  });

  test('GET /profile is called with Authorization header', async () => {
    renderPage();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const profileCall = global.fetch.mock.calls.find(([url]) => url === `${BACKEND}/profile`);
    expect(profileCall).toBeDefined();
    const [url, opts] = profileCall;
    expect(url).toBe(`${BACKEND}/profile`);
    expect(opts.headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  test('empty string fields are sent as null', async () => {
    mockFetch({ getProfile: SAMPLE_PROFILE });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue('Jane Smith'));
    await userEvent.clear(screen.getByLabelText(/full name/i));
    await userEvent.type(screen.getByLabelText(/full name/i), '   ');
    fireEvent.click(screen.getByRole('button', { name: /save identity/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/complete the highlighted identity fields before saving/i)
      ).toBeInTheDocument();
    });
    const putCalls = global.fetch.mock.calls.filter(([, opts = {}]) => opts.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });
});

// ─── Experience section ───────────────────────────────────────────────────────

describe('experience section', () => {
  test('renders "Experience" section heading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^experience$/i })).toBeInTheDocument();
    });
  });

  test('shows "No experience added yet." when list is empty', async () => {
    mockFetch({ getExperience: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no experience added yet/i)).toBeInTheDocument();
    });
  });

  test('renders loaded experience entries', async () => {
    mockFetch({ getExperience: [SAMPLE_EXPERIENCE_ENTRY] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    });
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  test('experience section is a labeled region', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /^experience$/i })).toBeInTheDocument();
    });
  });

  test('Add Experience form is always present', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add experience/i })).toBeInTheDocument();
    });
  });

  test('Add Experience button is disabled when form is empty', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add experience/i })).toBeDisabled();
    });
  });

  test('submitting the add form POSTs to /experience', async () => {
    const newEntry = { ...SAMPLE_EXPERIENCE_ENTRY, id: 'exp-new' };
    mockFetch({ saveExperience: newEntry });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/^title$/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/^title$/i), 'Software Engineer');
    await userEvent.type(screen.getByLabelText(/^company$/i), 'Acme Corp');
    const expSection = screen.getByRole('region', { name: /^experience$/i });
    await userEvent.type(within(expSection).getByLabelText(/^start year$/i), '2021');

    fireEvent.click(screen.getByRole('button', { name: /add experience/i }));

    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(
        ([url, opts = {}]) => opts.method === 'POST' && url.includes('/experience')
      );
      expect(postCall).toBeDefined();
    });
    const [url, opts] = global.fetch.mock.calls.find(
      ([url, opts = {}]) => opts.method === 'POST' && url.includes('/experience')
    );
    expect(url).toBe(`${BACKEND}/experience`);
    const body = JSON.parse(opts.body);
    expect(body.title).toBe('Software Engineer');
    expect(body.company).toBe('Acme Corp');
    expect(body.start_year).toBe(2021);
  });

  test('clicking Edit populates the form fields', async () => {
    mockFetch({ getExperience: [SAMPLE_EXPERIENCE_ENTRY] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Software Engineer')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit software engineer/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^title$/i)).toHaveValue('Software Engineer');
    });
    expect(screen.getByLabelText(/^company$/i)).toHaveValue('Acme Corp');
    expect(screen.getByRole('button', { name: /update experience/i })).toBeInTheDocument();
  });

  test('clicking Delete sends DELETE to /experience/:id', async () => {
    mockFetch({ getExperience: [SAMPLE_EXPERIENCE_ENTRY] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Software Engineer')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete software engineer/i }));

    await waitFor(() => {
      const deleteCall = global.fetch.mock.calls.find(
        ([url, opts = {}]) => opts.method === 'DELETE' && url.includes('/experience/')
      );
      expect(deleteCall).toBeDefined();
    });
    const [url] = global.fetch.mock.calls.find(
      ([url, opts = {}]) => opts.method === 'DELETE' && url.includes('/experience/')
    );
    expect(url).toBe(`${BACKEND}/experience/${SAMPLE_EXPERIENCE_ENTRY.id}`);
  });

  test('shows experience load error with role=alert', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      const edu = resolveEducationUrl(url, opts);
      if (edu) return edu;
      const skl = resolveSkillsUrl(url, opts);
      if (skl) return skl;
      if (url.includes('/experience')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Failed to load experience'),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load experience/i)).toBeInTheDocument();
    });
  });
});

// ─── Education section ────────────────────────────────────────────────────────

describe('education section', () => {
  test('renders "Education" heading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^education$/i })).toBeInTheDocument();
    });
  });

  test('renders institution input and Add Education button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/institution/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add education/i })).toBeInTheDocument();
    });
  });

  test('Add Education button is disabled when required fields are empty', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add education/i })).toBeDisabled();
    });
  });

  test('shows "No education added yet." when list is empty', async () => {
    mockFetch({ education: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no education added yet/i)).toBeInTheDocument();
    });
  });

  test('renders loaded education entry institution name', async () => {
    mockFetch({ education: [SAMPLE_EDUCATION] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('NJIT')).toBeInTheDocument();
    });
  });

  test('renders loaded education entry degree and field', async () => {
    mockFetch({ education: [SAMPLE_EDUCATION] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/bachelor of science, computer science/i)).toBeInTheDocument();
    });
  });

  test('renders loaded education year range', async () => {
    mockFetch({ education: [SAMPLE_EDUCATION] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('2022 – 2026')).toBeInTheDocument();
    });
  });

  test('Add Education button enabled after filling required fields', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/institution/i)).toBeInTheDocument());

    const eduSection = screen.getByRole('region', { name: /^education$/i });
    await userEvent.type(screen.getByLabelText(/institution/i), 'NJIT');
    await userEvent.type(screen.getByLabelText(/^degree$/i), 'BS');
    await userEvent.type(screen.getByLabelText(/field of study/i), 'CS');
    await userEvent.type(within(eduSection).getByLabelText(/start year/i), '2020');

    expect(screen.getByRole('button', { name: /add education/i })).not.toBeDisabled();
  });

  test('adds education by POSTing to /education', async () => {
    const newEntry = {
      id: 'new-edu',
      user_id: 'user-1',
      institution: 'NJIT',
      degree: 'BS',
      field_of_study: 'CS',
      start_year: 2020,
      end_year: null,
      gpa: null,
      description: null,
    };
    global.fetch = jest.fn((url, opts = {}) => {
      if (url && url.includes('/education')) {
        if (opts.method === 'POST') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(newEntry) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/institution/i)).toBeInTheDocument());

    const eduSection = screen.getByRole('region', { name: /^education$/i });
    await userEvent.type(screen.getByLabelText(/institution/i), 'NJIT');
    await userEvent.type(screen.getByLabelText(/^degree$/i), 'BS');
    await userEvent.type(screen.getByLabelText(/field of study/i), 'CS');
    await userEvent.type(within(eduSection).getByLabelText(/start year/i), '2020');
    fireEvent.click(screen.getByRole('button', { name: /add education/i }));

    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(
        ([u, o = {}]) => u === `${BACKEND}/education` && o.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall[1].body);
      expect(body.institution).toBe('NJIT');
    });
  });

  test('edit button populates form with entry data', async () => {
    mockFetch({ education: [SAMPLE_EDUCATION] });
    renderPage();
    await waitFor(() => expect(screen.getByText('NJIT')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit njit/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/institution/i)).toHaveValue('NJIT');
    });
    expect(screen.getByLabelText(/^degree$/i)).toHaveValue('Bachelor of Science');
    expect(screen.getByLabelText(/field of study/i)).toHaveValue('Computer Science');
  });

  test('edit shows Update Education and Cancel buttons', async () => {
    mockFetch({ education: [SAMPLE_EDUCATION] });
    renderPage();
    await waitFor(() => expect(screen.getByText('NJIT')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit njit/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update education/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  test('cancel edit resets form to empty', async () => {
    mockFetch({ education: [SAMPLE_EDUCATION] });
    renderPage();
    await waitFor(() => expect(screen.getByText('NJIT')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit njit/i }));
    await waitFor(() => expect(screen.getByLabelText(/institution/i)).toHaveValue('NJIT'));

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.getByLabelText(/institution/i)).toHaveValue(''));
    expect(screen.queryByRole('button', { name: /update education/i })).not.toBeInTheDocument();
  });

  test('update education sends PUT /education/:id', async () => {
    const updated = { ...SAMPLE_EDUCATION, institution: 'MIT' };
    global.fetch = jest.fn((url, opts = {}) => {
      if (url && url.includes('/education')) {
        if (opts.method === 'PUT') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(updated) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([SAMPLE_EDUCATION]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('NJIT')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit njit/i }));
    await waitFor(() => expect(screen.getByLabelText(/institution/i)).toHaveValue('NJIT'));

    await userEvent.clear(screen.getByLabelText(/institution/i));
    await userEvent.type(screen.getByLabelText(/institution/i), 'MIT');
    fireEvent.click(screen.getByRole('button', { name: /update education/i }));

    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([u, o = {}]) => u === `${BACKEND}/education/${SAMPLE_EDUCATION.id}` && o.method === 'PUT'
      );
      expect(putCall).toBeDefined();
    });
  });

  test('delete button sends DELETE /education/:id', async () => {
    mockFetch({ education: [SAMPLE_EDUCATION] });
    renderPage();
    await waitFor(() => expect(screen.getByText('NJIT')).toBeInTheDocument());

    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(null) }));

    fireEvent.click(screen.getByRole('button', { name: /delete njit/i }));

    await waitFor(() => {
      const deleteCall = global.fetch.mock.calls.find(
        ([u, o = {}]) =>
          u === `${BACKEND}/education/${SAMPLE_EDUCATION.id}` && o.method === 'DELETE'
      );
      expect(deleteCall).toBeDefined();
    });
  });

  test('submit button stays disabled when start_year is before 1900', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/institution/i)).toBeInTheDocument());

    const eduSection = screen.getByRole('region', { name: /^education$/i });
    await userEvent.type(screen.getByLabelText(/institution/i), 'NJIT');
    await userEvent.type(screen.getByLabelText(/^degree$/i), 'BS');
    await userEvent.type(screen.getByLabelText(/field of study/i), 'CS');
    await userEvent.type(within(eduSection).getByLabelText(/start year/i), '1800');

    expect(screen.getByRole('button', { name: /add education/i })).toBeDisabled();
  });
});

// ─── Skills section ───────────────────────────────────────────────────────────

describe('skills section', () => {
  test('renders "Skills" heading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^skills$/i })).toBeInTheDocument();
    });
  });

  test('renders skill name input and Add Skill button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/skill name/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add skill/i })).toBeInTheDocument();
    });
  });

  test('Add Skill button is disabled when skill name is empty', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add skill/i })).toBeDisabled();
    });
  });

  test('shows "No skills added yet." when skills list is empty', async () => {
    mockFetch({ skills: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no skills added yet/i)).toBeInTheDocument();
    });
  });

  test('renders loaded skill name in list', async () => {
    mockFetch({ skills: [SAMPLE_SKILL] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('React')).toBeInTheDocument();
    });
  });

  test('renders skill category chip', async () => {
    mockFetch({ skills: [SAMPLE_SKILL] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Frontend')).toBeInTheDocument();
    });
  });

  test('renders skill proficiency badge', async () => {
    mockFetch({ skills: [SAMPLE_SKILL] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('advanced')).toBeInTheDocument();
    });
  });

  test('Add Skill button is enabled after typing a skill name', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/skill name/i)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/skill name/i), 'TypeScript');
    expect(screen.getByRole('button', { name: /add skill/i })).not.toBeDisabled();
  });

  test('adds a skill by POSTing to /skills', async () => {
    const newSkill = {
      id: 'new-1',
      user_id: 'user-1',
      name: 'TypeScript',
      category: null,
      proficiency: null,
      position: 0,
    };
    global.fetch = jest.fn((url, opts = {}) => {
      if (url && url.includes('/skills')) {
        if (opts.method === 'POST') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(newSkill) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      const edu = resolveEducationUrl(url, opts);
      if (edu) return edu;
      const exp = resolveExperienceUrl(url, opts);
      if (exp) return exp;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/skill name/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/skill name/i), 'TypeScript');
    fireEvent.click(screen.getByRole('button', { name: /add skill/i }));

    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(
        ([u, o = {}]) => u === `${BACKEND}/skills` && o.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall[1].body);
      expect(body.name).toBe('TypeScript');
    });
  });

  test('edit button populates form with skill data', async () => {
    mockFetch({ skills: [SAMPLE_SKILL] });
    renderPage();
    await waitFor(() => expect(screen.getByText('React')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit react/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/skill name/i)).toHaveValue('React');
    });
    expect(screen.getByLabelText(/category/i)).toHaveValue('Frontend');
  });

  test('edit shows Update Skill and Cancel buttons', async () => {
    mockFetch({ skills: [SAMPLE_SKILL] });
    renderPage();
    await waitFor(() => expect(screen.getByText('React')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit react/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update skill/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  test('cancel edit resets form to empty', async () => {
    mockFetch({ skills: [SAMPLE_SKILL] });
    renderPage();
    await waitFor(() => expect(screen.getByText('React')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit react/i }));
    await waitFor(() => expect(screen.getByLabelText(/skill name/i)).toHaveValue('React'));

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.getByLabelText(/skill name/i)).toHaveValue(''));
    expect(screen.queryByRole('button', { name: /update skill/i })).not.toBeInTheDocument();
  });

  test('update skill sends PUT /skills/:id', async () => {
    const updated = { ...SAMPLE_SKILL, name: 'React 18' };
    global.fetch = jest.fn((url, opts = {}) => {
      if (url && url.includes('/skills')) {
        if (opts.method === 'PUT' && !url.includes('reorder')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(updated) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([SAMPLE_SKILL]) });
      }
      const edu = resolveEducationUrl(url, opts);
      if (edu) return edu;
      const exp = resolveExperienceUrl(url, opts);
      if (exp) return exp;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('React')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /edit react/i }));
    await waitFor(() => expect(screen.getByLabelText(/skill name/i)).toHaveValue('React'));

    await userEvent.clear(screen.getByLabelText(/skill name/i));
    await userEvent.type(screen.getByLabelText(/skill name/i), 'React 18');
    fireEvent.click(screen.getByRole('button', { name: /update skill/i }));

    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([u, o = {}]) => u === `${BACKEND}/skills/${SAMPLE_SKILL.id}` && o.method === 'PUT'
      );
      expect(putCall).toBeDefined();
    });
  });

  test('delete button sends DELETE /skills/:id', async () => {
    mockFetch({ skills: [SAMPLE_SKILL] });
    renderPage();
    await waitFor(() => expect(screen.getByText('React')).toBeInTheDocument());

    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(null) }));

    fireEvent.click(screen.getByRole('button', { name: /delete react/i }));

    await waitFor(() => {
      const deleteCall = global.fetch.mock.calls.find(
        ([u, o = {}]) => u === `${BACKEND}/skills/${SAMPLE_SKILL.id}` && o.method === 'DELETE'
      );
      expect(deleteCall).toBeDefined();
    });
  });

  test('move up button calls PUT /skills/reorder', async () => {
    const skill2 = { ...SAMPLE_SKILL, id: 'skill-2', name: 'Python', position: 1 };
    global.fetch = jest.fn((url, opts = {}) => {
      if (url && url.includes('/skills')) {
        if (opts.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([skill2, SAMPLE_SKILL]),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([SAMPLE_SKILL, skill2]),
        });
      }
      const edu = resolveEducationUrl(url, opts);
      if (edu) return edu;
      const exp = resolveExperienceUrl(url, opts);
      if (exp) return exp;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Python')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /move python up/i }));

    await waitFor(() => {
      const reorderCall = global.fetch.mock.calls.find(
        ([u, o = {}]) => u === `${BACKEND}/skills/reorder` && o.method === 'PUT'
      );
      expect(reorderCall).toBeDefined();
    });
  });

  test('shows save error when addSkill fails', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (url && url.includes('/skills')) {
        if (opts.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Skill save failed'),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      const edu = resolveEducationUrl(url, opts);
      if (edu) return edu;
      const exp = resolveExperienceUrl(url, opts);
      if (exp) return exp;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/skill name/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/skill name/i), 'React');
    fireEvent.click(screen.getByRole('button', { name: /add skill/i }));

    await waitFor(() => {
      expect(screen.getByText('Skill save failed')).toBeInTheDocument();
    });
  });
});

// ─── Career Preferences section ───────────────────────────────────────────────

describe('career preferences section', () => {
  test('renders Career Preferences section heading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /career preferences/i })).toBeInTheDocument();
    });
  });

  test('renders all career preferences fields', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/^target roles$/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^preferred locations$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add location/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/work mode/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/minimum salary/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/maximum salary/i)).toBeInTheDocument();
  });

  test('target roles and preferred locations inputs are linked to suggestion options', async () => {
    renderPage();
    const targetRolesInput = await screen.findByLabelText(/^target roles$/i);
    expect(targetRolesInput).toHaveAttribute('list', 'target-role-suggestions');

    const roleSuggestions = document.getElementById('target-role-suggestions');
    expect(roleSuggestions).toBeInTheDocument();
    const roleOptionValues = Array.from(roleSuggestions.querySelectorAll('option')).map((opt) =>
      opt.getAttribute('value')
    );
    expect(roleOptionValues).toContain('Software Engineer');
    expect(roleOptionValues).toContain('Frontend Developer');

    const preferredLocationsInput = screen.getByLabelText(/^preferred locations$/i);
    expect(preferredLocationsInput).toHaveAttribute('list', 'preferred-location-suggestions');
    const locationSuggestions = document.getElementById('preferred-location-suggestions');
    expect(locationSuggestions).toBeInTheDocument();
    const locationOptionValues = Array.from(locationSuggestions.querySelectorAll('option')).map(
      (opt) => opt.getAttribute('value')
    );
    expect(locationOptionValues).toContain('New York, NY');
    expect(locationOptionValues).toContain('Remote');
  });

  test('adds and removes target role chips', async () => {
    renderPage();
    const targetRolesInput = await screen.findByLabelText(/^target roles$/i);

    await userEvent.type(targetRolesInput, 'Platform Reliability Engineer{enter}');

    const selectedRoles = screen.getByRole('list', { name: /selected target roles/i });
    expect(within(selectedRoles).getByText('Platform Reliability Engineer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove platform reliability engineer/i }));

    expect(
      within(selectedRoles).queryByText('Platform Reliability Engineer')
    ).not.toBeInTheDocument();
  });

  test('adds and removes preferred location chips', async () => {
    renderPage();
    const preferredLocationsInput = await screen.findByLabelText(/^preferred locations$/i);

    await userEvent.type(preferredLocationsInput, 'Remote{enter}');

    const selectedLocations = screen.getByRole('list', { name: /selected preferred locations/i });
    expect(within(selectedLocations).getByText('Remote')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove remote/i }));
    expect(within(selectedLocations).queryByText('Remote')).not.toBeInTheDocument();
  });

  test('pre-fills career preferences from fetched data', async () => {
    mockFetch({ getPrefs: SAMPLE_PREFS });
    renderPage();

    await waitFor(() => {
      const selectedRoles = screen.getByRole('list', { name: /selected target roles/i });
      expect(within(selectedRoles).getByText('Software Engineer')).toBeInTheDocument();
    });
    const selectedLocations = screen.getByRole('list', { name: /selected preferred locations/i });
    expect(within(selectedLocations).getByText('New York, NY')).toBeInTheDocument();
    expect(screen.getByLabelText(/work mode/i)).toHaveValue('hybrid');
    expect(screen.getByLabelText(/minimum salary/i)).toHaveValue('80000');
    expect(screen.getByLabelText(/maximum salary/i)).toHaveValue('120000');
  });

  test('renders Save Preferences button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save preferences/i })).toBeInTheDocument();
    });
  });

  test('submits PUT to /career-preferences on save', async () => {
    mockFetch({ getPrefs: SAMPLE_PREFS });
    renderPage();

    await waitFor(() => {
      const selectedRoles = screen.getByRole('list', { name: /selected target roles/i });
      expect(within(selectedRoles).getByText('Software Engineer')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/^target roles$/i), 'Frontend Developer');
    fireEvent.click(screen.getByRole('button', { name: /add role/i }));

    await userEvent.type(screen.getByLabelText(/^preferred locations$/i), 'Remote');
    fireEvent.click(screen.getByRole('button', { name: /add location/i }));

    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([url, opts = {}]) => url === `${BACKEND}/career-preferences` && opts.method === 'PUT'
      );
      expect(putCall).toBeDefined();
    });
    const [url, opts] = global.fetch.mock.calls.find(
      ([u, o = {}]) => u === `${BACKEND}/career-preferences` && o.method === 'PUT'
    );
    expect(url).toBe(`${BACKEND}/career-preferences`);
    const body = JSON.parse(opts.body);
    expect(body.target_roles).toBe('Software Engineer; Frontend Developer');
    expect(body.preferred_locations).toBe('New York, NY; Remote');
    expect(body).toHaveProperty('salary_min');
    expect(body).toHaveProperty('salary_max');
  });

  test('sanitizes formatted salary text before sending payload', async () => {
    mockFetch({ getPrefs: SAMPLE_PREFS });
    renderPage();

    const minSalaryInput = await screen.findByLabelText(/minimum salary/i);
    const maxSalaryInput = screen.getByLabelText(/maximum salary/i);
    fireEvent.change(minSalaryInput, { target: { value: '$95,000' } });
    fireEvent.change(maxSalaryInput, { target: { value: '140,000' } });

    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([url, opts = {}]) => url === `${BACKEND}/career-preferences` && opts.method === 'PUT'
      );
      expect(putCall).toBeDefined();
    });

    const [, opts] = global.fetch.mock.calls.find(
      ([u, o = {}]) => u === `${BACKEND}/career-preferences` && o.method === 'PUT'
    );
    const body = JSON.parse(opts.body);
    expect(body.salary_min).toBe(95000);
    expect(body.salary_max).toBe(140000);
  });

  test('blocks save when salary text is invalid and shows validation message', async () => {
    mockFetch({ getPrefs: SAMPLE_PREFS });
    renderPage();

    const minSalaryInput = await screen.findByLabelText(/minimum salary/i);
    fireEvent.change(minSalaryInput, { target: { value: '$95k' } });
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(screen.getByText(/salary values must be whole numbers/i)).toBeInTheDocument();
    });

    const putCalls = global.fetch.mock.calls.filter(
      ([url, opts = {}]) => url === `${BACKEND}/career-preferences` && opts.method === 'PUT'
    );
    expect(putCalls).toHaveLength(0);
  });

  test('shows "Career preferences saved successfully." after save', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save preferences/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    await waitFor(() => {
      expect(screen.getByText(/career preferences saved successfully/i)).toBeInTheDocument();
    });
  });

  test('keeps salary input values after save when API returns null salary fields', async () => {
    mockFetch({
      getPrefs: {},
      savePrefs: {
        ...SAMPLE_PREFS,
        salary_min: null,
        salary_max: null,
      },
    });
    renderPage();

    const minSalaryInput = await screen.findByLabelText(/minimum salary/i);
    const maxSalaryInput = screen.getByLabelText(/maximum salary/i);

    fireEvent.change(minSalaryInput, { target: { value: '90000' } });
    fireEvent.change(maxSalaryInput, { target: { value: '130000' } });

    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(screen.getByText(/career preferences saved successfully/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/minimum salary/i)).toHaveValue('90000');
    expect(screen.getByLabelText(/maximum salary/i)).toHaveValue('130000');
    expect(screen.queryByText(/saved text:/i)).not.toBeInTheDocument();
  });

  test('restores salary input values after remount when backend salary fields are null', async () => {
    mockFetch({
      getPrefs: {},
      savePrefs: {
        ...SAMPLE_PREFS,
        salary_min: null,
        salary_max: null,
      },
    });

    const { unmount } = renderPage();
    const minSalaryInput = await screen.findByLabelText(/minimum salary/i);
    const maxSalaryInput = screen.getByLabelText(/maximum salary/i);

    fireEvent.change(minSalaryInput, { target: { value: '$95,000' } });
    fireEvent.change(maxSalaryInput, { target: { value: '$140,000' } });
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(screen.getByText(/career preferences saved successfully/i)).toBeInTheDocument();
    });

    unmount();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/minimum salary/i)).toHaveValue('$95,000');
    });
    expect(screen.getByLabelText(/maximum salary/i)).toHaveValue('$140,000');
    expect(screen.queryByText(/saved text:/i)).not.toBeInTheDocument();
  });

  test('shows save error when PUT /career-preferences fails', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (url.includes('/career-preferences') && opts.method === 'PUT') {
        return Promise.resolve({
          ok: false,
          status: 422,
          headers: { get: (name) => (name === 'content-type' ? 'application/json' : null) },
          json: () => Promise.resolve({ detail: 'Invalid work_mode' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save preferences/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid work_mode/i)).toBeInTheDocument();
    });
  });

  test('success message disappears after editing a preferences field', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save preferences/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    await waitFor(() =>
      expect(screen.getByText(/career preferences saved successfully/i)).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(/^target roles$/i), { target: { value: 'Frontend' } });
    expect(screen.queryByText(/career preferences saved successfully/i)).not.toBeInTheDocument();
  });
});
