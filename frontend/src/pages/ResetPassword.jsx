import { useState } from 'react';
import * as Sentry from '@sentry/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../AuthPages.css';

export default function ResetPassword() {
  const { updatePassword, supabaseConfigured } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: err } = await updatePassword(password);
    setSubmitting(false);

    if (err) {
      if (!err.status || err.status >= 500) Sentry.captureException(err);
      setError(err.message);
      return;
    }

    navigate('/dashboard', { replace: true });
  }

  return (
    <div className="AuthScreen">
      <main id="main-content" className="AuthScreen-main" tabIndex={-1}>
        <div className="AuthCard">
          <h1>New password</h1>
          <p className="AuthSubtitle">Enter your new password below.</p>

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
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={!supabaseConfigured || submitting}
            />

            <label htmlFor="reset-confirm">Confirm password</label>
            <input
              id="reset-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={!supabaseConfigured || submitting}
            />

            <button
              type="submit"
              className="AuthPrimary"
              disabled={!supabaseConfigured || submitting}
            >
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
