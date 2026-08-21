import { describe, it, expect, vi } from 'vitest'
import { createAuthGuard } from '../../src/router/guard'

// A stand-in for the auth store. Only the members the guard reads are here, so
// a change to the store's shape shows up as a failure rather than a pass
// against a mock that drifted.
function fakeAuth(overrides = {}) {
  return {
    isAuthenticated: false,
    defaultView: 'dashboard',
    permissions: ['dashboard', 'orders'],
    hasPermission(view) {
      return this.permissions.includes(view)
    },
    checkSession: vi.fn(async function () {
      return this.isAuthenticated
    }),
    ...overrides,
  }
}

const LOGIN = { name: 'login', path: '/login', fullPath: '/login', meta: {} }
const GUARDED = (name) => ({ name, path: '/app/' + name, fullPath: '/app/' + name, meta: { requiresAuth: true } })

async function run(auth, to) {
  const guard = createAuthGuard(() => auth)
  const next = vi.fn()
  await guard(to, { name: null }, next)
  return next.mock.calls[0][0]
}

describe('backoffice router auth guard', () => {
  // The bug this file was written for, and the same one the POS had: a
  // returning user with a live session landed on the sign-in form and stayed
  // there, because the session was only restored on guarded routes and nothing
  // sent an authenticated user onward.
  it('restores the session on the login route and sends the user to their default view', async () => {
    const auth = fakeAuth({
      checkSession: vi.fn(async function () {
        this.isAuthenticated = true
        return true
      }),
    })

    const arg = await run(auth, LOGIN)

    expect(auth.checkSession).toHaveBeenCalled()
    expect(arg).toEqual({ name: 'dashboard' })
  })

  it('leaves a genuinely signed-out visitor on the login form', async () => {
    const auth = fakeAuth()

    const arg = await run(auth, LOGIN)

    expect(auth.checkSession).toHaveBeenCalled()
    expect(arg).toBeUndefined()
  })

  it('attempts session restoration only once per page load', async () => {
    const auth = fakeAuth()
    const guard = createAuthGuard(() => auth)

    await guard(LOGIN, { name: null }, vi.fn())
    await guard(LOGIN, { name: null }, vi.fn())

    expect(auth.checkSession).toHaveBeenCalledTimes(1)
  })

  it('sends an unauthenticated visitor away from a guarded route', async () => {
    expect(await run(fakeAuth(), GUARDED('orders'))).toBe('/login')
  })

  it('redirects a route the role cannot reach to the default view', async () => {
    const auth = fakeAuth({ isAuthenticated: true })
    expect(await run(auth, GUARDED('payroll'))).toEqual({ name: 'dashboard' })
  })

  it('lets a permitted route through', async () => {
    const auth = fakeAuth({ isAuthenticated: true })
    expect(await run(auth, GUARDED('orders'))).toBeUndefined()
  })

  // A role whose own default view is not granted would otherwise ping-pong
  // between the permission check and its fallback forever.
  it('does not loop when the default view itself is not permitted', async () => {
    const auth = fakeAuth({ isAuthenticated: true, permissions: [] })

    expect(await run(auth, GUARDED('dashboard'))).toBe('/login')
    expect(await run(auth, LOGIN)).toBeUndefined()
  })
})
