import { useState } from 'react';
import * as Sentry from '@sentry/react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import jobhubLogo from '../assets/jobhub_logo.svg';
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
        <main id="main-content" className="AuthScreen-main" tabIndex={-1}>
          <p role="status" aria-live="polite" aria-busy="true">
            Loading…
          </p>
        </main>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) {
      Sentry.captureException(err);
      setError(err.message);
      return;
    }
    navigate('/dashboard', { replace: true });
  }

  return (
    <div className="AuthScreen">
      <main id="main-content" className="AuthScreen-main" tabIndex={-1}>
        <div className="AuthCard">
          <img src={jobhubLogo} alt="JobHub" className="AuthLogo" />
          <h1>Log in</h1>
          <p className="AuthSubtitle">Sign in to continue</p>

          {!supabaseConfigured && (
            <p className="AuthMessage AuthMessage--error" role="alert">
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
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <p className="AuthFooter">
            No account? <Link to="/signup">Sign up</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
