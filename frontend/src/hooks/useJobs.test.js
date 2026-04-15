import { renderHook, waitFor } from '@testing-library/react';
import { useJobs } from './useJobs';

const savedBackendUrl = process.env.REACT_APP_BACKEND_URL;

afterEach(() => {
  process.env.REACT_APP_BACKEND_URL = savedBackendUrl;
  jest.clearAllMocks();
});

describe('useJobs', () => {
  test('does not fetch when accessToken is missing', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    const { result } = renderHook(() => useJobs(undefined, ''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.jobs).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  test('does not fetch when backend URL is missing', async () => {
    delete process.env.REACT_APP_BACKEND_URL;
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    const { result } = renderHook(() => useJobs('token', ''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.jobs).toEqual([]);
  });

  test('GET /jobs without q when search is empty', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 'job-a', title: 'Dev' }]),
      })
    );
    const { result } = renderHook(() => useJobs('access-token-xyz', ''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/jobs',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-token-xyz' },
      })
    );
    expect(result.current.jobs).toEqual([{ id: 'job-a', title: 'Dev' }]);
    expect(result.current.error).toBeNull();
  });

  test('GET /jobs?q= with encoded query when search is non-empty', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    renderHook(() => useJobs('tok', 'hello world'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/jobs?q=hello%20world',
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok' },
      })
    );
  });

  test('sets error when response is not ok', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 503 }));
    const { result } = renderHook(() => useJobs('tok', ''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/failed to load jobs/i);
    expect(result.current.jobs).toEqual([]);
  });
});
