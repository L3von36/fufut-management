// Use VITE_API_URL if set, otherwise empty string so calls go through the
// Cloudflare Pages /api/* proxy defined in public/_redirects (same-origin,
// no cross-site cookie issues).
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

export const NAV_ITEMS = [
  { view: 'orders', label: 'Orders', icon: 'clipboard', section: 'Sales' },
  { view: 'reservations', label: 'Reservations', icon: 'calendar', section: 'Sales' },
  { view: 'landing', label: 'Landing Page', icon: 'layout', section: 'Content' },
  { view: 'menu', label: 'Menu', icon: 'book', section: 'Content' },
  { view: 'reviews', label: 'Reviews', icon: 'star', section: 'Content' },
  { view: 'gallery', label: 'Gallery', icon: 'image', section: 'Content' },
  { view: 'settings', label: 'Settings', icon: 'settings', section: 'System' }
]