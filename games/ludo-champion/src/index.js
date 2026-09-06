import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Resolve the hub identity before the first render, so the game never flashes its own
// login screen. One sign-in at MZeeGamingHub covers every game; a signed-out visitor is
// sent to the common login page and returned here afterwards.
async function start() {
  let user = null;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      user = (await res.json()).user;
    }
  } catch {
    // Offline or the hub is down — fall through to the game's own login screen.
  }

  if (!user && window.self === window.top) {
    window.location.replace('/login.html?next=' + encodeURIComponent(window.location.pathname));
    return;
  }

  window.__MZEE_USER__ = user;

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

start();
