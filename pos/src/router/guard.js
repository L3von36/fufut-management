/**
 * The navigation guard, kept out of the route table so it can be exercised
 * without pulling in every view behind a dynamic import. `useAuth` is passed
 * in rather than imported for the same reason: the guard needs a store, not a
 * Pinia instance.
 */
export function createAuthGuard(useAuth) {
  // Whether session restoration has been attempted this page load.
  let sessionChecked = false

  return async function authGuard(to, from, next) {
    const auth = useAuth()

    // Restore the server session once per page load, on every route rather
    // than only the guarded ones. /login is where a returning user actually
    // lands, and skipping the check there left them looking at a sign-in form
    // with a valid session sitting in the cookie jar.
    if (!sessionChecked) {
      sessionChecked = true
      if (!auth.isAuthenticated) await auth.checkSession()
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return next('/login')
    }

    // Signed in and pointed at the sign-in form: send them where they were
    // going to end up anyway. Restoring the session and then rendering the
    // form regardless is indistinguishable from being signed out.
    if (to.name === 'login' && auth.isAuthenticated) {
      if (auth.mustChangePassword) return next({ name: 'change-password' })
      // A role with no reachable landing view has nowhere to be sent, so it
      // stays on the form rather than bouncing against the permission check.
      if (auth.hasPermission(auth.defaultView)) return next({ name: auth.defaultView })
      return next()
    }

    // An account carrying a manager-issued password can go exactly one place.
    // The server enforces this too - it refuses every other endpoint - so this
    // guard exists to explain rather than to protect: without it the person lands
    // on a dashboard where every request fails with no stated reason.
    if (auth.mustChangePassword && to.name !== 'change-password') {
      return next({ name: 'change-password' })
    }

    // Permission guard. change-password is exempt because it is nobody's
    // granted view: checking it here would bounce the one route a flagged
    // account may reach back into the redirect above, and the two would trade
    // the navigation until the router gave up.
    if (to.meta.requiresAuth && to.name && to.name !== 'login' && to.name !== 'change-password') {
      if (!auth.hasPermission(to.name)) {
        // The fallback is the destination, so redirecting there again would
        // spin. Treat it as no usable session instead.
        if (to.name === auth.defaultView) return next('/login')
        return next({ name: auth.defaultView })
      }
    }

    next()
  }
}
