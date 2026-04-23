import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
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
