import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * Server-granted screens (the backoffice Role Access page).
 *
 * The static ROLE_PERMISSIONS array stays the base, but the server can now
 * grant a role an extra view — v1 being a category-scoped Inventory for the
 * barista. The grant arrives on the login and auth/me responses, and must
 * behave exactly like a static permission as far as the nav and route guard
 * are concerned: present when granted, absent when not, gone on logout, and
 * still remembered by the offline identity cache.
 */

const mockApiPost = vi.fn()
const mockApiGet = vi.fn()

vi.mock('../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  ROLE_PERMISSIONS: {
    barista: ['barista', 'orders', 'alerts', 'waste', 'recipes', 'timeclock', 'my-activity'],
    manager: ['dashboard', 'inventory'],
  },
  ROLE_DEFAULT_VIEW: { barista: 'barista', manager: 'dashboard' },
}))

vi.mock('../../src/db', () => ({ dbClearCaches: vi.fn() }))

import { useAuthStore } from '../../src/stores/auth'

const LOGIN_OK = (grants) => ({
  ok: true,
  user: { id: 'S1', firstName: 'Barista', role: 'barista' },
  role: 'barista',
  mustChangePassword: false,
  screenGrants: grants,
})

describe('auth store screen grants', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockApiPost.mockReset()
    mockApiGet.mockReset()
  })

  it('treats a granted view as a permission for nav and guards', async () => {
    mockApiPost.mockResolvedValue(LOGIN_OK(['inventory']))
    const auth = useAuthStore()
    await auth.loginWithEmail('probe2@fufut.coffee', 'x')
    expect(auth.hasPermission('inventory')).toBe(true)
    // Static permissions keep working beside the grant.
    expect(auth.hasPermission('barista')).toBe(true)
    // And a view nobody granted or listed is still refused.
    expect(auth.hasPermission('checkout')).toBe(false)
  })

  it('grants nothing when the server sends no list', async () => {
    mockApiPost.mockResolvedValue(LOGIN_OK(undefined))
    const auth = useAuthStore()
    await auth.loginWithEmail('probe2@fufut.coffee', 'x')
    expect(auth.hasPermission('inventory')).toBe(false)
  })

  it('refreshes grants on auth/me so a manager change lands on next load', async () => {
    mockApiPost.mockResolvedValue(LOGIN_OK([]))
    const auth = useAuthStore()
    await auth.loginWithEmail('probe2@fufut.coffee', 'x')
    expect(auth.hasPermission('inventory')).toBe(false)

    mockApiGet.mockResolvedValue({ ...LOGIN_OK(['inventory']), ok: true })
    await auth.checkSession()
    expect(auth.hasPermission('inventory')).toBe(true)
  })

  it('survives an offline reload through the cached identity', async () => {
    mockApiPost.mockResolvedValue(LOGIN_OK(['inventory']))
    const first = useAuthStore()
    await first.loginWithEmail('probe2@fufut.coffee', 'x')

    // A fresh store (page reload) whose auth/me cannot reach the server.
    mockApiGet.mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }))
    const second = useAuthStore()
    await second.checkSession()
    expect(second.offlineIdentity).toBe(true)
    expect(second.hasPermission('inventory')).toBe(true)
  })

  it('clears grants on logout', async () => {
    mockApiPost.mockResolvedValue(LOGIN_OK(['inventory']))
    const auth = useAuthStore()
    await auth.loginWithEmail('probe2@fufut.coffee', 'x')
    mockApiPost.mockResolvedValue({ ok: true })
    await auth.logout()
    expect(auth.hasPermission('inventory')).toBe(false)
  })
})
