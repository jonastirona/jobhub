import { act, renderHook, waitFor } from '@testing-library/react';
import { useReminders } from './useReminders';

const BACKEND = 'http://localhost:8000';
const ACCESS_TOKEN = 'test-token';

const sampleReminders = [
  {
    id: 'r1',
    job_id: 'job-123',
    user_id: 'user-1',
    title: 'Follow up on offer',
    notes: 'Ask about start date',
    due_date: '2026-04-20T09:00:00+00:00',
    completed_at: null,
    created_at: '2026-04-14T00:00:00+00:00',
    jobs: { title: 'Backend Engineer', company: 'TechCorp' },
  },
];

function mockFetchOk(body) {
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
}

function mockFetchError(status = 500) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status, text: () => Promise.resolve('Server error') })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchOk(sampleReminders);
  process.env.REACT_APP_BACKEND_URL = BACKEND;
});

afterEach(() => {
  delete process.env.REACT_APP_BACKEND_URL;
});

// ─── Fetching ─────────────────────────────────────────────────────────────────

test('fetches reminders on mount', async () => {
  const { result } = renderHook(() => useReminders(ACCESS_TOKEN));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/reminders`,
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${ACCESS_TOKEN}` }),
    })
  );
  expect(result.current.reminders).toEqual(sampleReminders);
  expect(result.current.error).toBeNull();
});

test('starts in loading state', () => {
  global.fetch = jest.fn(() => new Promise(() => {}));
  const { result } = renderHook(() => useReminders(ACCESS_TOKEN));
  expect(result.current.loading).toBe(true);
});

test('sets error on failed response', async () => {
  mockFetchError(500);
  const { result } = renderHook(() => useReminders(ACCESS_TOKEN));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toMatch(/500/);
  expect(result.current.reminders).toEqual([]);
});

test('sets error on network failure', async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
  const { result } = renderHook(() => useReminders(ACCESS_TOKEN));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toBe('Network error');
});

// ─── No-op conditions ─────────────────────────────────────────────────────────

test('does not fetch when accessToken is missing', () => {
  renderHook(() => useReminders(null));
  expect(global.fetch).not.toHaveBeenCalled();
});

test('does not fetch when backend URL is not set', () => {
  delete process.env.REACT_APP_BACKEND_URL;
  renderHook(() => useReminders(ACCESS_TOKEN));
  expect(global.fetch).not.toHaveBeenCalled();
});

// ─── refetch ──────────────────────────────────────────────────────────────────

test('refetch re-calls the endpoint', async () => {
  const { result } = renderHook(() => useReminders(ACCESS_TOKEN));

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.refetch();
  });

  expect(global.fetch).toHaveBeenCalledTimes(2);
});
