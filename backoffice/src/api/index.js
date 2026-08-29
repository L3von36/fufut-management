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

/**
 * The API explains its refusals in the response body — "You cannot approve your
 * own overtime claim", "A reason is required to reject", "Only a manager can
 * change business settings". This used to throw the status line instead, so
 * every one of those became "POST /api/overtime/OT1/decide 403" on screen and
 * the actual reason was lost.
 *
 * The status line is kept as the fallback for a non-JSON failure, where it is
 * the only information there is.
 */
async function tryFetch(url, options) {
  const r = await fetch(url, options)
  if (!r.ok) {
    let message = `${options?.method || 'GET'} ${url} ${r.status}`
    try {
      const ct = r.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        const body = await r.json()
        if (body && body.error) message = body.error
      }
    } catch { /* body was not readable — keep the status line */ }
    throw new Error(message)
  }
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
  // `my-activity` is in every role: it is the personal audit log + per-role
  // KPIs ("how much did I do today"), backed by /api/audit?actor_id=<me>
  // which the API authorises self-scoped for any signed-in user. The global
  // `audit` stays manager+accountant only.
  manager: ['dashboard', 'orders', 'menu', 'pnl', 'expenses', 'revenue', 'inventory', 'waste', 'staff', 'shifts', 'timeclock', 'reports', 'reservations', 'delivery', 'audit', 'settings', 'pipeline', 'tables', 'attendance', 'staff-requests', 'payroll', 'my-activity', 'employee-activity', 'employee-history'],
  'head-chef': ['dashboard', 'orders', 'inventory', 'waste', 'reports', 'pipeline', 'my-activity'],
  'assistant-chef': ['dashboard', 'orders', 'inventory', 'my-activity'],
  'head-waiter': ['dashboard', 'orders', 'tables', 'reservations', 'reports', 'pipeline', 'my-activity'],
  cashier: ['dashboard', 'orders', 'tables', 'reports', 'timeclock', 'reservations', 'revenue', 'my-activity'],
  'delivery-staff': ['dashboard', 'delivery', 'my-activity'],
  cleaner: ['dashboard', 'waste', 'my-activity'],
  /**
   * §47's accountant. Reads the financial picture including the HR records they
   * need at month end; the server matrix grants write on expenses alone, so
   * every other screen here is view-only.
   *
   * Deliberately no `settings`: the tax bands are theirs to advise on, and a
   * manager applies them, which keeps the change and its audit entry with the
   * person answerable for it.
   */
  accountant: ['dashboard', 'reports', 'pnl', 'revenue', 'expenses', 'orders', 'attendance', 'payroll', 'audit', 'my-activity']
}

export const ROLE_DEFAULT_VIEW = {
  manager: 'dashboard',
  'head-chef': 'orders',
  'assistant-chef': 'orders',
  'head-waiter': 'tables',
  cashier: 'orders',
  'delivery-staff': 'delivery',
  cleaner: 'waste',
  accountant: 'reports'
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
  { view: 'attendance', label: 'Attendance', icon: 'calendar', section: 'HR' },
  { view: 'staff-requests', label: 'Leave & Overtime', icon: 'file-text', section: 'HR' },
  { view: 'payroll', label: 'Payroll', icon: 'wallet', section: 'HR' },
  { view: 'audit', label: 'Audit Log', icon: 'shield', section: 'System' },
  // My Activity is every signed-in user's own audit slice + role-aware KPIs
  // (dishes sent, deliveries completed, payments verified…). Lives next to
  // the global Audit Log; the global trail is manager+accountant only,
  // this one is everyone's own recap.
  { view: 'my-activity', label: 'My Activity', icon: 'file-text', section: 'System' },
  { view: 'employee-activity', label: 'Employee Activity', icon: 'users', section: 'System' },
  { view: 'settings', label: 'Settings', icon: 'settings', section: 'System' }
]

export const TODAY = () => new Date().toISOString().slice(0, 10)
