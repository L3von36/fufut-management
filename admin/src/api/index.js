// Default to a same-origin path so the Pages Function (functions/api/[[path]].js)
// proxies the request server-side. This keeps the session cookie first-party and
// avoids third-party cookie blocking in modern browsers. VITE_API_URL can still
// override at build time for local dev (vite.config.js has a /api proxy) or for
// pointing at a different API host during debugging.
export const API = import.meta.env.VITE_API_URL || ''

export async function apiGet(endpoint) {
  const r = await fetch(`${API}/api/${endpoint}`, { credentials: 'include' })
  if (!r.ok) throw new Error(`GET ${endpoint} ${r.status}`)
  return r.json()
}
export async function apiPost(endpoint, data) {
  const r = await fetch(`${API}/api/${endpoint}`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(data) })
  if (!r.ok) throw new Error(`POST ${endpoint} ${r.status}`)
  return r.json()
}
export async function apiPut(endpoint, data) {
  const r = await fetch(`${API}/api/${endpoint}`, { method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(data) })
  if (!r.ok) throw new Error(`PUT ${endpoint} ${r.status}`)
  return r.json()
}
export async function apiDelete(endpoint) {
  const r = await fetch(`${API}/api/${endpoint}`, { method:'DELETE', headers:{'Content-Type':'application/json'}, credentials:'include' })
  if (!r.ok) throw new Error(`DELETE ${endpoint} ${r.status}`)
  return r.json()
}
export async function apiUpload(file) {
  const form = new FormData()
  form.append('file', file)
  const r = await fetch(`${API}/api/upload`, { method:'POST', credentials:'include', body: form })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `Upload failed ${r.status}`)
  }
  return r.json() // { ok, url, key }
}

export const NAV_ITEMS = [
  { view: 'orders', label: 'Orders', icon: 'clipboard', section: 'Sales' },
  { view: 'reservations', label: 'Reservations', icon: 'calendar', section: 'Sales' },
  { view: 'landing', label: 'Landing Page', icon: 'layout', section: 'Content' },
  { view: 'menu', label: 'Menu', icon: 'book', section: 'Content' },
  { view: 'reviews', label: 'Reviews', icon: 'star', section: 'Content' },
  { view: 'gallery', label: 'Gallery', icon: 'image', section: 'Content' },
  { view: 'settings', label: 'Settings', icon: 'settings', section: 'System' }
]