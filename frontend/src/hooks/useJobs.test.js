import { act, renderHook, waitFor } from '@testing-library/react';
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
      'http://localhost:8000/jobs?page=1&page_size=10&sort_by=created_at',
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
        sortBy: 'company',
        page: 2,
        pageSize: 25,
      })
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/jobs?q=hello+world&page=2&page_size=25&sort_by=company&statuses=interviewing&statuses=offered&locations=Remote&deadline_states=overdue&deadline_states=no_deadline',
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok' },
      })
    );
  });

  test('GET /jobs includes include_archived when enabled', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
    renderHook(() =>
      useJobs('tok', '', {
        includeArchived: true,
      })
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/jobs?page=1&page_size=10&sort_by=created_at&include_archived=true',
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok' },
      })
    );
  });

  // Value canonicalization (trim / casefold-dedupe / title-case / sort) for
  // available_locations is the backend's responsibility now (see
  // backend/main.py::_build_available_locations and its backend tests). The
  // hook is only expected to pass the server's normalized values through so
  // there is exactly one normalization layer.
  test('passes server-normalized availableLocations through verbatim', async () => {
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
            available_locations: ['Boston, MA', 'Montreal', 'San Francisco'],
            status_counts: { interviewing: 0, offered: 0 },
          }),
      })
    );
    const { result } = renderHook(() => useJobs('access-token-xyz', ''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta.availableLocations).toEqual([
      'Boston, MA',
      'Montreal',
      'San Francisco',
    ]);
  });

  test('keeps selected statuses visible even when the backend facet omits them', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [],
            total: 0,
            page: 1,
            page_size: 10,
            total_pages: 1,
            // Server facet no longer has 'rejected' (e.g. last rejected job
            // was deleted), but the user still has the checkbox ticked — it
            // must stay visible so they can uncheck/un-filter intentionally.
            available_statuses: ['applied', 'interviewing'],
            available_locations: [],
            status_counts: { interviewing: 0, offered: 0 },
          }),
      })
    );
    const { result } = renderHook(() => useJobs('tok', '', { statuses: ['rejected'] }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta.availableStatuses).toEqual(['applied', 'interviewing', 'rejected']);
  });

  test('does not retain stale locations after a refetch', async () => {
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [{ id: 'job-a', title: 'Dev' }],
            total: 1,
            page: 1,
            page_size: 10,
            total_pages: 1,
            available_statuses: ['applied'],
            // Backend sorts available_locations by casefold (see
            // _build_available_locations in main.py); mirror that here so the
            // mock reflects the real contract.
            available_locations: ['Boston, MA', 'Remote'],
            status_counts: { interviewing: 0, offered: 0 },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [{ id: 'job-a', title: 'Dev' }],
            total: 1,
            page: 1,
            page_size: 10,
            total_pages: 1,
            available_statuses: ['applied'],
            available_locations: ['Boston, MA', 'Remote'],
            status_counts: { interviewing: 0, offered: 0 },
          }),
      })
      .mockResolvedValueOnce({
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
      });
    const { result, rerender } = renderHook(({ term }) => useJobs('access-token-xyz', term), {
      initialProps: { term: '' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta.availableLocations).toEqual(['Boston, MA', 'Remote']);

    rerender({ term: 'remote' });
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta.availableLocations).toEqual(['Remote']);
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
