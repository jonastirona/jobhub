import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: !!process.env.REACT_APP_SENTRY_DSN,
  traces_sample_rate: 0.1,
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p role="alert">Something went wrong. Please refresh the page.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

// Core Web Vitals: log in development only (see README — Performance & accessibility).
reportWebVitals(
  process.env.NODE_ENV === 'development'
    ? ({ name, value, id }) => {
        // eslint-disable-next-line no-console -- intentional dev-only vitals logging
        console.log('[vitals]', name, value, id);
      }
    : undefined
);
