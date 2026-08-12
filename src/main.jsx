import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeAnalytics } from './analytics/dataLayer';
import './styles.css';

initializeAnalytics();

// GitHub Pages serves unknown routes through public/404.html. Restore the
// requested path before React selects the page so direct links such as
// /about, /privacy, /terms, and /support continue to work after that redirect.
try {
  const redirectPath = sessionStorage.getItem('squadview:redirect-path');
  if (redirectPath && window.location.pathname === '/') {
    sessionStorage.removeItem('squadview:redirect-path');
    window.history.replaceState(null, '', redirectPath);
  }
} catch {
  // Route restoration is a convenience; SquadView still works without it.
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // SquadView still works normally if service-worker registration is blocked.
    });
  });
}
