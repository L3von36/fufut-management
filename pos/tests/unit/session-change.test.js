import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../../src/stores/auth'

vi.mock('../../src/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  ROLE_PERMISSIONS: { manager: ['dashboard'], 'head-chef': ['kitchen'], cashier: ['cashdrawer'] },
  ROLE_DEFAULT_VIEW: { 'head-chef': 'kitchen', cashier: 'cashdrawer' },
}))
vi.mock('../../src/db', () => ({ dbClearCaches: vi.fn(async () => {}) }))

import { apiGet, apiPost } from '../../src/api'

const CHEF = { user: { id: 'S1', firstName: 'Selam' }, role: 'head-chef', ok: true }
const CASHIER = { user: { id: 'S2', firstName: 'Bereket' }, role: 'cashier', ok: true }

/**
 * A till is a shared device, often left open across a shift change and often in
 * more than one tab. The store reads the role once at startup, so a session
 * that changes underneath a running app left the previous person's menu on
 * screen — a chef looking at Cash Drawer. The server refuses the data behind
 * those screens, so nothing leaks; it simply looks as though roles do not work,
 * which is worse than it sounds because staff stop trusting the thing.
 */
describe('noticing that somebody else has signed in', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('says nothing changed when it is still the same person', async () => {
    apiPost.mockResolvedValue(CHEF)
    const auth = useAuthStore()
    await auth.loginWithEmail('selam@fufut.coffee', 'x')

    apiGet.mockResolvedValue(CHEF)
    await expect(auth.revalidate()).resolves.toBe('same')
    expect(auth.roleKey).toBe('head-chef')
  })

  it('reports a change when a different person signed in', async () => {
    apiPost.mockResolvedValue(CHEF)
    const auth = useAuthStore()
    await auth.loginWithEmail('selam@fufut.coffee', 'x')

    // Somebody signed in on another tab; the cookie now belongs to the cashier.
    apiGet.mockResolvedValue(CASHIER)

    await expect(auth.revalidate()).resolves.toBe('changed')
    expect(auth.roleKey).toBe('cashier')
  })

  it('reports a change when the same person comes back with a different role', async () => {
    // A manager who demoted somebody mid-shift, or a role corrected in the
    // backoffice: same id, different powers.
    apiPost.mockResolvedValue(CHEF)
    const auth = useAuthStore()
    await auth.loginWithEmail('selam@fufut.coffee', 'x')

    apiGet.mockResolvedValue({ ok: true, user: CHEF.user, role: 'cashier' })
    await expect(auth.revalidate()).resolves.toBe('changed')
  })

  it('reports the session ending', async () => {
    apiPost.mockResolvedValue(CHEF)
    const auth = useAuthStore()
    await auth.loginWithEmail('selam@fufut.coffee', 'x')

    apiGet.mockRejectedValue(Object.assign(new Error('Authentication required'), { status: 401 }))
    await expect(auth.revalidate()).resolves.toBe('ended')
  })

  it('does not disturb anybody when the server cannot be reached', async () => {
    // The one that matters during an outage: checkSession restores the cached
    // identity, which tells us nothing new. Treating that as a change would
    // reload the till — repeatedly — in the middle of service, on the one day
    // it can least afford it.
    apiPost.mockResolvedValue(CHEF)
    const auth = useAuthStore()
    await auth.loginWithEmail('selam@fufut.coffee', 'x')

    apiGet.mockRejectedValue(Object.assign(new Error('Failed to fetch'), { status: undefined }))

    await expect(auth.revalidate()).resolves.toBe('unknown')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.offlineIdentity).toBe(true)
  })

  it('does not report an ending for a device nobody was signed in on', async () => {
    apiGet.mockRejectedValue(Object.assign(new Error('Authentication required'), { status: 401 }))
    const auth = useAuthStore()

    await expect(auth.revalidate()).resolves.toBe('same')
  })
})
