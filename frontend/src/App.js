import { useCallback, useEffect, useState } from 'react';
import logo from './logo.svg';
import './App.css';

function App() {
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
        detail:
          err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
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
  );
}

export default App;
