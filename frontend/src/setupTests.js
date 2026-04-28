// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Pages that fan out several fetches (e.g. Profile) can miss the default 1000ms
// when the runner is busy; a modest bump reduces flaky waitFor/findBy timeouts.
configure({ asyncUtilTimeout: 3000 });

// jsPDF feature-detects canvas support at import-time. JSDOM throws for
// getContext unless canvas is polyfilled, so provide a lightweight stub.
if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: jest.fn(() => null),
  });
}
