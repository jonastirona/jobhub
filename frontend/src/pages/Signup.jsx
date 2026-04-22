import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import jobhubLogo from '../assets/jobhub_logo.svg';
import '../AuthPages.css';

export default function Signup() {
  const { session, loading, signUp, supabaseConfigured } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="AuthScreen">
        <main id="main-content" className="AuthScreen-main">
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
    setInfo('');
    setSubmitting(true);
    const { data, error: err } = await signUp(email.trim(), password);
    setSubmitting(false);

    if (err) {
      setError(err.message);
      return;
    }

    if (data?.session) {
      navigate('/dashboard', { replace: true });
      return;
    }

    setInfo(
      'Account created. If email confirmation is enabled in Supabase, check your inbox before signing in.'
    );
  }

  return (
    <div className="AuthScreen">
      <main id="main-content" className="AuthScreen-main">
        <div className="AuthCard">
          <img src={jobhubLogo} alt="JobHub" className="AuthLogo" />
          <h1>Sign up</h1>
          <p className="AuthSubtitle">Create a JobHub account</p>

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

          {info && (
            <p className="AuthMessage AuthMessage--info" role="status">
              {info}
            </p>
          )}

          <form onSubmit={handleSubmit}>
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!supabaseConfigured || submitting}
            />

            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={!supabaseConfigured || submitting}
            />

            <button
              type="submit"
              className="AuthPrimary"
              disabled={!supabaseConfigured || submitting}
            >
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="AuthFooter">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
