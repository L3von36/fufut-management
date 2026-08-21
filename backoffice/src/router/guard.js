/**
 * The navigation guard, kept out of the route table so it can be exercised
 * without loading every view behind a dynamic import. `useAuth` is passed in
 * rather than imported for the same reason: the guard needs a store, not a
 * Pinia instance.
 *
 * The POS carries the same guard (pos/src/router/guard.js). It has one extra
 * branch there for accounts carrying a manager-issued password; the backoffice
 * has no change-password flow, so this is the same rule with that case absent.
 */
export function createAuthGuard(useAuth) {
  // Whether session restoration has been attempted this page load.
  let sessionChecked = false

  return async function authGuard(to, from, next) {
    const auth = useAuth()

    // Restore the server session once per page load, on every route rather than
    // only the guarded ones. /login is where a returning user actually lands,
    // and skipping the check there left them looking at a sign-in form with a
    // valid session sitting in the cookie jar.
    if (!sessionChecked) {
      sessionChecked = true
      if (!auth.isAuthenticated) await auth.checkSession()
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return next('/login')
    }

    // Signed in and pointed at the sign-in form: send them where they were
    // going to end up anyway. Restoring the session and then rendering the form
    // regardless is indistinguishable from being signed out.
    if (to.name === 'login' && auth.isAuthenticated) {
      // A role with no reachable landing view has nowhere to be sent, so it
      // stays on the form rather than bouncing against the permission check.
      if (auth.hasPermission(auth.defaultView)) return next({ name: auth.defaultView })
      return next()
    }

    if (to.meta.requiresAuth && to.name && !auth.hasPermission(to.name)) {
      // The fallback is the destination, so redirecting there again would spin.
      // Treat it as no usable session instead.
      if (to.name === auth.defaultView) return next('/login')
      return next({ name: auth.defaultView })
    }

    next()
  }
}
