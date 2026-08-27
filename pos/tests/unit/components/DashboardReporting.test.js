import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

let currentRole = 'manager'
// null = grant everything (the manager/cashier suites). A role suite sets the
// real permission list so hasPermission reflects the matrix the server enforces.
let currentPermissions = null
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    get roleKey() { return currentRole },
    isAuthenticated: true,
    user: { firstName: 'Amanuel' },
    hasPermission: (p) => (currentPermissions ? currentPermissions.includes(p) : true),
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

/**
 * The cleaner audit's follow-up: the dashboard showed the floor (two tables
 * tiles) and nothing about the role's own job. It now carries the waste log —
 * entries today, cost today, the last entry's age — sourced only from reads
 * the matrix grants this role.
 */
describe('cleaner dashboard', () => {
  const TABLES = [
    { id: 'T1', status: 'cleaning' },
    { id: 'T2', status: 'occupied', guests: 4 },
    { id: 'T3', status: 'occupied', guests: 2 },
    { id: 'T4', status: 'available' },
  ]
  // Newest first, as ORDER BY created DESC delivers it. Two entries belong to
  // TODAY (2026-08-10); the stale one from yesterday must not count.
  const WASTE = [
    { id: 'W1', item: 'Milk', quantity: 1, unit: 'L', reason: 'spoiled', cost: 60, date: '2026-08-10', created: '2026-08-10T09:30:00Z' },
    { id: 'W2', item: 'Bread', quantity: 2, unit: 'pcs', reason: 'damaged', cost: 40, date: '2026-08-10', created: '2026-08-10T08:10:00Z' },
    { id: 'W3', item: 'Tea leaves', quantity: 1, unit: 'kg', reason: 'quality', cost: 300, date: '2026-08-09', created: '2026-08-09T16:45:00Z' },
  ]

  const cleanerRoutes = (endpoint) => {
    if (endpoint === 'tables') return Promise.resolve(TABLES)
    if (endpoint === 'waste') return Promise.resolve(WASTE)
    return Promise.resolve([])
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentRole = 'cleaner'
    // The server matrix for this role: waste + dashboard + timeclock reads.
    currentPermissions = ['waste', 'dashboard', 'timeclock']
    mockApiGet.mockImplementation(cleanerRoutes)
  })

  afterEach(() => { currentPermissions = null })

  const open = async () => {
    const w = mount(DashboardView, globalConfig)
    await flushPromises()
    await flushPromises()
    await flushPromises()
    return w
  }

  it('shows the floor tiles and the waste tiles', async () => {
    const w = await open()
    const text = w.text()
    expect(text).toContain('Tables to Clean')
    expect(text).toContain('Occupied Tables')
    expect(text).toContain('Waste Logged Today')
    expect(text).toContain('Last Entry')
    // 1 table cleaning, 2 occupied.
    expect(text).toContain('Marked for cleaning')
  })

  it('counts only entries dated today, with their cost', async () => {
    const w = await open()
    const text = w.text()
    // W1 + W2 are today; W3 (ETB 300) is yesterday's and must not appear.
    expect(text).toContain('ETB 100')
    expect(text).not.toContain('ETB 300')
  })

  it('lists today’s entries in the Waste Logged Today card', async () => {
    const w = await open()
    const text = w.text()
    expect(text).toContain('Milk')
    expect(text).toContain('Bread')
    expect(text).toContain('Open Waste Log')
    // Yesterday's entry stays out of the card.
    expect(text).not.toContain('Tea leaves')
  })

  /**
   * The cleaner holds no permission on orders, expenses, inventory or the
   * reports aggregate. A dashboard that asks for them anyway produces a page
   * of 403 noise — the exact symptom the audit flagged.
   */
  it('never requests a resource the role cannot read', async () => {
    await open()
    const asked = mockApiGet.mock.calls.map(([e]) => e)
    expect(asked).not.toContain('orders')
    expect(asked).not.toContain('expenses')
    expect(asked).not.toContain('inventory')
    expect(asked.every((e) => !String(e).startsWith('reports/'))).toBe(true)
  })

  it('keeps the floor tiles when the waste endpoint fails', async () => {
    mockApiGet.mockImplementation((e) =>
      e === 'waste' ? Promise.reject(new Error('503')) : cleanerRoutes(e)
    )
    const w = await open()
    const text = w.text()
    expect(text).toContain('Tables to Clean')
    expect(text).toContain('Occupied Tables')
    expect(text).toContain('Waste Logged Today')
    expect(text).toContain('No waste logged yet today')
  })
})

describe('waiter dashboard', () => {
  const WTABLES = [
    { id: 'T1', number: 1, status: 'available' },
    { id: 'T3', number: 3, status: 'occupied', guests: 2 },
  ]
  // The day's orders as the waiter's dashboard sees them: one settled and
  // paid bill (finished — nothing left to do), one served-but-unpaid tab
  // (money to collect — very much open), one still new.
  const WORDERS = [
    { id: 'O1', status: 'served', payment_status: 'paid', payment: 'paid', total: 704, created: '2026-08-10 12:00:00' },
    { id: 'O2', status: 'served', payment_status: 'unpaid', payment: 'unpaid', total: 320, created: '2026-08-10 12:30:00' },
    { id: 'O3', status: 'new', payment_status: 'unpaid', payment: 'unpaid', total: 150, created: '2026-08-10 12:45:00' },
  ]

  const waiterRoutes = (endpoint) => {
    if (endpoint === 'tables') return Promise.resolve(WTABLES)
    if (endpoint === 'reservations') return Promise.resolve([])
    if (endpoint === 'orders') return Promise.resolve(WORDERS)
    return Promise.resolve([])
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentRole = 'head-waiter'
    currentPermissions = ['tables', 'orders', 'open-checks', 'dashboard', 'menu-view', 'reservations', 'checkout', 'timeclock']
    mockApiGet.mockImplementation(waiterRoutes)
  })

  afterEach(() => { currentPermissions = null })

  const open = async () => {
    const w = mount(DashboardView, globalConfig)
    await flushPromises()
    await flushPromises()
    await flushPromises()
    return w
  }

  const tileValue = (w, label) => {
    const cards = w.findAll('.kpi-card')
    const card = cards.find((c) => c.text().includes(label))
    return card?.find('.kpi-value')?.text()
  }

  it('counts unpaid tabs as open orders but not settled, paid bills', async () => {
    const w = await open()
    // O2 (served, unpaid) and O3 (new) are open — O1 is paid and finished.
    expect(tileValue(w, 'Open Orders')).toBe('2')
  })

  it('shows the seated guests on the Active Tables tile', async () => {
    const w = await open()
    expect(tileValue(w, 'Active Tables')).toBe('1')
    expect(w.text()).toContain('2 guests seated')
  })

  it('falls back to the same paid-excluding count when a tile fetch fails', async () => {
    mockApiGet.mockImplementation((e) =>
      e === 'tables' || e === 'reservations' ? Promise.reject(new Error('503')) : waiterRoutes(e)
    )
    const w = await open()
    expect(tileValue(w, 'Open Orders')).toBe('2')
  })
})
