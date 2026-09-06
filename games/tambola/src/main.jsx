import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const HERE = '/games/tambola/'

// Tambola runs inside MZeeGamingHub, which owns the only login. Resolve who is playing
// before the first render so the game opens with their name already filled in.
async function boot() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (r.status === 401) {
      location.replace('/login.html?next=' + encodeURIComponent(HERE))
      return
    }
    if (r.ok) {
      const { user } = await r.json()
      window.__MZEE_PLAYER__ = user.name || user.username
      window.__MZEE_USER__ = user
    }
  } catch {
    // Hub unreachable: fall through and let the game run with its own default name
    // rather than showing a blank screen.
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

boot()
