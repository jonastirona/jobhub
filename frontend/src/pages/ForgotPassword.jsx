import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../AuthPages.css';

export default function ForgotPassword() {
  const { resetPassword, supabaseConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: err } = await resetPassword(email.trim());
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="AuthScreen">
      <div className="AuthCard">
        <h1>Reset password</h1>
        <p className="AuthSubtitle">Enter your email and we&apos;ll send you a reset link.</p>

        {!supabaseConfigured && (
          <p className="AuthMessage AuthMessage--error">
            Missing <code>REACT_APP_SUPABASE_URL</code> or <code>REACT_APP_SUPABASE_ANON_KEY</code>{' '}
            in <code>.env</code>.
          </p>
        )}

        {error && (
          <p className="AuthMessage AuthMessage--error" role="alert">
            {error}
          </p>
        )}

        {submitted ? (
          <p className="AuthMessage AuthMessage--info" role="status">
            Check your email for a password reset link.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!supabaseConfigured || submitting}
            />
            <button
              type="submit"
              className="AuthPrimary"
              disabled={!supabaseConfigured || submitting}
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="AuthFooter">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
