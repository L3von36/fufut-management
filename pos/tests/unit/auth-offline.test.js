import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../../src/stores/auth'

vi.mock('../../src/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  ROLE_PERMISSIONS: { manager: ['dashboard'], 'head-waiter': ['tables', 'dashboard'] },
  ROLE_DEFAULT_VIEW: { manager: 'dashboard', 'head-waiter': 'tables' },
}))

import { apiGet, apiPost } from '../../src/api'

const WAITER = { id: 'S6', firstName: 'Yonas' }

/** A request that never reached the server carries no status. */
function networkFailure() {
  return Object.assign(new Error('Failed to fetch'), { status: undefined })
}

/** A server that answered, and said no. */
function refused(status) {
  return Object.assign(new Error('Authentication required'), { status })
}

/**
 * Signing in and then losing the internet.
 *
 * The session cookie lasts 30 days, but every page load turns it back into an
 * identity by calling /api/auth/me. With no line that call fails, the guard
 * sees a signed-out user, and the login screen it redirects to cannot work
 * offline either — so a tablet that reboots mid-outage is finished for the
 * duration. That is exactly when the floor can least afford it.
 */
describe('a signed-in session survives an outage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('remembers who signed in', async () => {
    apiPost.mockResolvedValue({ ok: true, user: WAITER, role: 'head-waiter' })
    const auth = useAuthStore()
    await auth.loginWithEmail('yonas@fufut.coffee', 'x')

    expect(localStorage.getItem('fufut.pos.identity')).toBeTruthy()
  })

  it('stays signed in when the server cannot be reached', async () => {
    apiPost.mockResolvedValue({ ok: true, user: WAITER, role: 'head-waiter' })
    const first = useAuthStore()
    await first.loginWithEmail('yonas@fufut.coffee', 'x')

    // A reload during the outage: fresh store, no server.
    setActivePinia(createPinia())
    apiGet.mockRejectedValue(networkFailure())
    const auth = useAuthStore()

    await expect(auth.checkSession()).resolves.toBe(true)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.roleKey).toBe('head-waiter')
    // And the screen can say so rather than implying all is well.
    expect(auth.offlineIdentity).toBe(true)
  })

  /**
   * The distinction the whole safety of this rests on. A refusal is the
   * session genuinely ending; an unreachable server is not.
   */
  it('signs out when the server actually refuses', async () => {
    apiPost.mockResolvedValue({ ok: true, user: WAITER, role: 'head-waiter' })
    const first = useAuthStore()
    await first.loginWithEmail('yonas@fufut.coffee', 'x')

    setActivePinia(createPinia())
    apiGet.mockRejectedValue(refused(401))
    const auth = useAuthStore()

    await expect(auth.checkSession()).resolves.toBe(false)
    expect(auth.isAuthenticated).toBe(false)
    // The cached identity goes with the session, so the next reload cannot
    // resurrect it.
    expect(localStorage.getItem('fufut.pos.identity')).toBeNull()
  })

  it('does not invent a session for a device nobody signed in on', async () => {
    apiGet.mockRejectedValue(networkFailure())
    const auth = useAuthStore()

    await expect(auth.checkSession()).resolves.toBe(false)
    expect(auth.isAuthenticated).toBe(false)
  })

  it('refuses a cached identity older than the cookie it stands in for', async () => {
    const tooOld = Date.now() - 31 * 24 * 60 * 60 * 1000
    localStorage.setItem('fufut.pos.identity', JSON.stringify({ user: WAITER, role: 'head-waiter', at: tooOld }))
    apiGet.mockRejectedValue(networkFailure())
    const auth = useAuthStore()

    await expect(auth.checkSession()).resolves.toBe(false)
    expect(auth.isAuthenticated).toBe(false)
  })

  it('ignores a cache it cannot read rather than throwing', async () => {
    localStorage.setItem('fufut.pos.identity', 'not json')
    apiGet.mockRejectedValue(networkFailure())
    const auth = useAuthStore()

    await expect(auth.checkSession()).resolves.toBe(false)
  })

  it('clears the cache on sign out', async () => {
    apiPost.mockResolvedValue({ ok: true, user: WAITER, role: 'head-waiter' })
    const auth = useAuthStore()
    await auth.loginWithEmail('yonas@fufut.coffee', 'x')

    apiPost.mockResolvedValue({ ok: true })
    await auth.logout()

    expect(localStorage.getItem('fufut.pos.identity')).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('drops the offline flag once the server answers again', async () => {
    localStorage.setItem('fufut.pos.identity', JSON.stringify({ user: WAITER, role: 'head-waiter', at: Date.now() }))
    apiGet.mockRejectedValue(networkFailure())
    const auth = useAuthStore()
    await auth.checkSession()
    expect(auth.offlineIdentity).toBe(true)

    apiGet.mockResolvedValue({ ok: true, user: WAITER, role: 'head-waiter' })
    await auth.checkSession()
    expect(auth.offlineIdentity).toBe(false)
  })
})
