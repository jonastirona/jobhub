import { act, renderHook, waitFor } from '@testing-library/react';
import { useEducation } from './useEducation';

const BACKEND = 'http://localhost:8000';
const ACCESS_TOKEN = 'test-token';

const sampleEducation = {
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

const sampleEducation2 = {
  id: 'edu-2',
  user_id: 'user-1',
  institution: 'Community College',
  degree: 'Associate of Arts',
  field_of_study: 'General Studies',
  start_year: 2020,
  end_year: 2022,
  gpa: null,
  description: null,
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
  mockFetchOk([sampleEducation]);
  process.env.REACT_APP_BACKEND_URL = BACKEND;
});

afterEach(() => {
  delete process.env.REACT_APP_BACKEND_URL;
});

// ─── Fetching ─────────────────────────────────────────────────────────────────

test('fetches education on mount', async () => {
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.education).toEqual([sampleEducation]);
  expect(result.current.error).toBeNull();
});

test('calls GET /education with authorization header', async () => {
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/education`,
    expect.objectContaining({
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    })
  );
});

test('returns empty array when no education exists', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.education).toEqual([]);
});

test('sets error when fetch fails', async () => {
  mockFetchError(500, 'Internal error');
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toMatch(/500/);
  expect(result.current.education).toEqual([]);
});

test('skips fetch when no access token', async () => {
  const { result } = renderHook(() => useEducation(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).not.toHaveBeenCalled();
  expect(result.current.education).toEqual([]);
});

test('skips fetch when no backend URL', async () => {
  delete process.env.REACT_APP_BACKEND_URL;
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).not.toHaveBeenCalled();
});

// ─── addEducation ─────────────────────────────────────────────────────────────

test('addEducation POSTs to /education and prepends to state', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(sampleEducation) })
  );

  let saved;
  await act(async () => {
    saved = await result.current.addEducation({
      institution: 'NJIT',
      degree: 'Bachelor of Science',
      field_of_study: 'Computer Science',
      start_year: 2022,
    });
  });

  expect(saved).toBe(true);
  expect(result.current.education).toContainEqual(sampleEducation);
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/education`,
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    })
  );
});

test('addEducation sets saveError on failure', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  mockFetchError(422, 'start_year must be 1900 or later');
  let saved;
  await act(async () => {
    saved = await result.current.addEducation({
      institution: 'X',
      degree: 'Y',
      field_of_study: 'Z',
      start_year: 1800,
    });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

test('addEducation returns false when no backend URL', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  delete process.env.REACT_APP_BACKEND_URL;
  let saved;
  await act(async () => {
    saved = await result.current.addEducation({
      institution: 'NJIT',
      degree: 'BS',
      field_of_study: 'CS',
      start_year: 2022,
    });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

// ─── updateEducation ──────────────────────────────────────────────────────────

test('updateEducation PUTs to /education/:id and updates state', async () => {
  mockFetchOk([sampleEducation]);
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  const updated = { ...sampleEducation, institution: 'MIT' };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(updated) }));

  let saved;
  await act(async () => {
    saved = await result.current.updateEducation(sampleEducation.id, { institution: 'MIT' });
  });

  expect(saved).toBe(true);
  expect(result.current.education[0].institution).toBe('MIT');
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/education/${sampleEducation.id}`,
    expect.objectContaining({ method: 'PUT' })
  );
});

test('updateEducation sets saveError on failure', async () => {
  mockFetchOk([sampleEducation]);
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  mockFetchError(404, 'Education entry not found');
  let saved;
  await act(async () => {
    saved = await result.current.updateEducation('nonexistent-id', { institution: 'X' });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

// ─── deleteEducation ──────────────────────────────────────────────────────────

test('deleteEducation DELETEs /education/:id and removes from state', async () => {
  mockFetchOk([sampleEducation, sampleEducation2]);
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(null) }));

  let deleted;
  await act(async () => {
    deleted = await result.current.deleteEducation(sampleEducation.id);
  });

  expect(deleted).toBe(true);
  expect(result.current.education.find((e) => e.id === sampleEducation.id)).toBeUndefined();
  expect(result.current.education).toHaveLength(1);
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/education/${sampleEducation.id}`,
    expect.objectContaining({ method: 'DELETE' })
  );
});

test('deleteEducation sets saveError on failure', async () => {
  mockFetchOk([sampleEducation]);
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  mockFetchError(404, 'Education entry not found');
  let deleted;
  await act(async () => {
    deleted = await result.current.deleteEducation('nonexistent-id');
  });

  expect(deleted).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

// ─── saving flag ──────────────────────────────────────────────────────────────

test('saving is true while addEducation request is in flight', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useEducation(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let resolveSave;
  global.fetch = jest.fn(
    () =>
      new Promise((res) => {
        resolveSave = res;
      })
  );

  act(() => {
    result.current.addEducation({
      institution: 'NJIT',
      degree: 'BS',
      field_of_study: 'CS',
      start_year: 2022,
    });
  });
  await waitFor(() => expect(result.current.saving).toBe(true));

  await act(async () => {
    resolveSave({ ok: true, json: () => Promise.resolve(sampleEducation) });
  });
  await waitFor(() => expect(result.current.saving).toBe(false));
});
