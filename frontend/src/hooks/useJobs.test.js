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

  test('GET /jobs with pagination defaults when search is empty', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [{ id: 'job-a', title: 'Dev' }],
            total: 1,
            page: 1,
            page_size: 10,
            total_pages: 1,
            available_statuses: ['applied'],
            available_locations: ['Remote'],
            status_counts: { interviewing: 0, offered: 0 },
          }),
      })
    );
    const { result } = renderHook(() => useJobs('access-token-xyz', ''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/jobs?page=1&page_size=10',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-token-xyz' },
      })
    );
    expect(result.current.jobs).toEqual([{ id: 'job-a', title: 'Dev' }]);
    expect(result.current.error).toBeNull();
  });

  test('GET /jobs serializes search, filters, and pagination params', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    renderHook(() =>
      useJobs('tok', 'hello world', {
        statuses: ['interviewing', 'offered'],
        locations: ['Remote'],
        deadlineStates: ['overdue', 'no_deadline'],
        page: 2,
        pageSize: 25,
      })
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/jobs?q=hello+world&page=2&page_size=25&statuses=interviewing&statuses=offered&locations=Remote&deadline_states=overdue&deadline_states=no_deadline',
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok' },
      })
    );
  });

  test('dedupes availableLocations case-insensitively and trims whitespace', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [{ id: 'job-a', title: 'Dev' }],
            total: 1,
            page: 1,
            page_size: 10,
            total_pages: 1,
            available_statuses: ['applied'],
            available_locations: ['San Francisco', ' san francisco ', 'SAN FRANCISCO', 'Montreal'],
            status_counts: { interviewing: 0, offered: 0 },
          }),
      })
    );
    const { result } = renderHook(() => useJobs('access-token-xyz', ''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta.availableLocations).toEqual(['Montreal', 'San Francisco']);
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
