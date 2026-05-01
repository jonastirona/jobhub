import { act, renderHook, waitFor } from '@testing-library/react';
import { useDocuments } from './useDocuments';

const BACKEND = 'http://localhost:8000';
const TOKEN = 'test-token';

describe('useDocuments', () => {
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

  test('createDocument posts FormData payload and returns created document', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'doc-1', name: 'Resume_2026', doc_type: 'Resume', job_id: 'job-1' }),
    });

    const { result } = renderHook(() => useDocuments(TOKEN, false));
    const file = new File(['%PDF-1.7 test'], 'resume.pdf', { type: 'application/pdf' });

    let created;
    await act(async () => {
      created = await result.current.createDocument({
        name: 'Resume_2026',
        doc_type: 'Resume',
        job_id: 'job-1',
        file,
        status: 'final',
        tags: ['backend', '2026'],
      });
    });

    expect(created).toMatchObject({ id: 'doc-1', name: 'Resume_2026' });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/documents');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('name')).toBe('Resume_2026');
    expect(options.body.get('doc_type')).toBe('Resume');
    expect(options.body.get('job_id')).toBe('job-1');
    expect(options.body.get('file')).toBe(file);
    // status and tags should be appended (tags sent as JSON string)
    expect(options.body.get('status')).toBe('final');
    expect(options.body.get('tags')).toBe(JSON.stringify(['backend', '2026']));
  });

  test('createDocument sets saveError when upload fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Only PDF files are supported'),
    });

    const { result } = renderHook(() => useDocuments(TOKEN, false));
    const file = new File(['bad'], 'resume.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current.createDocument({ name: 'Resume', doc_type: 'Resume', file });
    });

    expect(result.current.saveError).toMatch(/only pdf files are supported/i);
  });

  test('viewDocument returns null and sets error when signed url is missing', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useDocuments(TOKEN, false));

    let url;
    await act(async () => {
      url = await result.current.viewDocument('doc-1');
    });

    expect(url).toBeNull();
    expect(result.current.error).toMatch(/document link is unavailable/i);
  });

  test('deleteDocument removes document from state on success', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'doc-1', name: 'Resume_2026' }]),
      })
      .mockResolvedValueOnce({ ok: true, status: 204, text: () => Promise.resolve('') });

    const { result } = renderHook(() => useDocuments(TOKEN, true));

    await waitFor(() => {
      expect(result.current.documents).toHaveLength(1);
    });

    await act(async () => {
      await result.current.deleteDocument('doc-1');
    });

    expect(result.current.documents).toHaveLength(0);
  });

  test('deleteDocument sets deleteError when delete fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Failed to delete document (500)'),
    });

    const { result } = renderHook(() => useDocuments(TOKEN, false));

    let deleted;
    await act(async () => {
      deleted = await result.current.deleteDocument('doc-1');
    });

    expect(deleted).toBe(false);
    expect(result.current.deleteError).toMatch(/failed to delete document/i);
  });
});
