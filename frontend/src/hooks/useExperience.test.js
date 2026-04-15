import { act, renderHook, waitFor } from '@testing-library/react';
import { useExperience } from './useExperience';

const BACKEND = 'http://localhost:8000';
const ACCESS_TOKEN = 'test-token';

const SAMPLE_EXPERIENCE = [
  {
    id: 'exp-1',
    user_id: 'user-1',
    title: 'Software Engineer',
    company: 'Acme Corp',
    location: 'New York, NY',
    start_year: 2021,
    end_year: null,
    description: 'Built cool stuff.',
    position: 0,
  },
  {
    id: 'exp-2',
    user_id: 'user-1',
    title: 'Junior Developer',
    company: 'Startup Inc',
    location: null,
    start_year: 2019,
    end_year: 2021,
    description: null,
    position: 1,
  },
];

const NEW_EXPERIENCE = {
  title: 'Staff Engineer',
  company: 'BigCo',
  location: 'Remote',
  start_year: 2024,
  end_year: null,
  description: 'Leading platform work.',
};

const CREATED_EXPERIENCE = {
  id: 'exp-3',
  user_id: 'user-1',
  ...NEW_EXPERIENCE,
  position: 2,
};

function mockFetchOk(body) {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
}

function mockFetchError(status = 500, text = 'Server error') {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status,
      headers: { get: () => 'text/plain' },
      text: () => Promise.resolve(text),
    })
  );
}

function mockFetchNetworkError(message = 'Network failure') {
  global.fetch = jest.fn(() => Promise.reject(new Error(message)));
}

const savedBackendUrl = process.env.REACT_APP_BACKEND_URL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REACT_APP_BACKEND_URL = BACKEND;
  mockFetchOk(SAMPLE_EXPERIENCE);
});

afterEach(() => {
  if (savedBackendUrl === undefined) {
    delete process.env.REACT_APP_BACKEND_URL;
  } else {
    process.env.REACT_APP_BACKEND_URL = savedBackendUrl;
  }
});

// ─── Fetching ─────────────────────────────────────────────────────────────────

