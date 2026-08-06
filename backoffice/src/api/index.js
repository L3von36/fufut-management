// Default to a same-origin path so the Pages Function (functions/api/[[path]].js)
// proxies the request server-side. This keeps the session cookie first-party and
// avoids third-party cookie blocking in modern browsers. VITE_API_URL can still
// override at build time for local dev (vite.config.js has a /api proxy) or for
// pointing at a different API host during debugging.
export const API = import.meta.env.VITE_API_URL || ''

let _online = navigator.onLine
const _listeners = new Set()

export function onOnlineChange(cb) {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

function setOnline(v) {
  if (_online !== v) {
    _online = v
    _listeners.forEach(cb => cb(v))
  }
}

export function isOnline() { return _online }

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOnline(true))
  window.addEventListener('offline', () => setOnline(false))
}

async function tryFetch(url, options) {
  const r = await fetch(url, options)
  if (!r.ok) throw new Error(`${options?.method || 'GET'} ${url} ${r.status}`)
  return r.json()
}

export async function apiGet(endpoint) {
  const url = `${API}/api/${endpoint}`
  return tryFetch(url, { credentials: 'include' })
}

export async function apiPost(endpoint, data) {
  const url = `${API}/api/${endpoint}`
  return tryFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  })
}

export async function apiPut(endpoint, data) {
  const url = `${API}/api/${endpoint}`
  return tryFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  })
}

export async function apiDelete(endpoint, id) {
  const url = `${API}/api/${endpoint}`
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(id ? { id } : undefined)
  })
  if (!r.ok) throw new Error(`DELETE ${endpoint} ${r.status}`)
  return r.json()
}

export const ROLE_PERMISSIONS = {
  manager: ['dashboard', 'orders', 'menu', 'pnl', 'expenses', 'revenue', 'inventory', 'waste', 'staff', 'shifts', 'timeclock', 'reports', 'reservations', 'delivery', 'audit', 'settings', 'pipeline', 'tables'],
  'head-chef': ['dashboard', 'orders', 'inventory', 'waste', 'reports', 'pipeline'],
  'assistant-chef': ['dashboard', 'orders', 'inventory'],
  'head-waiter': ['dashboard', 'orders', 'tables', 'reservations', 'delivery', 'reports', 'pipeline'],
  cashier: ['dashboard', 'orders', 'tables', 'reports', 'timeclock', 'reservations', 'revenue'],
  'delivery-staff': ['dashboard', 'delivery'],
  cleaner: ['dashboard', 'waste']
}

export const ROLE_DEFAULT_VIEW = {
  manager: 'dashboard',
  'head-chef': 'orders',
  'assistant-chef': 'orders',
  'head-waiter': 'tables',
  cashier: 'orders',
  'delivery-staff': 'delivery',
  cleaner: 'waste'
}

export const NAV_ITEMS = [
  { view: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', section: 'Overview' },
  { view: 'pnl', label: 'P&L', icon: 'chart-bar', section: 'Finance' },
  { view: 'expenses', label: 'Expenses', icon: 'wallet', section: 'Finance' },
  { view: 'revenue', label: 'Revenue', icon: 'trending-up', section: 'Finance' },
  { view: 'orders', label: 'Orders', icon: 'shopping-cart', section: 'Sales' },
  { view: 'menu', label: 'Menu', icon: 'utensils', section: 'Sales' },
  { view: 'reports', label: 'Reports', icon: 'file-text', section: 'Analytics' },
  { view: 'pipeline', label: 'Pipeline', icon: 'git-branch', section: 'Operations' },
  { view: 'tables', label: 'Tables', icon: 'grid-3x3', section: 'Operations' },
  { view: 'inventory', label: 'Inventory', icon: 'package', section: 'Stock' },
  { view: 'waste', label: 'Waste', icon: 'trash-2', section: 'Stock' },
  { view: 'reservations', label: 'Reservations', icon: 'calendar', section: 'Operations' },
  { view: 'delivery', label: 'Delivery', icon: 'truck', section: 'Operations' },
  { view: 'staff', label: 'Staff', icon: 'users', section: 'HR' },
  { view: 'shifts', label: 'Shifts', icon: 'clock', section: 'HR' },
  { view: 'timeclock', label: 'Time Clock', icon: 'fingerprint', section: 'HR' },
  { view: 'audit', label: 'Audit Log', icon: 'shield', section: 'System' },
  { view: 'settings', label: 'Settings', icon: 'settings', section: 'System' }
]

export const TODAY = () => new Date().toISOString().slice(0, 10)
