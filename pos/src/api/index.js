import { dbGetAll, dbCacheAll, queueMutation } from '../db'

// Default to a same-origin path so the Pages Function (functions/api/[[path]].js)
// proxies the request server-side. This keeps the session cookie first-party and
// avoids third-party cookie blocking in modern browsers. VITE_API_URL can still
// override at build time for local dev or for pointing at a different API host
// during debugging.
export const API = import.meta.env.VITE_API_URL || ''

// Reactive online state
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

// Listen for online/offline
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOnline(true))
  window.addEventListener('offline', () => setOnline(false))
}

// Default request timeout (10 seconds)
const REQUEST_TIMEOUT_MS = 10000

// Retry configuration for transient failures
const MAX_RETRIES = 2
const INITIAL_RETRY_DELAY_MS = 500
const RETRYABLE_STATUS_CODES = [502, 503, 504, 429]

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function tryFetch(url, options, retries = MAX_RETRIES) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const r = await fetch(url, { ...options, signal: controller.signal })
    if (!r.ok) {
      // Try to parse error body for a meaningful message
      let errMsg = `${options?.method || 'GET'} ${url} ${r.status}`
      try {
        const ct = r.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          const errBody = await r.json()
          if (errBody.error) errMsg = errBody.error
        }
      } catch { /* ignore parse failure */ }

      // Retry on transient server errors
      const isRetryable = RETRYABLE_STATUS_CODES.includes(r.status) && retries > 0
      if (isRetryable) {
        const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, MAX_RETRIES - retries)
        console.warn(`Retrying ${options?.method || 'GET'} ${url} (${r.status}), attempt ${MAX_RETRIES - retries + 2}/${MAX_RETRIES + 1} in ${retryDelay}ms`)
        await delay(retryDelay)
        return tryFetch(url, options, retries - 1)
      }

      throw new Error(errMsg)
    }
    return r.json()
  } catch (e) {
    // Retry on network errors (not timeouts/aborts) for non-auth endpoints
    const isAuthEndpoint = url.includes('/auth/')
    const isNetworkError = e.name !== 'AbortError' && !isAuthEndpoint
    if (isNetworkError && retries > 0) {
      const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, MAX_RETRIES - retries)
      console.warn(`Retrying ${options?.method || 'GET'} ${url} (network error), attempt ${MAX_RETRIES - retries + 2}/${MAX_RETRIES + 1} in ${retryDelay}ms`)
      await delay(retryDelay)
      return tryFetch(url, options, retries - 1)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// Offline-first GET: network first, fallback to IndexedDB cache
export async function apiGet(endpoint) {
  const url = `${API}/api/${endpoint}`
  try {
    const data = await tryFetch(url, { credentials: 'include' })
    // Cache response locally for offline use
    if (Array.isArray(data)) {
      const store = endpoint.split('/')[0]
      dbCacheAll(store, data).catch(() => {})
    }
    return data
  } catch (e) {
    // Offline — try local cache
    const store = endpoint.split('/')[0]
    const cached = await dbGetAll(store).catch(() => null)
    if (cached && cached.length) return cached
    throw e
  }
}

export async function apiPost(endpoint, data) {
  const url = `${API}/api/${endpoint}`
  try {
    return await tryFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    })
  } catch (e) {
    // Don't queue auth mutations — login/logout/password changes must surface errors
    if (endpoint.startsWith('auth/')) throw e
    // Queue for later sync
    await queueMutation('POST', endpoint, data)
    // Return optimistic response
    return { ok: true, id: 'offline-' + Date.now(), ...data, _offline: true }
  }
}

export async function apiPut(endpoint, data) {
  const url = `${API}/api/${endpoint}`
  try {
    return await tryFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    })
  } catch (e) {
    await queueMutation('PUT', endpoint, data)
    return { ok: true, _offline: true }
  }
}

