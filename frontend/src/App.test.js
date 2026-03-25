import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

const mockAuthValue = {
  session: {
    user: { id: '1', email: 'test@example.com' },
    access_token: 'test-token',
  },
  user: { id: '1', email: 'test@example.com' },
  loading: false,
  signIn: jest.fn(),
  signUp: jest.fn(),
  signOut: jest.fn(() => Promise.resolve()),
  supabaseConfigured: true,
};

jest.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => mockAuthValue,
}));

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
});

test('renders learn react link when authenticated', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/learn react/i)).toBeInTheDocument();
  });
});

test('backend panel reaches health endpoint when env is set', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/Connected/i)).toBeInTheDocument();
  });
  expect(global.fetch).toHaveBeenCalled();
});
