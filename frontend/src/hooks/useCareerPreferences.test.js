import { act, renderHook, waitFor } from '@testing-library/react';
import { useCareerPreferences } from './useCareerPreferences';

const BACKEND = 'http://localhost:8000';
const ACCESS_TOKEN = 'test-token';

const samplePreferences = {
  id: 'pref-1',
  user_id: 'user-1',
  target_roles: 'Software Engineer',
  preferred_locations: 'New York, NY',
  work_mode: 'hybrid',
  salary_min: 80000,
  salary_max: 120000,
};

function mockFetchOk(body) {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
}

function mockFetchError(status = 500, text = 'Server error') {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status, text: () => Promise.resolve(text) })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchOk(samplePreferences);
  process.env.REACT_APP_BACKEND_URL = BACKEND;
});

afterEach(() => {
  delete process.env.REACT_APP_BACKEND_URL;
});

// ─── Fetching ─────────────────────────────────────────────────────────────────

test('fetches career preferences on mount', async () => {
  const { result } = renderHook(() => useCareerPreferences(ACCESS_TOKEN));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.preferences).toEqual(samplePreferences);
  expect(result.current.error).toBeNull();
});

test('calls correct endpoint with authorization header', async () => {
  const { result } = renderHook(() => useCareerPreferences(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/career-preferences`,
    expect.objectContaining({
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    })
  );
});

test('sets error when fetch fails', async () => {
  mockFetchError(500, 'Internal error');
  const { result } = renderHook(() => useCareerPreferences(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toMatch(/500/);
  expect(result.current.preferences).toBeNull();
});

test('skips fetch when no access token', async () => {
  const { result } = renderHook(() => useCareerPreferences(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).not.toHaveBeenCalled();
  expect(result.current.preferences).toBeNull();
});

test('skips fetch when no backend URL', async () => {
  delete process.env.REACT_APP_BACKEND_URL;
  const { result } = renderHook(() => useCareerPreferences(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).not.toHaveBeenCalled();
});

// ─── Saving ───────────────────────────────────────────────────────────────────

test('savePreferences sends PUT with payload and updates state', async () => {
  const updated = { ...samplePreferences, target_roles: 'Frontend Engineer' };
  mockFetchOk(samplePreferences);
  const { result } = renderHook(() => useCareerPreferences(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  mockFetchOk(updated);
  let saved;
  await act(async () => {
    saved = await result.current.savePreferences({ target_roles: 'Frontend Engineer' });
  });

  expect(saved).toBe(true);
  expect(result.current.preferences).toEqual(updated);
  expect(global.fetch).toHaveBeenLastCalledWith(
    `${BACKEND}/career-preferences`,
    expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    })
  );
});

test('savePreferences sets saveError on failure', async () => {
  mockFetchOk(samplePreferences);
  const { result } = renderHook(() => useCareerPreferences(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  mockFetchError(422, 'Invalid work_mode');
  let saved;
  await act(async () => {
    saved = await result.current.savePreferences({ work_mode: 'invalid' });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

test('savePreferences returns false when no backend URL', async () => {
  mockFetchOk(samplePreferences);
  const { result } = renderHook(() => useCareerPreferences(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  delete process.env.REACT_APP_BACKEND_URL;
  let saved;
  await act(async () => {
    saved = await result.current.savePreferences({ target_roles: 'Engineer' });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

test('savePreferences returns false when no access token', async () => {
  const { result } = renderHook(() => useCareerPreferences(null));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let saved;
  await act(async () => {
    saved = await result.current.savePreferences({ target_roles: 'Engineer' });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

test('saving is true while request is in flight', async () => {
  mockFetchOk(samplePreferences);
  const { result } = renderHook(() => useCareerPreferences(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let resolveSave;
  global.fetch = jest.fn(
    () =>
      new Promise((res) => {
        resolveSave = res;
      })
  );

  act(() => {
    result.current.savePreferences({ target_roles: 'Engineer' });
  });
  await waitFor(() => expect(result.current.saving).toBe(true));

  await act(async () => {
    resolveSave({ ok: true, json: () => Promise.resolve(samplePreferences) });
  });
  await waitFor(() => expect(result.current.saving).toBe(false));
});
