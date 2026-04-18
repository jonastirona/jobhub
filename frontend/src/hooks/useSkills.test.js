import { act, renderHook, waitFor } from '@testing-library/react';
import { useSkills } from './useSkills';

const BACKEND = 'http://localhost:8000';
const ACCESS_TOKEN = 'test-token';

const sampleSkill = {
  id: 'skill-1',
  user_id: 'user-1',
  name: 'React',
  category: 'Frontend',
  proficiency: 'advanced',
  position: 0,
};

const sampleSkill2 = {
  id: 'skill-2',
  user_id: 'user-1',
  name: 'Python',
  category: 'Backend',
  proficiency: 'intermediate',
  position: 1,
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
  mockFetchOk([sampleSkill]);
  process.env.REACT_APP_BACKEND_URL = BACKEND;
});

afterEach(() => {
  delete process.env.REACT_APP_BACKEND_URL;
});

// ─── Fetching ─────────────────────────────────────────────────────────────────

test('fetches skills on mount', async () => {
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.skills).toEqual([sampleSkill]);
  expect(result.current.error).toBeNull();
});

test('calls GET /skills with authorization header', async () => {
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/skills`,
    expect.objectContaining({
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    })
  );
});

test('returns empty array when no skills exist', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.skills).toEqual([]);
});

test('sets error when fetch fails', async () => {
  mockFetchError(500, 'Internal error');
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toMatch(/500/);
  expect(result.current.skills).toEqual([]);
});

test('skips fetch when no access token', async () => {
  const { result } = renderHook(() => useSkills(null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).not.toHaveBeenCalled();
  expect(result.current.skills).toEqual([]);
});

test('skips fetch when no backend URL', async () => {
  delete process.env.REACT_APP_BACKEND_URL;
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(global.fetch).not.toHaveBeenCalled();
});

// ─── addSkill ─────────────────────────────────────────────────────────────────

test('addSkill POSTs to /skills and appends to state', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  const newSkill = { ...sampleSkill };
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(newSkill) })
  );

  let saved;
  await act(async () => {
    saved = await result.current.addSkill({ name: 'React', category: 'Frontend' });
  });

  expect(saved).toBe(true);
  expect(result.current.skills).toContainEqual(newSkill);
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/skills`,
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    })
  );
});

test('addSkill sets saveError on failure', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  mockFetchError(422, 'Invalid proficiency');
  let saved;
  await act(async () => {
    saved = await result.current.addSkill({ name: 'React', proficiency: 'invalid' });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

test('addSkill returns false when no backend URL', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  delete process.env.REACT_APP_BACKEND_URL;
  let saved;
  await act(async () => {
    saved = await result.current.addSkill({ name: 'React' });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

test('addSkill returns false when no access token', async () => {
  const { result } = renderHook(() => useSkills(null));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let saved;
  await act(async () => {
    saved = await result.current.addSkill({ name: 'React' });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

// ─── updateSkill ──────────────────────────────────────────────────────────────

test('updateSkill PUTs to /skills/:id and updates state', async () => {
  mockFetchOk([sampleSkill]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  const updated = { ...sampleSkill, name: 'React 18' };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(updated) }));

  let saved;
  await act(async () => {
    saved = await result.current.updateSkill(sampleSkill.id, { name: 'React 18' });
  });

  expect(saved).toBe(true);
  expect(result.current.skills[0].name).toBe('React 18');
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/skills/${sampleSkill.id}`,
    expect.objectContaining({ method: 'PUT' })
  );
});

test('updateSkill sets saveError on failure', async () => {
  mockFetchOk([sampleSkill]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  mockFetchError(404, 'Skill not found');
  let saved;
  await act(async () => {
    saved = await result.current.updateSkill('nonexistent-id', { name: 'X' });
  });

  expect(saved).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

// ─── deleteSkill ──────────────────────────────────────────────────────────────

test('deleteSkill DELETEs /skills/:id and removes from state', async () => {
  mockFetchOk([sampleSkill, sampleSkill2]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(null) }));

  let deleted;
  await act(async () => {
    deleted = await result.current.deleteSkill(sampleSkill.id);
  });

  expect(deleted).toBe(true);
  expect(result.current.skills.find((s) => s.id === sampleSkill.id)).toBeUndefined();
  expect(result.current.skills).toHaveLength(1);
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/skills/${sampleSkill.id}`,
    expect.objectContaining({ method: 'DELETE' })
  );
});

test('deleteSkill sets saveError on failure', async () => {
  mockFetchOk([sampleSkill]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  mockFetchError(404, 'Skill not found');
  let deleted;
  await act(async () => {
    deleted = await result.current.deleteSkill('nonexistent-id');
  });

  expect(deleted).toBe(false);
  expect(result.current.saveError).toBeTruthy();
});

// ─── reorderSkills ────────────────────────────────────────────────────────────

test('reorderSkills PUTs to /skills/reorder and replaces state', async () => {
  mockFetchOk([sampleSkill, sampleSkill2]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  const reordered = [
    { ...sampleSkill2, position: 0 },
    { ...sampleSkill, position: 1 },
  ];
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(reordered) })
  );

  let success;
  await act(async () => {
    success = await result.current.reorderSkills([sampleSkill2.id, sampleSkill.id]);
  });

  expect(success).toBe(true);
  expect(result.current.skills).toEqual(reordered);
  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/skills/reorder`,
    expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    })
  );
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.ids).toEqual([sampleSkill2.id, sampleSkill.id]);
});

// ─── saving flag ──────────────────────────────────────────────────────────────

test('saving is true while addSkill request is in flight', async () => {
  mockFetchOk([]);
  const { result } = renderHook(() => useSkills(ACCESS_TOKEN));
  await waitFor(() => expect(result.current.loading).toBe(false));

  let resolveSave;
  global.fetch = jest.fn(
    () =>
      new Promise((res) => {
        resolveSave = res;
      })
  );

  act(() => {
    result.current.addSkill({ name: 'React' });
  });
  await waitFor(() => expect(result.current.saving).toBe(true));

  await act(async () => {
    resolveSave({ ok: true, json: () => Promise.resolve(sampleSkill) });
  });
  await waitFor(() => expect(result.current.saving).toBe(false));
});
