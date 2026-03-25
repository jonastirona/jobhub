import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../AuthPages.css';

export default function Login() {
  const { session, loading, signIn, supabaseConfigured } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="AuthScreen">
        <p>Loading…</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="AuthScreen">
      <div className="AuthCard">
        <h1>Log in</h1>
        <p className="AuthSubtitle">Sign in to continue</p>

        {!supabaseConfigured && (
          <p className="AuthMessage AuthMessage--error">
            Missing <code>REACT_APP_SUPABASE_URL</code> or{' '}
            <code>REACT_APP_SUPABASE_ANON_KEY</code> in <code>.env</code>.
          </p>
        )}

        {error && (
          <p className="AuthMessage AuthMessage--error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={!supabaseConfigured || submitting}
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={!supabaseConfigured || submitting}
          />

          <button
            type="submit"
            className="AuthPrimary"
            disabled={!supabaseConfigured || submitting}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="AuthFooter">
          No account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
