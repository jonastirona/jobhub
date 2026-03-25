import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../logo.svg';
import '../App.css';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const backendBase =
    (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;
  const [check, setCheck] = useState({
    phase: 'idle',
    payload: null,
    detail: '',
  });

  const runCheck = useCallback(async () => {
    if (!backendBase) {
      setCheck({
        phase: 'no-url',
        payload: null,
        detail:
          'Set REACT_APP_BACKEND_URL in frontend/.env (see .env.example), then restart npm start.',
      });
      return;
    }

    setCheck({ phase: 'loading', payload: null, detail: '' });

    try {
      const res = await fetch(`${backendBase}/`);
      const text = await res.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
      if (!res.ok) {
        setCheck({
          phase: 'error',
          payload: null,
          detail: `HTTP ${res.status}: ${text.slice(0, 300)}`,
        });
        return;
      }
      setCheck({ phase: 'ok', payload, detail: '' });
    } catch (err) {
      setCheck({
        phase: 'error',
        payload: null,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }, [backendBase]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="App">
      <div className="App-main">
        <div className="HomeToolbar">
          <span title={user?.email || ''}>{user?.email}</span>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <p>
            Edit <code>src/pages/Home.jsx</code> and save to reload.
          </p>
          <a
            className="App-link"
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>

          <section className="BackendPanel" aria-label="Backend API check">
            <h2 className="BackendPanel-title">Backend API</h2>
            <p className="BackendPanel-url">
              <code>
                {backendBase
                  ? `${backendBase}/`
                  : 'REACT_APP_BACKEND_URL not set'}
              </code>
            </p>
            {check.phase === 'loading' && (
              <p className="BackendPanel-status">Checking…</p>
            )}
            {check.phase === 'no-url' && (
              <p className="BackendPanel-status BackendPanel-status--bad">
                {check.detail}
              </p>
            )}
            {check.phase === 'ok' && (
              <>
                <p className="BackendPanel-status BackendPanel-status--good">
                  Connected — response from server:
                </p>
                <pre className="BackendPanel-json">
                  {JSON.stringify(check.payload, null, 2)}
                </pre>
              </>
            )}
            {check.phase === 'error' && (
              <p className="BackendPanel-status BackendPanel-status--bad">
                {check.detail}
              </p>
            )}
            <button
              type="button"
              className="BackendPanel-button"
              onClick={runCheck}
              disabled={check.phase === 'loading'}
            >
              Test again
            </button>
          </section>
        </header>
      </div>
    </div>
  );
}
