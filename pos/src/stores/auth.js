import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiGet, apiPost, ROLE_PERMISSIONS, ROLE_DEFAULT_VIEW } from '../api'
import { dbClearCaches } from '../db'

/**
 * Who was signed in last, kept so an outage does not lock the floor out.
 *
 * The session cookie lasts 30 days, but every page load calls /api/auth/me to
 * turn it back into an identity. With no internet that call fails, the guard
 * sees a signed-out user and sends them to a login screen that cannot work
 * offline either — so a tablet that reboots mid-outage is finished for the
 * duration, which is precisely when the cafe can least afford it.
 *
 * This grants nothing. The server is still the only authority: every request
 * carries the same cookie and is authorised server-side, so a tampered cache
 * buys a set of screens that 401 on contact. What it restores is the client's
 * memory of who it was, which was never a security boundary.
 */
const IDENTITY_KEY = 'fufut.pos.identity'
const IDENTITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000  // matches the session cookie

function rememberIdentity(user, role) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ user, role, at: Date.now() }))
  } catch { /* private mode: the session simply will not survive a reload */ }
}

function forgetIdentity() {
  try { localStorage.removeItem(IDENTITY_KEY) } catch { /* nothing to clean up */ }
}

function recallIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved || !saved.user) return null
    // Never outlive the cookie it stands in for.
    if (!Number.isFinite(saved.at) || Date.now() - saved.at > IDENTITY_MAX_AGE_MS) {
      forgetIdentity()
      return null
    }
    return saved
  } catch {
    forgetIdentity()
    return null
  }
}

/**
 * Did the server actually refuse us, or could we simply not reach it?
 *
 * The distinction is the whole safety of the offline path. A 401 means the
 * session is genuinely gone and the cache must go with it; no status at all
 * means the request never arrived, and the last known identity still stands.
 */
function serverRefused(err) {
  return err && (err.status === 401 || err.status === 403)
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const roleKey = ref('')
  const loading = ref(false)
  // Set when this account is carrying a password a manager issued. The server
  // refuses everything except changing it, so the app must send the person
  // straight there rather than onto a dashboard that then 403s every request.
  const mustChangePassword = ref(false)
  // True when the identity came from cache rather than the server, so screens
  // can say so rather than implying everything is normal.
  const offlineIdentity = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const permissions = computed(() => (ROLE_PERMISSIONS && ROLE_PERMISSIONS[roleKey.value]) || [])
  const defaultView = computed(() => (ROLE_DEFAULT_VIEW && ROLE_DEFAULT_VIEW[roleKey.value]) || 'dashboard')

  function hasPermission(view) {
    return Array.isArray(permissions.value) && permissions.value.includes(view)
  }

  async function login(staffId, password) {
    loading.value = true
    try {
      const res = await apiPost('auth/login', { staffId, password })
      if (!res.ok) throw new Error(res.error || 'Login failed')
      user.value = res.user
      roleKey.value = (res.role || '').toLowerCase().replace(/\s+/g, '-')
      mustChangePassword.value = res.mustChangePassword === true
      rememberIdentity(res.user, res.role)
      offlineIdentity.value = false
      return res
    } finally {
      loading.value = false
    }
  }

  async function loginWithEmail(email, password) {
    loading.value = true
    try {
      const res = await apiPost('auth/login', { email, password })
      if (!res.ok) throw new Error(res.error || 'Login failed')
      user.value = res.user
      roleKey.value = (res.role || '').toLowerCase().replace(/\s+/g, '-')
      mustChangePassword.value = res.mustChangePassword === true
      rememberIdentity(res.user, res.role)
      offlineIdentity.value = false
      return res
    } finally {
      loading.value = false
    }
  }

  async function checkSession() {
    try {
      const res = await apiGet('auth/me')
      if (res.ok) {
        user.value = res.user
        roleKey.value = (res.role || '').toLowerCase().replace(/\s+/g, '-')
        rememberIdentity(res.user, res.role)
        offlineIdentity.value = false
        return true
      }
      // A reachable server that says no is the end of the session.
      forgetIdentity()
    } catch (e) {
      if (serverRefused(e)) {
        forgetIdentity()
        return false
      }
      // Could not reach the server. Carry on as whoever was signed in here
      // last; the cookie goes with every request and the server decides.
      const saved = recallIdentity()
      if (saved) {
        user.value = saved.user
        roleKey.value = (saved.role || '').toLowerCase().replace(/\s+/g, '-')
        offlineIdentity.value = true
        return true
      }
      console.warn('Session check failed and no cached identity:', e.message)
    }
    return false
  }

  /**
   * Re-check who is signed in, and report whether it is still the same person.
   *
   * The store reads the role once at startup and then never asks again, so a
   * session that changes underneath a running app leaves the previous person's
   * screens on the tablet: a chef looking at Cash Drawer, or a cashier at
   * Recipes. The server refuses the data behind them, so nothing leaks — but
   * the menu is wrong, and staff reasonably conclude the roles do not work.
   *
   * Returns 'same', 'changed', 'ended' or 'unknown' ('unknown' being an
   * unreachable server, which is not grounds for disturbing anybody).
   */
  async function revalidate() {
    const wasId = user.value && user.value.id
    const wasRole = roleKey.value
    const ok = await checkSession()

    if (!ok) return wasId ? 'ended' : 'same'
    // checkSession falls back to the cached identity when the server cannot be
    // reached. That tells us nothing new, so it must not count as a change.
    if (offlineIdentity.value) return 'unknown'

    const nowId = user.value && user.value.id
    return nowId !== wasId || roleKey.value !== wasRole ? 'changed' : 'same'
  }

  async function logout() {
    try { await apiPost('auth/logout', {}) } catch (e) {
      console.warn('Logout request failed:', e.message)
    }
    user.value = null
    roleKey.value = ''
    mustChangePassword.value = false
    offlineIdentity.value = false
    forgetIdentity()

    /**
     * Leave nothing on the device for the next person.
     *
     * A till is shared. Every list the app reads is cached locally for offline
     * use, keyed by endpoint with no record of who read it, so without this the
     * cached orders, staff and takings of one shift are still sitting there
     * when the next person signs in. The service worker keeps its own copy of
     * every successful API GET, so that goes too.
     *
     * Queued writes are untouched: they are orders the venue has taken and not
     * yet sent, and losing them at sign-out would be losing real work.
     */
    try { await dbClearCaches() } catch { /* nothing to clear */ }
    try {
      if (typeof caches !== 'undefined') {
        const names = await caches.keys()
        await Promise.all(names.map((n) => caches.delete(n)))
      }
    } catch { /* no service worker cache on this device */ }
  }

  /**
   * Replace the current password. Clears the flag on success, which is what
   * releases the rest of the app - the server is refusing everything else until
   * this succeeds.
   */
  async function changePassword(currentPassword, newPassword) {
    const res = await apiPost('auth/change-password', { currentPassword, newPassword })
    if (!res.ok) throw new Error(res.error || 'Could not change password')
    mustChangePassword.value = false
    return res
  }

  return { user, roleKey, loading, mustChangePassword, offlineIdentity, isAuthenticated, permissions, defaultView, hasPermission, login, loginWithEmail, checkSession, revalidate, logout, changePassword }
})
