import { renderHook, waitFor } from '@testing-library/react';
import { useJobHistory } from './useJobHistory';

const BACKEND = 'http://localhost:8000';
const ACCESS_TOKEN = 'test-token';
const JOB_ID = 'job-123';

const sampleHistory = [
  {
    id: 'h1',
    job_id: JOB_ID,
    user_id: 'user-1',
    from_status: null,
    to_status: 'applied',
    changed_at: '2026-04-01T00:00:00+00:00',
  },
  {
    id: 'h2',
    job_id: JOB_ID,
    user_id: 'user-1',
    from_status: 'applied',
    to_status: 'interviewing',
    changed_at: '2026-04-05T14:32:00+00:00',
  },
];
const sampleInterviews = [
  {
    id: 'i1',
    job_id: JOB_ID,
    user_id: 'user-1',
    round_type: 'Phone Screen',
    scheduled_at: '2026-04-08T15:00:00+00:00',
    notes: 'Bring examples',
  },
];

function mockFetchError(status = 500) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status, text: () => Promise.resolve('Server error') })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleHistory) });
    }
    if (String(url).includes('/interviews')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleInterviews) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
  process.env.REACT_APP_BACKEND_URL = BACKEND;
});

afterEach(() => {
  delete process.env.REACT_APP_BACKEND_URL;
});

// ─── Fetching ─────────────────────────────────────────────────────────────────

test('fetches history for the given job id', async () => {
  const { result } = renderHook(() => useJobHistory(JOB_ID, ACCESS_TOKEN));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(global.fetch).toHaveBeenCalledWith(
    `${BACKEND}/jobs/${JOB_ID}/history`,
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${ACCESS_TOKEN}` }),
    })
  );
  expect(result.current.history).toEqual(sampleHistory);
  expect(result.current.interviews).toEqual(sampleInterviews);
  expect(result.current.error).toBeNull();
});

test('starts in loading state', () => {
  global.fetch = jest.fn(() => new Promise(() => {}));
  const { result } = renderHook(() => useJobHistory(JOB_ID, ACCESS_TOKEN));
  expect(result.current.loading).toBe(true);
});

test('sets error on failed response', async () => {
  mockFetchError(404);
  const { result } = renderHook(() => useJobHistory(JOB_ID, ACCESS_TOKEN));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toMatch(/404/);
  expect(result.current.history).toEqual([]);
});

test('sets error on network failure', async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
  const { result } = renderHook(() => useJobHistory(JOB_ID, ACCESS_TOKEN));

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toBe('Network error');
});

// ─── No-op conditions ─────────────────────────────────────────────────────────

test('does not fetch when jobId is missing', () => {
  renderHook(() => useJobHistory(null, ACCESS_TOKEN));
  expect(global.fetch).not.toHaveBeenCalled();
});

test('does not fetch when accessToken is missing', () => {
  renderHook(() => useJobHistory(JOB_ID, null));
  expect(global.fetch).not.toHaveBeenCalled();
});

test('does not fetch when backend URL is not set', () => {
  delete process.env.REACT_APP_BACKEND_URL;
  renderHook(() => useJobHistory(JOB_ID, ACCESS_TOKEN));
  expect(global.fetch).not.toHaveBeenCalled();
});
