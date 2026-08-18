import { test as base, expect } from '@playwright/test'

/**
 * A signed-in backoffice with a mocked API.
 *
 * Every response is declared per test. Nothing reaches the live Worker, and no
 * state survives between tests — the failure mode the handover records is a
 * suite that passes while measuring whoever happened to be signed in last.
 */

/** Rows chosen to exercise the awkward cases, not the happy path. */
export const ORDERS = [
  // A tip inside `total`: net sales must exclude it.
  { id: 'O-alpha', tableId: 'T1', items: '2x Macchiato, 1x Tea', total: 550, tip: 50, status: 'fulfilled', payment: 'cash', created: '2026-08-11 09:15:00' },
  // Cancelled: must not count toward revenue.
  { id: 'O-bravo', tableId: 'T2', items: '1x Tibs', total: 900, tip: 0, status: 'cancelled', payment: 'telebirr', created: '2026-08-11 10:00:00' },
  // Voided: same.
  { id: 'O-charlie', tableId: 'T3', items: '1x Pizza', total: 400, tip: 0, status: 'fulfilled', payment: 'cash', created: '2026-08-11 11:00:00', voided_at: '2026-08-11 11:30:00' },
  // 22:30 UTC = 01:30 next day in Addis. The timezone case.
  { id: 'O-delta', tableId: 'T4', items: '1x Dulet', total: 300, tip: 0, status: 'new', payment: 'cbe', created: '2026-08-10 22:30:00' },
]

export const STAFF = [
  { id: 'S1', firstName: 'Selam', lastName: 'Wondimu', email: 'selam@fufut.coffee', role: 'head-chef', status: 'active' },
  { id: 'S2', firstName: 'Bethel', lastName: 'Assefa', email: 'bethel@fufut.coffee', role: 'cashier', status: 'active' },
  // No email: the row must say this account cannot sign in.
  { id: 'S3', firstName: 'Nohemail', lastName: 'Person', email: '', role: 'cleaner', status: 'active' },
]

export const DELIVERY = [
  // The two statuses that had no CSS class and rendered as bare text.
  { id: 'D1', orderId: 'O-alpha', customer: 'Ahmed', address: 'Bole, behind the Total station', phone: '0911', status: 'picked_up' },
  { id: 'D2', orderId: 'O-delta', customer: 'Sara', address: 'Kazanchis', phone: '0922', status: 'out_for_delivery' },
  { id: 'D3', orderId: 'O-bravo', customer: 'Dawit', address: 'Piassa', phone: '0933', status: 'delivered' },
]

const DEFAULTS = {
  'auth/me': { ok: true, user: { id: 'S9', firstName: 'Amanuel', lastName: 'Fekadu', role: 'manager' }, role: 'manager' },
  orders: ORDERS,
  staff: STAFF,
  delivery: DELIVERY,
  expenses: [],
  waste: [],
  inventory: [],
  reservations: [],
  tables: [],
  shifts: [],
  timeclock: [],
  // Flat, which is what GET /api/menu returns to this client — the handler
  // flattens the categorised structure before sending. `{categories:[…]}` makes
  // MenuView throw on `menu.value.map`, and PnLView swallows the same error in a
  // catch and silently drops the whole expense half of the statement.
  menu: [
    { id: 'M1', name: 'Macchiato', category: 'Hot Drinks', price: 60, cost: 18, available: true, modifiers: ['Hot'] },
    { id: 'M2', name: 'Tea', category: 'Hot Drinks', price: 30, cost: 5, available: false, modifiers: [] },
  ],
  audit: { ok: true, entries: [] },
  settings: { ok: true, settings: [] },
  payroll: { ok: true, runs: [] },
}

export const test = base.extend({
  /**
   * Serves `DEFAULTS`, overridden per test via `page.route` before navigating.
   * Matched on the path after /api/ so query strings do not have to be
   * enumerated.
   */
  mockApi: async ({ page }, use) => {
    const overrides = {}

    /**
     * Matched on the pathname, not with a glob.
     *
     * A glob wide enough to catch every API path also catches the app's OWN
     * source: the dev server serves modules by path, and the client lives at
     * `/backoffice/src/api/index.js`.
     * That file was being answered with JSON, so the browser refused it —
     * "Expected a JavaScript-or-Wasm module script but the server responded
     * with a MIME type of application/json" — and the app never booted. Every
     * test then timed out waiting for a table, which reads like a broken app
     * rather than a mock that ate it.
     *
     * The client builds `${API}/api/${endpoint}` with an empty API base, so a
     * real call is always same-origin and always starts at `/api/`.
     */
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        const url = new URL(route.request().url())
        const key = url.pathname.replace(/^\/api\//, '').split('?')[0]

        // Longest match first, so "auth/me" wins over "auth".
        const match = Object.keys({ ...DEFAULTS, ...overrides })
          .filter((k) => key === k || key.startsWith(k + '/'))
          .sort((a, b) => b.length - a.length)[0]

        const body = match ? (overrides[match] ?? DEFAULTS[match]) : []
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        })
      }
    )

    await use({
      set(key, value) { overrides[key] = value },
    })
  },

  /** A page already past the login screen. */
  app: async ({ page, mockApi }, use) => {
    await use({
      /**
       * The dev server serves the app under `/backoffice/` — vite.config.js
       * sets that base and the router is created with it. Navigating to
       * `/app/orders` matches no route, so the app boots and renders nothing,
       * which presents as every assertion finding zero rows rather than as a
       * routing error.
       *
       * CI builds production with `--base /`, so this prefix is a property of
       * the dev server the tests run against, not of the deployed site.
       */
      async goto(view) {
        await page.goto(`/backoffice/app/${view}`)
        await page.waitForLoadState('networkidle')
        // The router restores the session before rendering a guarded route, so
        // waiting for the table is what tells us the guard actually passed.
        await page.locator('table, .table-empty').first().waitFor({ timeout: 10000 })
      },
      mockApi,
      page,
    })
  },
})

export { expect }