describe('fetching', () => {
  test('fetches experience list on mount', async () => {
    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(global.fetch).toHaveBeenCalledWith(
      `${BACKEND}/experience`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${ACCESS_TOKEN}` }),
      })
    );
    expect(result.current.experience).toEqual(SAMPLE_EXPERIENCE);
    expect(result.current.error).toBeNull();
  });

  test('starts in loading state', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    expect(result.current.loading).toBe(true);
  });

  test('sets error on failed GET response', async () => {
    mockFetchError(500, 'Internal Server Error');
    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/500/);
    expect(result.current.experience).toEqual([]);
  });

  test('sets error on network failure', async () => {
    mockFetchNetworkError('No connection');
    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('No connection');
  });

  test('does not fetch when accessToken is missing', () => {
    renderHook(() => useExperience(null));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not fetch when backend URL is not set', () => {
    delete process.env.REACT_APP_BACKEND_URL;
    renderHook(() => useExperience(ACCESS_TOKEN));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sets loading false and empty list when no token', async () => {
    const { result } = renderHook(() => useExperience(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.experience).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

// ─── addExperience ────────────────────────────────────────────────────────────

describe('addExperience', () => {
  test('POSTs to /experience with correct body and auth header', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CREATED_EXPERIENCE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.addExperience(NEW_EXPERIENCE);
    });

    expect(success).toBe(true);
    const postCall = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'POST');
    expect(postCall[0]).toBe(`${BACKEND}/experience`);
    expect(postCall[1].headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(JSON.parse(postCall[1].body)).toEqual(NEW_EXPERIENCE);
  });

  test('appends created entry to experience list', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CREATED_EXPERIENCE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addExperience(NEW_EXPERIENCE);
    });

    expect(result.current.experience).toHaveLength(SAMPLE_EXPERIENCE.length + 1);
    expect(result.current.experience).toContainEqual(CREATED_EXPERIENCE);
  });

  test('returns false and sets saveError on POST failure', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 422,
          headers: { get: () => 'text/plain' },
          text: () => Promise.resolve('Validation error'),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.addExperience(NEW_EXPERIENCE);
    });

    expect(success).toBe(false);
    expect(result.current.saveError).toBe('Validation error');
  });

  test('returns false and sets saveError when no backend URL', async () => {
    delete process.env.REACT_APP_BACKEND_URL;
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.addExperience(NEW_EXPERIENCE);
    });

    expect(success).toBe(false);
    expect(result.current.saveError).toMatch(/backend url/i);
  });

  test('returns false and sets saveError when not authenticated', async () => {
    const { result } = renderHook(() => useExperience(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.addExperience(NEW_EXPERIENCE);
    });

    expect(success).toBe(false);
    expect(result.current.saveError).toMatch(/not authenticated/i);
  });

  test('clears saveError on successful add', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CREATED_EXPERIENCE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addExperience(NEW_EXPERIENCE);
    });

    expect(result.current.saveError).toBeNull();
  });

  test('extracts detail string from JSON error body', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 400,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ detail: 'end_year must be >= start_year' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addExperience(NEW_EXPERIENCE);
    });

    expect(result.current.saveError).toBe('end_year must be >= start_year');
  });
});

// ─── updateExperience ─────────────────────────────────────────────────────────

describe('updateExperience', () => {
  test('PUTs to /experience/:id with updated values', async () => {
    const updated = { ...SAMPLE_EXPERIENCE[0], title: 'Senior Engineer' };
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(updated) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.updateExperience('exp-1', { title: 'Senior Engineer' });
    });

    expect(success).toBe(true);
    const putCall = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'PUT');
    expect(putCall[0]).toBe(`${BACKEND}/experience/exp-1`);
    expect(putCall[1].headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  test('replaces the updated entry in experience list', async () => {
    const updated = { ...SAMPLE_EXPERIENCE[0], title: 'Senior Engineer' };
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(updated) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateExperience('exp-1', { title: 'Senior Engineer' });
    });

    const entry = result.current.experience.find((e) => e.id === 'exp-1');
    expect(entry.title).toBe('Senior Engineer');
    expect(result.current.experience).toHaveLength(SAMPLE_EXPERIENCE.length);
  });

  test('returns false and sets saveError on PUT failure', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'PUT') {
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => 'text/plain' },
          text: () => Promise.resolve('Not found'),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.updateExperience('exp-1', { title: 'X' });
    });

    expect(success).toBe(false);
    expect(result.current.saveError).toBe('Not found');
  });

  test('returns false and sets saveError when no backend URL', async () => {
    delete process.env.REACT_APP_BACKEND_URL;
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.updateExperience('exp-1', { title: 'X' });
    });

    expect(success).toBe(false);
    expect(result.current.saveError).toMatch(/backend url/i);
  });
});

// ─── deleteExperience ─────────────────────────────────────────────────────────

describe('deleteExperience', () => {
  test('sends DELETE to /experience/:id', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.deleteExperience('exp-1');
    });

    expect(success).toBe(true);
    const deleteCall = global.fetch.mock.calls.find(([, opts = {}]) => opts.method === 'DELETE');
    expect(deleteCall[0]).toBe(`${BACKEND}/experience/exp-1`);
    expect(deleteCall[1].headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  test('removes the entry from the list after delete', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteExperience('exp-1');
    });

    expect(result.current.experience.find((e) => e.id === 'exp-1')).toBeUndefined();
    expect(result.current.experience).toHaveLength(SAMPLE_EXPERIENCE.length - 1);
  });

  test('returns false and sets saveError on DELETE failure', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'DELETE') {
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: { get: () => 'text/plain' },
          text: () => Promise.resolve('Delete failed'),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.deleteExperience('exp-1');
    });

    expect(success).toBe(false);
    expect(result.current.saveError).toBe('Delete failed');
  });
});

// ─── reorderExperience ────────────────────────────────────────────────────────

describe('reorderExperience', () => {
  test('PUTs to /experience/reorder with ids array', async () => {
    const reordered = [...SAMPLE_EXPERIENCE].reverse();
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'PUT' && url.includes('reorder')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(reordered) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const ids = ['exp-2', 'exp-1'];
    let success;
    await act(async () => {
      success = await result.current.reorderExperience(ids);
    });

    expect(success).toBe(true);
    const putCall = global.fetch.mock.calls.find(
      ([url, opts = {}]) => opts.method === 'PUT' && url.includes('reorder')
    );
    expect(putCall[0]).toBe(`${BACKEND}/experience/reorder`);
    expect(JSON.parse(putCall[1].body)).toEqual({ ids });
  });

  test('replaces experience list with server-returned order', async () => {
    const reordered = [...SAMPLE_EXPERIENCE].reverse();
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'PUT' && url.includes('reorder')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(reordered) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reorderExperience(['exp-2', 'exp-1']);
    });

    expect(result.current.experience).toEqual(reordered);
  });

  test('returns false and sets saveError on reorder failure', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'PUT' && url.includes('reorder')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          headers: { get: () => 'text/plain' },
          text: () => Promise.resolve('IDs do not match'),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.reorderExperience(['exp-2', 'exp-1']);
    });

    expect(success).toBe(false);
    expect(result.current.saveError).toBe('IDs do not match');
  });

  test('returns false and sets saveError when not authenticated', async () => {
    const { result } = renderHook(() => useExperience(null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.reorderExperience(['exp-1', 'exp-2']);
    });

    expect(success).toBe(false);
    expect(result.current.saveError).toMatch(/not authenticated/i);
  });
});

// ─── saving state ─────────────────────────────────────────────────────────────

describe('saving state', () => {
  test('saving is true while POST is in flight', async () => {
    let resolvePost;
    const postPromise = new Promise((res) => {
      resolvePost = res;
    });
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') return postPromise;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addExperience(NEW_EXPERIENCE);
    });

    await waitFor(() => expect(result.current.saving).toBe(true));

    resolvePost({ ok: true, json: () => Promise.resolve(CREATED_EXPERIENCE) });
    await waitFor(() => expect(result.current.saving).toBe(false));
  });

  test('saving resets to false after successful mutation', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CREATED_EXPERIENCE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addExperience(NEW_EXPERIENCE);
    });

    expect(result.current.saving).toBe(false);
  });

  test('saving resets to false after failed mutation', async () => {
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: { get: () => 'text/plain' },
          text: () => Promise.resolve('Error'),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addExperience(NEW_EXPERIENCE);
    });

    expect(result.current.saving).toBe(false);
  });

  test('saveError clears on next mutation attempt', async () => {
    // First call fails
    let callCount = 0;
    global.fetch = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            headers: { get: () => 'text/plain' },
            text: () => Promise.resolve('First error'),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(CREATED_EXPERIENCE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE_EXPERIENCE) });
    });

    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addExperience(NEW_EXPERIENCE);
    });
    expect(result.current.saveError).toBe('First error');

    await act(async () => {
      await result.current.addExperience(NEW_EXPERIENCE);
    });
    expect(result.current.saveError).toBeNull();
  });
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  test('experience is empty array initially', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    expect(result.current.experience).toEqual([]);
  });

  test('saving is false initially', () => {
    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    expect(result.current.saving).toBe(false);
  });

  test('saveError is null initially', () => {
    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    expect(result.current.saveError).toBeNull();
  });

  test('error is null initially', () => {
    const { result } = renderHook(() => useExperience(ACCESS_TOKEN));
    expect(result.current.error).toBeNull();
  });
});
