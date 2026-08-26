import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockApiGet = vi.fn()
vi.mock('../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  API: '',
  isOnline: () => true,
  onOnlineChange: () => () => {},
  TODAY: () => '2026-08-26',
  ROLE_PERMISSIONS: {},
  ROLE_DEFAULT_VIEW: {},
  NAV_ITEMS: [],
}))

// The Dashboard and P&L dynamically import chart.js and draw on a canvas;
// jsdom has neither a canvas nor a 2d context. A class, because the views
// call `new Chart(...)` — an arrow-function mock is not constructable.
vi.mock('chart.js', () => {
  class MockChart {
    constructor(ctx, cfg) { this.ctx = ctx; this.cfg = cfg }
    destroy() {}
  }
  return { Chart: Object.assign(MockChart, { register: vi.fn() }), registerables: [] }
})

import { isRealOrder } from '../../src/lib/formatters'
import DashboardView from '../../src/views/DashboardView.vue'
import PnLView from '../../src/views/PnLView.vue'

/**
 * B+ Finding 7: the backoffice money screens sum orders client-side, and every
 * one of them counted voided and cancelled orders as revenue.
 *
 * The cashier-audit fix (5d0ea1a) gave the POS the isRealOrder rule; the
 * backoffice never got its copy. The accountant's Dashboard "Today Revenue",
 * the P&L headline cards, Revenue's daily breakdown and Reports' totals all
 * inflated — while the API's own reports (REAL_ORDERS in reports.js) and even
 * the P&L's own 30-day chart excluded the very same orders.
 *
 * isRealOrder is now the backoffice's copy of the server rule, and these
 * tests pin the screens that sum orders to it.
 */
describe('isRealOrder', () => {
  it('accepts an ordinary order', () => {
    expect(isRealOrder({ status: 'new', total: 130 })).toBe(true)
    expect(isRealOrder({ status: 'preparing', total: 370 })).toBe(true)
    expect(isRealOrder({ status: 'paid', total: 90 })).toBe(true)
    expect(isRealOrder({ status: 'fulfilled', total: 90 })).toBe(true)
  })

  it('rejects a voided order by either marker', () => {
    // A void sets both; rows written before one column existed carry one.
    expect(isRealOrder({ status: 'cancelled', voided_at: '2026-08-25T00:00:00Z' })).toBe(false)
    expect(isRealOrder({ status: 'cancelled' })).toBe(false)
    expect(isRealOrder({ status: 'new', voided_at: '2026-08-25T00:00:00Z' })).toBe(false)
  })

  it('rejects the legacy voided status spelling', () => {
    // Belt and braces: some rows predate voided_at and spell it in status.
    expect(isRealOrder({ status: 'voided' })).toBe(false)
  })

  it('is case-insensitive about status spellings', () => {
    expect(isRealOrder({ status: 'Cancelled' })).toBe(false)
    expect(isRealOrder({ status: 'CANCELLED' })).toBe(false)
  })

  it('refuses nullish input rather than counting it', () => {
    expect(isRealOrder(null)).toBe(false)
    expect(isRealOrder(undefined)).toBe(false)
  })
})

const TODAY_ISO = '2026-08-26T09:30:00Z'

/** One real sale plus three dead ones that must never count as money. */
function kpiOrders() {
  return [
    { id: 'O1', status: 'fulfilled', total: 100, created: TODAY_ISO, items: 'Latte x1' },
    // The void that used to sit in Today Revenue (both markers).
    { id: 'O2', status: 'cancelled', voided_at: '2026-08-26T10:00:00Z', total: 200, created: TODAY_ISO, items: 'Cake x2' },
    // Legacy row: voided spelled in status only.
    { id: 'O3', status: 'voided', total: 75, created: TODAY_ISO, items: 'Tea x3' },
    // Real but yesterday — excluded by the date, not the rule.
    { id: 'O4', status: 'fulfilled', total: 999, created: '2026-08-25T09:30:00Z', items: 'Espresso x9' },
  ]
}

function mountDashboard(orders) {
  mockApiGet.mockImplementation((e) => {
    if (e === 'orders') return Promise.resolve(orders)
    if (e === 'expenses') return Promise.resolve([])
    if (e === 'inventory') return Promise.resolve([])
    if (e === 'menu') return Promise.resolve([])
    if (e === 'tables') return Promise.resolve([])
    return Promise.resolve([])
  })
  return mount(DashboardView, {
    global: { stubs: { RouterLink: true } },
  })
}

describe('DashboardView Today Revenue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts today orders excluding voided and cancelled ones', async () => {
    const wrapper = mountDashboard(kpiOrders())
    await flushPromises()
    const html = wrapper.html()
    // "N orders today" is driven by todayOrders, the same list Today Revenue
    // sums — one real order today, the two dead ones must not inflate it.
    expect(html).toContain('1 orders today')
    expect(html).not.toContain('3 orders today')
    wrapper.unmount()
  })

  it('does not count a voided order as preparing/active', async () => {
    const orders = [
      { id: 'O1', status: 'preparing', total: 50, created: TODAY_ISO },
      { id: 'O2', status: 'voided', total: 200, created: TODAY_ISO },
    ]
    const wrapper = mountDashboard(orders)
    await flushPromises()
    // Active Orders KPI sub: only the genuinely preparing order counts.
    expect(wrapper.html()).toContain('1 preparing')
    wrapper.unmount()
  })
})

describe('PnLView headline cards', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sums revenue from real orders only', async () => {
    mockApiGet.mockImplementation((e) => {
      if (e === 'orders') return Promise.resolve(kpiOrders())
      if (e === 'expenses') return Promise.resolve([])
      if (e === 'menu') return Promise.resolve([])
      return Promise.resolve([])
    })
    const wrapper = mount(PnLView, {
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    const html = wrapper.html()
    // Revenue card: both real orders count (100 today + 999 yesterday, the
    // P&L window is 30 days) — never 1374 with the two dead ones added.
    expect(html).toContain('ETB 1099')
    expect(html).not.toContain('ETB 1374')
    wrapper.unmount()
  })

  it('counts COG only for items that were actually sold', async () => {
    mockApiGet.mockImplementation((e) => {
      if (e === 'orders') {
        return Promise.resolve([
          { id: 'O1', status: 'fulfilled', total: 100, created: TODAY_ISO, items: 'Latte x1' },
          { id: 'O2', status: 'cancelled', voided_at: '2026-08-26T10:00:00Z', total: 200, created: TODAY_ISO, items: 'Cake x4' },
        ])
      }
      if (e === 'menu') {
        return Promise.resolve([
          { name: 'Latte', cost: 10 },
          { name: 'Cake', cost: 25 },
        ])
      }
      return Promise.resolve([])
    })
    const wrapper = mount(PnLView, {
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()
    const html = wrapper.html()
    // COG: one Latte at 10 — the four voided cakes never cost anyone anything.
    expect(html).toContain('ETB 10')
    expect(html).not.toContain('ETB 110')
    wrapper.unmount()
  })
})
