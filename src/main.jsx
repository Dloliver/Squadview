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
  let squadViewWorkerReloading = false;
  const workerReloadKey = 'squadview-controller-refresh-v1';

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (squadViewWorkerReloading) return;

    try {
      if (window.sessionStorage.getItem(workerReloadKey) === '1') return;
      window.sessionStorage.setItem(workerReloadKey, '1');
    } catch {
      // A page-local guard still prevents duplicate reloads if storage is blocked.
    }

    squadViewWorkerReloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).then((registration) => {
      // Safari/PWA hardening: explicitly check for a newer worker whenever
      // SquadView starts instead of waiting for the browser's update cadence.
      void registration.update();
    }).catch(() => {
      // SquadView still works normally if service-worker registration is blocked.
    });
  });
}
