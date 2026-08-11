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
  menu: { categories: [] },
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

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url())
      const key = url.pathname.replace(/^.*\/api\//, '').split('?')[0]

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
    })

    await use({
      set(key, value) { overrides[key] = value },
    })
  },

  /** A page already past the login screen. */
  app: async ({ page, mockApi }, use) => {
    await use({
      async goto(view) {
        await page.goto(`/app/${view}`)
        await page.waitForLoadState('networkidle')
      },
      mockApi,
      page,
    })
  },
})

export { expect }
