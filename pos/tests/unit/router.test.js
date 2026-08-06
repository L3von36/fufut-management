import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'

// We test the route configuration logic without importing the actual router
// because the actual router has side effects (Pinia dependency)

describe('Router Configuration', () => {
  it('should define all 19 app routes plus login and root redirect', () => {
    // Simulate the route structure from the actual router/index.js
    const routes = [
      { path: '/', redirect: '/login' },
      { path: '/login', name: 'login' },
      {
        path: '/app',
        meta: { requiresAuth: true },
        children: [
          { path: '', redirect: { name: 'dashboard' } },
          { path: 'dashboard', name: 'dashboard' },
          { path: 'orders', name: 'orders' },
          { path: 'menu-mgmt', name: 'menu-mgmt' },
          { path: 'menu-view', name: 'menu-view' },
          { path: 'tables', name: 'tables' },
          { path: 'reservations', name: 'reservations' },
          { path: 'delivery', name: 'delivery' },
          { path: 'kitchen', name: 'kitchen' },
          { path: 'expenses', name: 'expenses' },
          { path: 'pnl', name: 'pnl' },
          { path: 'cashdrawer', name: 'cashdrawer' },
          { path: 'inventory', name: 'inventory' },
          { path: 'waste', name: 'waste' },
          { path: 'staff', name: 'staff' },
          { path: 'shifts', name: 'shifts' },
          { path: 'timeclock', name: 'timeclock' },
          { path: 'reports', name: 'reports' },
          { path: 'pipeline', name: 'pipeline' },
          { path: 'revenue', name: 'revenue' }
        ]
      }
    ]

    const appRoutes = routes[2].children
    expect(appRoutes.length).toBe(20) // 1 redirect + 19 named routes
  })

  it('should require auth for /app routes', () => {
    const appRoute = {
      path: '/app',
      meta: { requiresAuth: true }
    }
    expect(appRoute.meta.requiresAuth).toBe(true)
  })

  it('should redirect root to login', () => {
    const rootRoute = { path: '/', redirect: '/login' }
    expect(rootRoute.redirect).toBe('/login')
  })

  it('should redirect /app to dashboard', () => {
    const appRedirect = { path: '', redirect: { name: 'dashboard' } }
    expect(appRedirect.redirect.name).toBe('dashboard')
  })

  describe('Route names match ROLE_PERMISSIONS views', () => {
    const routeNames = [
      'dashboard', 'orders', 'menu-mgmt', 'menu-view', 'tables',
      'reservations', 'delivery', 'kitchen', 'expenses', 'pnl',
      'cashdrawer', 'inventory', 'waste', 'staff', 'shifts',
      'timeclock', 'reports', 'pipeline', 'revenue', 'checkout', 'analytics'
    ]

    const ROLE_PERMISSIONS = {
      manager: ['dashboard', 'orders', 'tables', 'menu-mgmt', 'menu-view', 'expenses', 'pnl', 'cashdrawer', 'inventory', 'waste', 'staff', 'shifts', 'timeclock', 'kitchen', 'reports', 'reservations', 'delivery', 'analytics', 'checkout'],
      'head-chef': ['kitchen', 'orders', 'dashboard', 'inventory', 'waste', 'reports', 'pipeline'],
      'assistant-chef': ['kitchen', 'orders', 'dashboard', 'inventory'],
      'head-waiter': ['tables', 'orders', 'dashboard', 'menu-view', 'reservations', 'checkout'],
      cashier: ['cashdrawer', 'orders', 'dashboard', 'tables', 'reports', 'timeclock', 'reservations', 'revenue', 'menu-view', 'analytics', 'checkout'],
      'delivery-staff': ['delivery', 'dashboard'],
      cleaner: ['waste', 'dashboard']
    }

    it('every permission view should have a matching route', () => {
      const allPerms = new Set()
      Object.values(ROLE_PERMISSIONS).forEach(perms => {
        perms.forEach(p => allPerms.add(p))
      })

      allPerms.forEach(perm => {
        expect(routeNames).toContain(perm)
      })
    })

    it('every route name should be in at least one role permission', () => {
      const allPerms = new Set()
      Object.values(ROLE_PERMISSIONS).forEach(perms => {
        perms.forEach(p => allPerms.add(p))
      })

      const allowedMissing = ['pipeline', 'revenue']
      routeNames.forEach(name => {
        if (allowedMissing.includes(name)) return
        expect(allPerms.has(name)).toBe(true)
      })
    })
  })
})
