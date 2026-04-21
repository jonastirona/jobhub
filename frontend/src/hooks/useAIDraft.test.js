import { act, renderHook } from '@testing-library/react';
import { useAIDraft } from './useAIDraft';

const BACKEND = 'http://localhost:8000';
const TOKEN = 'test-token';

describe('useAIDraft', () => {
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

  describe('generate', () => {
    test('returns content on success', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '# John Doe\n\nResume content here.' }),
      });

      const { result } = renderHook(() => useAIDraft(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.generate('resume', 'job-1');
      });

      expect(content).toBe('# John Doe\n\nResume content here.');
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe(`${BACKEND}/ai/generate`);
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(JSON.parse(options.body)).toEqual({ type: 'resume', job_id: 'job-1' });
    });

    test('sets error and returns null on non-ok response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ detail: 'type must be resume or cover_letter' }),
      });

      const { result } = renderHook(() => useAIDraft(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.generate('invalid', 'job-1');
      });

      expect(content).toBeNull();
      expect(result.current.error).toMatch(/type must be resume or cover_letter/i);
    });

    test('sets error and returns null on 429 rate limit', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ detail: 'AI rate limit reached. Try again in an hour.' }),
      });

      const { result } = renderHook(() => useAIDraft(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.generate('resume', 'job-1');
      });

      expect(content).toBeNull();
      expect(result.current.error).toMatch(/rate limit/i);
    });

    test('sets error and returns null when backend URL is not configured', async () => {
      delete process.env.REACT_APP_BACKEND_URL;

      const { result } = renderHook(() => useAIDraft(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.generate('resume', 'job-1');
      });

      expect(content).toBeNull();
      expect(result.current.error).toMatch(/not configured/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('sets error and returns null when token is missing', async () => {
      const { result } = renderHook(() => useAIDraft(null));

      let content;
      await act(async () => {
        content = await result.current.generate('resume', 'job-1');
      });

      expect(content).toBeNull();
      expect(result.current.error).toBeTruthy();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('sets generating to true during request and false after', async () => {
      let resolveRequest;
      global.fetch.mockReturnValue(
        new Promise((res) => {
          resolveRequest = () =>
            res({ ok: true, json: () => Promise.resolve({ content: 'done' }) });
        })
      );

      const { result } = renderHook(() => useAIDraft(TOKEN));

      let promise;
      act(() => {
        promise = result.current.generate('resume', 'job-1');
      });

      expect(result.current.generating).toBe(true);

      await act(async () => {
        resolveRequest();
        await promise;
      });

      expect(result.current.generating).toBe(false);
    });
  });

  describe('rewrite', () => {
    test('returns rewritten content on success', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: 'Rewritten content.' }),
      });

      const { result } = renderHook(() => useAIDraft(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.rewrite('Original content.', 'Make it shorter.');
      });

      expect(content).toBe('Rewritten content.');
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe(`${BACKEND}/ai/rewrite`);
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        content: 'Original content.',
        instructions: 'Make it shorter.',
      });
    });

    test('sets error and returns null on failure', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ detail: 'AI generation failed' }),
      });

      const { result } = renderHook(() => useAIDraft(TOKEN));

      let content;
      await act(async () => {
        content = await result.current.rewrite('Original.', 'Make it shorter.');
      });

      expect(content).toBeNull();
      expect(result.current.error).toMatch(/AI generation failed/i);
    });

    test('sets rewriting to true during request and false after', async () => {
      let resolveRequest;
      global.fetch.mockReturnValue(
        new Promise((res) => {
          resolveRequest = () =>
            res({ ok: true, json: () => Promise.resolve({ content: 'done' }) });
        })
      );

      const { result } = renderHook(() => useAIDraft(TOKEN));

      let promise;
      act(() => {
        promise = result.current.rewrite('content', 'instructions');
      });

      expect(result.current.rewriting).toBe(true);

      await act(async () => {
        resolveRequest();
        await promise;
      });

      expect(result.current.rewriting).toBe(false);
    });
  });

  describe('clearError', () => {
    test('resets error state', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Something went wrong' }),
      });

      const { result } = renderHook(() => useAIDraft(TOKEN));

      await act(async () => {
        await result.current.generate('resume', 'job-1');
      });

      expect(result.current.error).toBeTruthy();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
