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
      // A refusal often carries more than a sentence — which table is occupied,
      // which checks are still open. Keeping only `.error` threw that away and
      // left screens unable to say anything actionable about a 409.
      let errData = null
      try {
        const ct = r.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          const errBody = await r.json()
          errData = errBody
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

      // A refusal from the server is an answer, not an outage. Marking it so
      // the offline-retry paths can tell the difference: without the flag the
      // catch below re-caught this thrown HTTP error and retried it as though
      // the network had hiccupped — three identical failing writes and 1.5s of
      // dead air before the caller ever heard the refusal.
      const err = new Error(errMsg)
      err.status = r.status
      err.data = errData
      err.httpError = true
      throw err
    }
    return r.json()
  } catch (e) {
    // Retry on network errors (not timeouts/aborts, and not refusals the
    // !r.ok branch above threw with httpError set) for non-auth endpoints
    const isAuthEndpoint = url.includes('/auth/')
    const isNetworkError = !e.httpError && e.name !== 'AbortError' && !isAuthEndpoint
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
    /**
     * Only when the server never answered.
     *
     * `e.status` is set whenever a reply came back, so its absence is what
     * distinguishes "there is no network" from "the server said no". Falling
     * back on any error meant a refusal was served out of the cache instead:
     * the till caches every list it reads, keyed by endpoint alone with no
     * record of who read it, so a cleaner refused /api/staff with a 403 was
     * handed the manager's staff list that the previous shift had loaded on
     * that same tablet. The server was enforcing the role correctly and the
     * screen showed the data anyway.
     *
     * This is the same distinction the auth store draws for the cached
     * identity, and for the same reason.
     */
    if (e && e.status) throw e

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
    // The server answered and said no. Queueing that answer would replay the
    // same refused write every 30s forever while telling the caller it
    // succeeded — a waiter's blocked table claim used to become a fake
    // "offline" success exactly this way. Refusals go back to the caller.
    if (e && e.status) throw e
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
    // See apiPost: a status-carrying error is the server refusing, not the
    // network failing. Never queue a refusal as a pending write.
    if (e && e.status) throw e
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
    if (!r.ok) {
      // Same refusal/not-outage rule as the other verbs: carry the status so
      // the catch below can refuse cleanly instead of queueing the delete.
      const err = new Error(`DELETE ${endpoint} ${r.status}`)
      err.status = r.status
      err.httpError = true
      throw err
    }
    return r.json()
  } catch (e) {
    if (e && e.status) throw e
    const body = id ? { id } : undefined
    await queueMutation('DELETE', endpoint, body)
    return { ok: true, _offline: true }
  } finally {
    clearTimeout(timer)
  }
}

export async function apiPatch(endpoint, data) {
  const url = `${API}/api/${endpoint}`
  try {
    return await tryFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    })
  } catch (e) {
    // See apiPost: refusals (e.status set) must reach the caller, not the queue.
    if (e && e.status) throw e
    await queueMutation('PATCH', endpoint, data)
    return { ok: true, _offline: true }
  }
}

