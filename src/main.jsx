import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import './index.css'

// A tab left open across a deploy still holds the OLD index.html, which
// references hashed chunk filenames (e.g. MenusScreen-CiI8Z4up.js) that the
// new deployment no longer serves — any React.lazy() navigation then throws
// "Failed to fetch dynamically imported module" and previously just crashed
// into the ErrorBoundary, requiring the user to notice and manually hit
// "Recargar app". Vite fires this exact event for that failure; reload once
// automatically (a fresh load always gets the current, valid chunk
// manifest) instead of leaving it to the user. Guarded with sessionStorage
// so a genuinely broken deployment can't reload-loop forever.
window.addEventListener('vite:preloadError', () => {
  const key = 'mp_chunk_reload_attempted'
  if (sessionStorage.getItem(key)) return
  sessionStorage.setItem(key, '1')
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// Re-arm the guard once the app has been running stably for a bit, so a tab
// left open across several deploys (days apart) can still auto-recover from
// a LATER staleness event, not just the first one this session.
window.setTimeout(() => sessionStorage.removeItem('mp_chunk_reload_attempted'), 10000)