export async function apiDelete(endpoint, id) {
  const url = `${API}/api/${endpoint}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify(id ? { id } : undefined)
    })
    if (!r.ok) throw new Error(`DELETE ${endpoint} ${r.status}`)
    return r.json()
  } catch (e) {
    const body = id ? { id } : undefined
    await queueMutation('DELETE', endpoint, body)
    return { ok: true, _offline: true }
  } finally {
    clearTimeout(timer)
  }
}

// Role permissions (unchanged)
export const ROLE_PERMISSIONS = {
  manager: ['dashboard', 'orders', 'tables', 'menu-mgmt', 'menu-view', 'expenses', 'pnl', 'cashdrawer', 'inventory', 'waste', 'staff', 'shifts', 'timeclock', 'kitchen', 'reports', 'reservations', 'delivery', 'analytics', 'checkout'],
  'head-chef': ['kitchen', 'orders', 'dashboard', 'inventory', 'waste', 'reports', 'pipeline'],
  'assistant-chef': ['kitchen', 'orders', 'dashboard', 'inventory'],
  'head-waiter': ['tables', 'orders', 'dashboard', 'menu-view', 'reservations', 'checkout'],
  cashier: ['cashdrawer', 'orders', 'dashboard', 'tables', 'reports', 'timeclock', 'reservations', 'revenue', 'menu-view', 'analytics', 'checkout'],
  'delivery-staff': ['delivery', 'dashboard'],
  cleaner: ['waste', 'dashboard']
}

export const ROLE_DEFAULT_VIEW = {
  manager: 'dashboard',
  'head-chef': 'kitchen',
  'assistant-chef': 'kitchen',
  'head-waiter': 'tables',
  cashier: 'cashdrawer',
  'delivery-staff': 'delivery',
  cleaner: 'waste'
}

export const NAV_ITEMS = [
  { view: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', section: 'Overview' },
  { view: 'orders', label: 'Orders', icon: 'shopping-cart', section: 'Sales' },
  { view: 'menu-mgmt', label: 'Menu', icon: 'utensils', section: 'Sales' },
  { view: 'menu-view', label: 'Menu View', icon: 'book', section: 'Sales' },
  { view: 'tables', label: 'Tables', icon: 'grid-3x3', section: 'Operations' },
  { view: 'reservations', label: 'Reservations', icon: 'calendar', section: 'Operations' },
  { view: 'delivery', label: 'Delivery', icon: 'truck', section: 'Operations' },
  { view: 'kitchen', label: 'Kitchen', icon: 'chef-hat', section: 'Operations' },
  { view: 'expenses', label: 'Expenses', icon: 'wallet', section: 'Finance' },
  { view: 'pnl', label: 'P&L', icon: 'chart-bar', section: 'Finance' },
  { view: 'cashdrawer', label: 'Cash Drawer', icon: 'cash', section: 'Finance' },
  { view: 'inventory', label: 'Inventory', icon: 'package', section: 'Stock' },
  { view: 'waste', label: 'Waste Log', icon: 'trash-2', section: 'Stock' },
  { view: 'staff', label: 'Staff', icon: 'users', section: 'HR' },
  { view: 'shifts', label: 'Shifts', icon: 'clock', section: 'HR' },
  { view: 'timeclock', label: 'Time Clock', icon: 'fingerprint', section: 'HR' },
  { view: 'reports', label: 'Reports', icon: 'file-text', section: 'Analytics' },
  { view: 'analytics', label: 'Analytics', icon: 'bar-chart-2', section: 'Analytics' },
  { view: 'checkout', label: 'Checkout', icon: 'credit-card', section: 'Sales' },
  { view: 'pipeline', label: 'Pipeline', icon: 'git-branch', section: 'Operations' },
  { view: 'revenue', label: 'Revenue', icon: 'trending-up', section: 'Finance' }
]

/**
 * Today's date as YYYY-MM-DD in the **restaurant's local timezone**.
 *
 * Must not use toISOString(), which is UTC: Addis Ababa is UTC+3, so between
 * 00:00 and 03:00 local the UTC date is still yesterday. That silently filed
 * every post-midnight order, expense and reservation under the previous
 * business day — and order `created` stamps are local ("2026-08-06 01:55:46"),
 * so comparing them against a UTC date never lined up either.
 */
export const TODAY = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Build an SSE URL that works in both dev and production.
// Uses the same origin so the Cloudflare Pages Function proxy handles the connection.
export function getSSEUrl(eventPath) {
  const proto = window.location.protocol === 'https:' ? 'https' : 'http'
  return `${proto}://${window.location.host}/api/events/${eventPath}`
}
