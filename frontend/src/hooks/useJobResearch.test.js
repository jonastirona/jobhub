import { act, renderHook } from '@testing-library/react';
import { useJobResearch } from './useJobResearch';

const BACKEND = 'http://localhost:8000';
const TOKEN = 'test-token';
const JOB_ID = 'job-123';

describe('useJobResearch', () => {
  const originalBackend = process.env.REACT_APP_BACKEND_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REACT_APP_BACKEND_URL = BACKEND;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (originalBackend === undefined) {
      delete process.env.REACT_APP_BACKEND_URL;
    } else {
      process.env.REACT_APP_BACKEND_URL = originalBackend;
    }
  });

  describe('saveResearch', () => {
    test('returns updated job on success', async () => {
      const updatedJob = { id: JOB_ID, research: '## Culture\n\nGreat place to work.' };
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updatedJob),
      });

      const { result } = renderHook(() => useJobResearch(TOKEN));

      let response;
      await act(async () => {
        response = await result.current.saveResearch(JOB_ID, '## Culture\n\nGreat place to work.');
      });

      expect(response).toEqual(updatedJob);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe(`${BACKEND}/jobs/${JOB_ID}`);
      expect(options.method).toBe('PUT');
      expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(JSON.parse(options.body)).toEqual({
        research: '## Culture\n\nGreat place to work.',
      });
    });

    test('sets error and returns null on non-ok response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: 'Job not found' }),
      });

      const { result } = renderHook(() => useJobResearch(TOKEN));

      let response;
      await act(async () => {
        response = await result.current.saveResearch(JOB_ID, 'Some research');
      });

      expect(response).toBeNull();
      expect(result.current.error).toMatch(/job not found/i);
    });

    test('sets error and returns null when backend URL is not configured', async () => {
      delete process.env.REACT_APP_BACKEND_URL;

      const { result } = renderHook(() => useJobResearch(TOKEN));

      let response;
      await act(async () => {
        response = await result.current.saveResearch(JOB_ID, 'Some research');
      });

      expect(response).toBeNull();
      expect(result.current.error).toMatch(/not configured/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('sets error and returns null when token is missing', async () => {
      const { result } = renderHook(() => useJobResearch(null));

      let response;
      await act(async () => {
        response = await result.current.saveResearch(JOB_ID, 'Some research');
      });

      expect(response).toBeNull();
      expect(result.current.error).toBeTruthy();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('sets saving to true during request and false after', async () => {
      let resolveRequest;
      global.fetch.mockReturnValue(
        new Promise((res) => {
          resolveRequest = () => res({ ok: true, json: () => Promise.resolve({ id: JOB_ID }) });
        })
      );

      const { result } = renderHook(() => useJobResearch(TOKEN));

      let promise;
      act(() => {
        promise = result.current.saveResearch(JOB_ID, 'Some research');
      });

      expect(result.current.saving).toBe(true);

      await act(async () => {
        resolveRequest();
        await promise;
      });

      expect(result.current.saving).toBe(false);
    });

    test('sets error and returns null on network failure', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useJobResearch(TOKEN));

      let response;
      await act(async () => {
        response = await result.current.saveResearch(JOB_ID, 'Some research');
      });

      expect(response).toBeNull();
      expect(result.current.error).toMatch(/network error/i);
    });
  });

  describe('clearError', () => {
    test('resets error state', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Something went wrong' }),
      });

      const { result } = renderHook(() => useJobResearch(TOKEN));

      await act(async () => {
        await result.current.saveResearch(JOB_ID, 'Some research');
      });

      expect(result.current.error).toBeTruthy();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
