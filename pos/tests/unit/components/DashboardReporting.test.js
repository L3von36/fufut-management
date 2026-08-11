import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

let currentRole = 'manager'
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    get roleKey() { return currentRole },
    isAuthenticated: true,
    user: { firstName: 'Amanuel' },
    hasPermission: () => true,
  })),
}))

const mockApiGet = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  ROLE_PERMISSIONS: {},
  ROLE_DEFAULT_VIEW: {},
  NAV_ITEMS: [],
  TODAY: () => '2026-08-10',
}))

import DashboardView from '../../../src/views/DashboardView.vue'

const globalConfig = {
  global: {
    provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) },
    stubs: { RouterLink: true, 'router-link': true, canvas: true },
  },
}

/**
 * The server figure. `netSales` is 10,000 while the orders themselves total
 * 11,200 — the difference is 1,200 of tips, which is exactly the money the
 * dashboard must not present as revenue.
 */
const REPORT = {
  ok: true,
  period: 'day',
  sales: { orders: 40, netSales: 10000, discounts: 0, averageOrder: 250 },
  byOrderType: {
    dineIn: { orders: 25, net: 7000 },
    takeaway: { orders: 10, net: 2000 },
    delivery: { orders: 5, net: 1000 },
  },
  byCategory: [],
  paymentMethods: [
    { method: 'cash', count: 20, total: 6000 },
    { method: 'telebirr', count: 15, total: 4000 },
    { method: 'cbe', count: 5, total: 1200 },
  ],
  tips: 1200,
  expenses: 3000,
  grossOfExpenses: 7000,
  operations: { lowStockItems: 2, pendingKitchenOrders: 3, pendingDeliveries: 1 },
  supplierBalance: 15000,
}

/** Orders whose `total` includes the tips, as stored. */
const ORDERS = Array.from({ length: 40 }, (_, i) => ({
  id: 'O' + i, total: 280, tip: 30, status: 'fulfilled', created: '2026-08-10 12:00:00',
}))

function routes(endpoint) {
  if (endpoint.startsWith('reports/dashboard')) return Promise.resolve(REPORT)
  if (endpoint === 'orders') return Promise.resolve(ORDERS)
  if (endpoint === 'expenses') return Promise.resolve([{ amount: 3000, date: '2026-08-10' }])
  if (endpoint === 'inventory') return Promise.resolve([])
  if (endpoint === 'delivery') return Promise.resolve([])
  if (endpoint === 'tables') return Promise.resolve([])
  if (endpoint === 'reservations') return Promise.resolve([])
  return Promise.resolve([])
}

describe('manager dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentRole = 'manager'
    mockApiGet.mockImplementation(routes)
  })

  const open = async () => {
    const w = mount(DashboardView, globalConfig)
    await flushPromises()
    await flushPromises()
    return w
  }

  it('asks the server for the aggregate rather than summing orders locally', async () => {
    await open()
    expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('reports/dashboard'))
  })

  /**
   * The bug this prevents: summing `o.total` in the browser gives 11,200,
   * because since tips are stored `total` is what the guest handed over. The
   * restaurant earned 10,000. Showing the larger number overstates every
   * trading day and double-counts money that belongs to staff.
   */
  it('shows net sales with the tips excluded', async () => {
    const w = await open()
    expect(w.text()).toContain('10000')
    expect(w.text()).not.toContain('11200')
  })

  it('says on the tile that tips are not in the figure', async () => {
    const w = await open()
    expect(w.text()).toMatch(/excludes.*1200.*tips/i)
  })

  it('breaks the day down by order type', async () => {
    const w = await open()
    // 25 dine-in, 10 takeaway, 5 delivery.
    expect(w.text()).toContain('25/10/5')
  })

  it('surfaces what is owed to suppliers', async () => {
    const w = await open()
    expect(w.text()).toContain('15000')
  })

  /**
   * A dashboard that goes blank when one endpoint fails is worse than one that
   * is briefly approximate, so the locally computed tiles stay on screen.
   */
  it('keeps provisional tiles when the report fails', async () => {
    mockApiGet.mockImplementation((e) =>
      e.startsWith('reports/') ? Promise.reject(new Error('503')) : routes(e)
    )
    const w = await open()
    expect(w.findAll('.kpi-card, .stat-card, [class*="kpi"]').length).toBeGreaterThan(0)
  })
})

describe('cashier dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentRole = 'cashier'
    mockApiGet.mockImplementation(routes)
  })

  /**
   * The old tiles split on `o.payment === 'cash'` against `'card'`. That column
   * is a summary — a split bill stores "cash+telebirr" — so splits matched
   * neither bucket and disappeared, and Telebirr, CBE and bank transfers were
   * counted as neither. The real per-method amounts are in the payments table.
   */
  it('totals digital payments across every method, not just "card"', async () => {
    const w = mount(DashboardView, globalConfig)
    await flushPromises()
    await flushPromises()

    // telebirr 4,000 + cbe 1,200 = 5,200
    expect(w.text()).toContain('5200')
    expect(w.text()).toContain('6000')  // cash
  })
})
