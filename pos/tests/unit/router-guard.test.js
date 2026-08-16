import { describe, it, expect, vi } from 'vitest'
import { createAuthGuard } from '../../src/router/guard'

// A stand-in for the auth store. Only the members the guard reads are here,
// so a change to the store's shape shows up as a failure rather than a pass
// against a mock that drifted.
function fakeAuth(overrides = {}) {
  return {
    isAuthenticated: false,
    mustChangePassword: false,
    defaultView: 'cashdrawer',
    permissions: ['cashdrawer', 'dashboard'],
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

// Runs the guard once and reports what it passed to next().
async function run(auth, to) {
  const guard = createAuthGuard(() => auth)
  const next = vi.fn()
  await guard(to, { name: null }, next)
  return next.mock.calls[0][0]
}

describe('router auth guard', () => {
  // The bug this file was written for: a returning user with a live session
  // landed on the sign-in form and stayed there, because the session was only
  // restored on guarded routes and nothing sent an authenticated user onward.
  it('restores the session on the login route and sends the user to their default view', async () => {
    const auth = fakeAuth({
      checkSession: vi.fn(async function () {
        this.isAuthenticated = true
        return true
      }),
    })

    const arg = await run(auth, LOGIN)

    expect(auth.checkSession).toHaveBeenCalled()
    expect(arg).toEqual({ name: 'cashdrawer' })
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
    const arg = await run(fakeAuth(), GUARDED('cashdrawer'))
    expect(arg).toBe('/login')
  })

  it('sends a flagged account to change-password', async () => {
    const auth = fakeAuth({ isAuthenticated: true, mustChangePassword: true })
    const arg = await run(auth, GUARDED('cashdrawer'))
    expect(arg).toEqual({ name: 'change-password' })
  })

  // change-password is in nobody's permission list, so a permission check that
  // did not exempt it would bounce the one reachable route straight back into
  // the mustChangePassword redirect, and the two would trade the navigation
  // until the router gave up.
  it('lets a flagged account reach change-password without looping', async () => {
    const auth = fakeAuth({ isAuthenticated: true, mustChangePassword: true })
    const to = { name: 'change-password', path: '/change-password', fullPath: '/change-password', meta: { requiresAuth: true } }

    const arg = await run(auth, to)

    expect(arg).toBeUndefined()
  })

  it('redirects a route the role cannot reach to the default view', async () => {
    const auth = fakeAuth({ isAuthenticated: true })
    const arg = await run(auth, GUARDED('pnl'))
    expect(arg).toEqual({ name: 'cashdrawer' })
  })

  it('lets a permitted route through', async () => {
    const auth = fakeAuth({ isAuthenticated: true })
    const arg = await run(auth, GUARDED('cashdrawer'))
    expect(arg).toBeUndefined()
  })

  // A role whose own default view is not granted would otherwise ping-pong
  // between the permission check and its fallback forever.
  it('does not loop when the default view itself is not permitted', async () => {
    const auth = fakeAuth({ isAuthenticated: true, permissions: [] })

    expect(await run(auth, GUARDED('cashdrawer'))).toBe('/login')
    expect(await run(auth, LOGIN)).toBeUndefined()
  })
})
