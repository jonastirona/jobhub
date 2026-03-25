import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

const savedBackendUrl = process.env.REACT_APP_BACKEND_URL;

beforeEach(() => {
  process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      text: () =>
        Promise.resolve(JSON.stringify({ message: 'FastAPI running on Vercel' })),
    }),
  );
});

afterEach(() => {
  process.env.REACT_APP_BACKEND_URL = savedBackendUrl;
  jest.restoreAllMocks();
});

test('renders learn react link', () => {
  render(<App />);
  expect(screen.getByText(/learn react/i)).toBeInTheDocument();
});

test('backend panel reaches health endpoint when env is set', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/Connected/i)).toBeInTheDocument();
  });
  expect(global.fetch).toHaveBeenCalled();
});