// Role permissions (unchanged)
export const ROLE_PERMISSIONS = {
  // 'staff' is absent deliberately: editing colleague accounts lives in the
  // backoffice, alongside Shifts, Time Clock and the audit log. Time Clock here
  // still reads the staff list to show who is on shift.
  manager: ['dashboard', 'orders', 'open-checks', 'tables', 'menu-mgmt', 'menu-view', 'expenses', 'pnl', 'cashdrawer', 'inventory', 'waste', 'shifts', 'timeclock', 'kitchen', 'reports', 'reservations', 'delivery', 'analytics', 'checkout', 'recipes', 'suppliers', 'purchases', 'stock-control', 'pipeline', 'audit'],
  // menu-mgmt is granted for one action: taking a dish off when the kitchen has
  // run out. The screen itself hides adding, editing, deleting, cost and margin
  // from anyone but a manager, and the API only lets this role write the
  // availability flag - so the grant cannot widen into repricing.
  // Recipes, stock control, suppliers and purchases are all food cost, which is
  // the head chef's responsibility. They write recipes and stock; suppliers and
  // purchases are read-only for them — seeing what arrived and at what price is
  // part of the job, committing the business to a vendor is not. This mirrors
  // the server matrix in fufut-api/src/auth.js; if the two disagree, the screen
  // renders and every request on it fails.
  'head-chef': ['kitchen', 'orders', 'dashboard', 'inventory', 'waste', 'reports', 'pipeline', 'menu-mgmt', 'recipes', 'stock-control', 'suppliers', 'purchases', 'timeclock'],
  // Cooks from the recipes, does not set them. Two people adjusting the same
  // counts is how a stock take stops reconciling.
  'assistant-chef': ['kitchen', 'orders', 'dashboard', 'inventory', 'recipes', 'timeclock'],
  // open-checks is the waiter's own outstanding work and the cashier's queue of
  // bills to take, so both get it. It reads orders and tables, which both roles
  // already read.
  // Every role carries 'timeclock' because everyone clocks on and off. The
  // screen's roster half needs `timeclock` and `staff` reads and is guarded,
  // falling back to empty; the clock-in/out half is self-service and works for
  // any signed-in account. Granting the underlying resources instead would give
  // the floor the power to rewrite anybody's hours.
  'head-waiter': ['tables', 'orders', 'open-checks', 'dashboard', 'menu-view', 'reservations', 'checkout', 'timeclock'],
  cashier: ['cashdrawer', 'orders', 'open-checks', 'dashboard', 'tables', 'reports', 'timeclock', 'reservations', 'revenue', 'menu-view', 'analytics', 'checkout'],
  'delivery-staff': ['delivery', 'dashboard', 'timeclock'],
  cleaner: ['waste', 'dashboard', 'timeclock'],
  // §47's seventh role. Reads the financial picture and changes almost none of
  // it — the server matrix grants write on expenses alone, so every other
  // screen here is deliberately view-only. No operational screens: an
  // accountant has no business seating a table or sending a ticket.
  accountant: ['dashboard', 'reports', 'revenue', 'pnl', 'expenses', 'analytics', 'orders', 'purchases', 'suppliers', 'timeclock']
}

export const ROLE_DEFAULT_VIEW = {
  manager: 'dashboard',
  'head-chef': 'kitchen',
  'assistant-chef': 'kitchen',
  'head-waiter': 'tables',
  cashier: 'cashdrawer',
  'delivery-staff': 'delivery',
  cleaner: 'waste',
  accountant: 'reports'
}

export const NAV_ITEMS = [
  { view: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', section: 'Overview' },
  { view: 'orders', label: 'Orders', icon: 'shopping-cart', section: 'Sales' },
  { view: 'open-checks', label: 'Open Checks', icon: 'credit-card', section: 'Sales' },
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
  { view: 'recipes', label: 'Recipes', icon: 'book', section: 'Stock' },
  { view: 'stock-control', label: 'Stock Control', icon: 'chart-bar', section: 'Stock' },
  { view: 'suppliers', label: 'Suppliers', icon: 'truck', section: 'Stock' },
  { view: 'purchases', label: 'Purchases', icon: 'wallet', section: 'Stock' },
  { view: 'waste', label: 'Waste Log', icon: 'trash-2', section: 'Stock' },
  { view: 'shifts', label: 'Shifts', icon: 'clock', section: 'HR' },
  { view: 'timeclock', label: 'Time Clock', icon: 'fingerprint', section: 'HR' },
  { view: 'reports', label: 'Reports', icon: 'file-text', section: 'Analytics' },
  { view: 'analytics', label: 'Analytics', icon: 'bar-chart-2', section: 'Analytics' },
  { view: 'checkout', label: 'Checkout', icon: 'credit-card', section: 'Sales' },
  { view: 'pipeline', label: 'Pipeline', icon: 'git-branch', section: 'Operations' },
  { view: 'revenue', label: 'Revenue', icon: 'trending-up', section: 'Finance' },
  { view: 'audit', label: 'Audit Log', icon: 'file-text', section: 'System' }
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
