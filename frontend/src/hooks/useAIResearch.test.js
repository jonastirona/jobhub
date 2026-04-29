import { act, renderHook } from '@testing-library/react';
import { useAIResearch } from './useAIResearch';

const BACKEND = 'http://localhost:8000';
const TOKEN = 'test-token';

describe('useAIResearch', () => {
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

  describe('research', () => {
    test('returns content on success', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '## Culture\n\nGreat place to work.' }),
      });

      const { result } = renderHook(() => useAIResearch(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.research('job-1', 'What is the culture like?');
      });

      expect(content).toBe('## Culture\n\nGreat place to work.');
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe(`${BACKEND}/ai/company-research`);
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(JSON.parse(options.body)).toEqual({
        job_id: 'job-1',
        context: 'What is the culture like?',
      });
    });

    test('sets error and returns null on non-ok response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ detail: 'context must not be blank' }),
      });

      const { result } = renderHook(() => useAIResearch(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.research('job-1', '');
      });

      expect(content).toBeNull();
      expect(result.current.error).toMatch(/context must not be blank/i);
    });

    test('sets error and returns null on 429 rate limit', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ detail: 'AI rate limit reached. Try again in an hour.' }),
      });

      const { result } = renderHook(() => useAIResearch(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.research('job-1', 'Tell me about the company.');
      });

      expect(content).toBeNull();
      expect(result.current.error).toMatch(/rate limit/i);
    });

    test('sets error and returns null when backend URL is not configured', async () => {
      delete process.env.REACT_APP_BACKEND_URL;

      const { result } = renderHook(() => useAIResearch(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.research('job-1', 'Tell me about the company.');
      });

      expect(content).toBeNull();
      expect(result.current.error).toMatch(/not configured/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('sets error and returns null when token is missing', async () => {
      const { result } = renderHook(() => useAIResearch(null));

      let content;
      await act(async () => {
        content = await result.current.research('job-1', 'Tell me about the company.');
      });

      expect(content).toBeNull();
      expect(result.current.error).toBeTruthy();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('sets researching to true during request and false after', async () => {
      let resolveRequest;
      global.fetch.mockReturnValue(
        new Promise((res) => {
          resolveRequest = () =>
            res({ ok: true, json: () => Promise.resolve({ content: 'done' }) });
        })
      );

      const { result } = renderHook(() => useAIResearch(TOKEN));

      let promise;
      act(() => {
        promise = result.current.research('job-1', 'Tell me about the culture.');
      });

      expect(result.current.researching).toBe(true);

      await act(async () => {
        resolveRequest();
        await promise;
      });

      expect(result.current.researching).toBe(false);
    });

    test('sets error and returns null on network failure', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAIResearch(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.research('job-1', 'Tell me about the company.');
      });

      expect(content).toBeNull();
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

      const { result } = renderHook(() => useAIResearch(TOKEN));

      await act(async () => {
        await result.current.research('job-1', 'Tell me about the company.');
      });

      expect(result.current.error).toBeTruthy();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
