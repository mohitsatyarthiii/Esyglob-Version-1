import { buildApiUrl } from '../api/client'

let clientPromise

function socketOrigin() {
  const configured = String(import.meta.env.VITE_REALTIME_URL || '').trim()
  if (configured) return new URL(configured, window.location.origin).origin
  const api = new URL(buildApiUrl('/'))
  return api.origin === window.location.origin ? window.location.origin : api.origin
}

function loadSocketClient(origin) {
  if (window.io) return Promise.resolve(window.io)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-esyglob-socket]')
    if (existing) {
      if (existing.dataset.loaded === 'true' && window.io) { resolve(window.io); return }
      existing.addEventListener('load', () => resolve(window.io), { once: true })
      existing.addEventListener('error', () => { existing.remove(); reject(new Error('Realtime messaging is unavailable.')) }, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = `${origin}/socket.io/socket.io.js`
    script.async = true
    script.dataset.esyglobSocket = 'true'
    script.onload = () => { script.dataset.loaded = 'true'; resolve(window.io) }
    script.onerror = () => { script.remove(); reject(new Error('Realtime messaging is unavailable.')) }
    document.head.appendChild(script)
  })
}

export function getRealtimeClient() {
  if (!clientPromise) {
    const origin = socketOrigin()
    clientPromise = loadSocketClient(origin).then((io) => {
      if (!io) throw new Error('Realtime messaging is unavailable.')
      return io(origin, { withCredentials: true, transports: ['websocket', 'polling'] })
    }).catch((error) => { clientPromise = null; throw error })
  }
  return clientPromise
}
