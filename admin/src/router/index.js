import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import MenuView from '../views/MenuView.vue'
import ReviewsView from '../views/ReviewsView.vue'
import GalleryView from '../views/GalleryView.vue'
import LandingView from '../views/LandingView.vue'
import SettingsView from '../views/SettingsView.vue'
import OrdersView from '../views/OrdersView.vue'
import ReservationsView from '../views/ReservationsView.vue'
import AppLayout from '../components/AppLayout.vue'
import { API } from '../api'

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/app', component: AppLayout, meta: { requiresAuth: true }, children: [
    { path: '', redirect: '/app/menu' },
    { path: 'menu', name: 'menu', component: MenuView },
    { path: 'reviews', name: 'reviews', component: ReviewsView },
    { path: 'gallery', name: 'gallery', component: GalleryView },
    { path: 'landing', name: 'landing', component: LandingView },
    { path: 'orders', name: 'orders', component: OrdersView },
    { path: 'reservations', name: 'reservations', component: ReservationsView },
    { path: 'settings', name: 'settings', component: SettingsView }
  ]}
]

const router = createRouter({ history: createWebHistory('/'), routes })

// Admin is manager-only. Re-validate the session server-side on every navigation
// rather than trusting a client-side flag. The /api/auth/me endpoint returns 401
// if the cookie is missing/invalid and the backend reads the current staff role
// from the staff table (not the session), so a demotion takes effect immediately.
let pendingCheck = null
let lastCheckResult = null // 'manager' | null
let lastCheckAt = 0
const CHECK_INTERVAL = 10_000 // re-check at most once every 10s within a page load

router.beforeEach(async (to, from, next) => {
  if (to.meta.requiresAuth) {
    const now = Date.now()
    // Reuse a pending in-flight check, or start a fresh one if the last
    // result is stale or missing.
    if (!pendingCheck && (!lastCheckResult || now - lastCheckAt > CHECK_INTERVAL)) {
      pendingCheck = (async () => {
        try {
          const r = await fetch(`${API}/api/auth/me`, { credentials: 'include' })
          if (!r.ok) { lastCheckResult = null; return }
          const data = await r.json()
          const role = (data.role || '').toLowerCase().replace(/\s+/g, '-')
          lastCheckResult = role === 'manager' ? 'manager' : null
          lastCheckAt = Date.now()
        } catch {
          lastCheckResult = null
        } finally {
          pendingCheck = null
        }
      })()
    }
    // Wait for the check to finish if it's in flight.
    if (pendingCheck) await pendingCheck

    if (lastCheckResult !== 'manager') {
      sessionStorage.removeItem('admin_auth')
      return next('/login')
    }
    sessionStorage.setItem('admin_auth', '1')
  }
  next()
})

// Invalidate the cached auth check so the next navigation re-validates.
// Called from AppLayout.vue on logout to ensure a stale 'manager' result
// does not briefly allow the login page to redirect back into /app.
export function invalidateAuthCache() {
  lastCheckResult = null
  lastCheckAt = 0
}

export default router
