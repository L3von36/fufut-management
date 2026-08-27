import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

/**
 * Regression tests for the second cashier mobile audit pass (2026-08-27,
 * evening) — findings N2..N6, all found live on an iPhone 14 viewport.
 *
 * N2 — the Revenue screen's "Orders" KPI kept the all-history count
 *      (live: 148 orders of every day beside a today-only ETB 1066 revenue).
 * N3 — Z-Report History listed each drawer's OPENED time under the
 *      "Closed Time" header, because no closed_at existed anywhere.
 * N4 — a dine-in order with no table could be paid from both order paths;
 *      the Aug 24 open-checks review found five such orphans in production.
 * N5 — Reports' "Revenue" summed tips into the food money (live: ETB 1066
 *      on Reports vs ETB 1045 "excludes tips" on the Dashboard, same day).
 * N6 — the Analytics cancellation rate divided cancels by surviving orders
 *      only, which is unbounded (live: "1583.3%" after training voids).
 */

let currentPermissions = null
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    roleKey: 'cashier',
    isAuthenticated: true,
    user: { firstName: 'Bethel' },
    hasPermission: (p) => (currentPermissions ? currentPermissions.includes(p) : true),
  })),
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  ROLE_PERMISSIONS: {},
  ROLE_DEFAULT_VIEW: {},
  NAV_ITEMS: [],
  TODAY: () => '2026-08-27',
}))

// CheckoutView mounts need these; see CheckoutStaleSuccess.test.js.
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('../../../src/composables/useAudioAlerts', () => ({
  useAudioAlerts: () => ({ playOrderReady: vi.fn() }),
}))
vi.mock('../../../src/lib/print', () => ({
  customerReceipt: vi.fn(() => true),
  printReport: vi.fn(() => true),
  printZReport: vi.fn(() => true),
}))
vi.mock('../../../src/lib/receiptVerifier', () => ({
  verifyReceipt: vi.fn(() => null),
}))

const globalConfig = {
  global: {
    provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) },
    stubs: { RouterLink: true, 'router-link': true, canvas: true, transition: false },
  },
}

// ─── N2: Revenue "Orders" KPI belongs to the picked range ────────────────────
import RevenueView from '../../../src/views/RevenueView.vue'

describe('N2: RevenueView Orders KPI counts the filtered range', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentPermissions = null
  })

  it('shows today\'s order count, not every order ever taken', async () => {
    const today = { id: 'A1', total: 220, payment: 'cash', created: '2026-08-27 19:15:03' }
    const stale = { id: 'B1', total: 150, payment: 'cash', created: '2026-08-01 12:00:00' }
    mockApiGet.mockResolvedValue([today, stale, { ...stale, id: 'B2' }])

    const wrapper = mount(RevenueView, globalConfig)
    await flushPromises()

    const kpis = wrapper.findAll('.kpi-card').map(k => k.text())
    const ordersKpi = kpis.find(k => k.includes('Orders'))
    expect(ordersKpi).toContain('1')
    expect(ordersKpi).not.toContain('3')
  })
})

// ─── N3: Z-Report History closed time ────────────────────────────────────────
import CashDrawerView from '../../../src/views/CashDrawerView.vue'

describe('N3: CashDrawerView history shows the close time, not the open time', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentPermissions = null
  })

  it('renders closed_at when the server sends it, and an honest note when it cannot', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'cashdrawer') return Promise.resolve({ drawers: [], active: null })
      if (ep === 'cashdrawer/history') {
        return Promise.resolve({
          drawers: [
            {
              id: 'CD-new', opened_at: '2026-08-27T15:15:00.000Z', opened: '2026-08-27T15:15:00.000Z',
              closed_at: '2026-08-27T21:02:00.000Z', closed: '2026-08-27T21:02:00.000Z',
              opening_balance: 500, cash_sales: 220, closing_balance: 820, expected: 820, variance: 0, status: 'closed',
            },
            {
              id: 'CD-old', opened_at: '2026-08-26T05:54:24.000Z', opened: '2026-08-26T05:54:24.000Z',
              opening_balance: 1000, cash_sales: 0, closing_balance: 1025, expected: 1025, variance: 0, status: 'closed',
            },
          ],
        })
      }
      return Promise.resolve({})
    })

    const wrapper = mount(CashDrawerView, globalConfig)
    await flushPromises()

    // Switch to the history tab
    const tab = wrapper.findAll('button').find(b => b.text().includes('Z-Report History'))
    await tab.trigger('click')
    await flushPromises()

    const text = wrapper.text()
    // jsdom's locale renders 12-hour time: 21:02 shows as 9:02 PM.
    expect(text).toContain('9:02:00 PM')
    expect(text).toContain('before close-tracking')
    // The open timestamp (3:15 PM) must no longer be presented as the close.
    expect(text).not.toContain('3:15:00 PM')
  })
})

// ─── N4: a dine-in ticket needs a table before it can be paid ────────────────
import CheckoutView from '../../../src/views/CheckoutView.vue'
import OrdersView from '../../../src/views/OrdersView.vue'

describe('N4: dine-in orders cannot be paid without a table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentPermissions = ['orders', 'checkout', 'tables']
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve([])
      if (ep === 'menu') return Promise.resolve([
        { id: 'M-1', name: 'Espresso', category: 'Coffee', price: 150 },
      ])
      if (ep === 'tables') return Promise.resolve([])
      return Promise.resolve([])
    })
  })

  it('CheckoutView refuses Continue to Payment for a tableless dine-in', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useOrderStore } = await import('../../../src/stores/order')
    const store = useOrderStore()
    store.addItem({ menuItemId: 'M1', name: 'TEA', basePrice: 70 })
    store.orderType = 'dine-in'
    store.tableNum = ''

    mockApiGet.mockImplementation((ep) => {
      if (ep === 'tables') return Promise.resolve([])
      return Promise.resolve([])
    })

    const wrapper = mount(CheckoutView, {
      global: {
        plugins: [pinia],
        provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) },
        stubs: { ModifierSelectionSheet: true },
      },
    })
    await flushPromises()

    const btn = wrapper.findAll('button').find(b => b.text().includes('Continue to Payment'))
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    await flushPromises()

    // Still on the review step — payment must be unreachable.
    expect(store.checkoutStep).not.toBe('payment')
  })

  it('a dine-in WITH a table still proceeds as before', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { useOrderStore } = await import('../../../src/stores/order')
    const store = useOrderStore()
    store.addItem({ menuItemId: 'M1', name: 'TEA', basePrice: 70 })
    store.orderType = 'dine-in'
    store.tableNum = '5'

    mockApiGet.mockImplementation((ep) => {
      if (ep === 'tables') return Promise.resolve([])
      return Promise.resolve([])
    })

    const wrapper = mount(CheckoutView, {
      global: {
        plugins: [pinia],
        provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) },
        stubs: { ModifierSelectionSheet: true },
      },
    })
    await flushPromises()

    const btn = wrapper.findAll('button').find(b => b.text().includes('Continue to Payment'))
    await btn.trigger('click')
    await flushPromises()

    expect(store.checkoutStep).toBe('payment')
  })

  it('OrdersView quick-sale refuses Process Payment for a tableless dine-in', async () => {
    const wrapper = mount(OrdersView, globalConfig)
    await flushPromises()

    // Open the New Order quick-sale modal, add an item, leave the table unset
    // (the modal's default) and try to pay.
    const newOrderBtn = wrapper.findAll('button').find(b => b.text().includes('New Order'))
    await newOrderBtn.trigger('click')
    await flushPromises()

    const itemBtn = wrapper.findAll('button').find(b => b.text().includes('Espresso'))
    await itemBtn.trigger('click')
    await flushPromises()

    const payBtn = wrapper.findAll('button').find(b => b.text().includes('Process Payment'))
    expect(payBtn).toBeTruthy()
    await payBtn.trigger('click')
    await flushPromises()

    expect(mockApiPost).not.toHaveBeenCalled()
    expect(globalConfig.global.provide.toast).toHaveBeenCalledWith(expect.stringContaining('Pick a table'), 'error')
  })
})

// ─── N5: Reports revenue is food money, tips excluded ────────────────────────
import ReportsView from '../../../src/views/ReportsView.vue'

describe('N5: ReportsView revenue matches the dashboard definition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentPermissions = null
  })

  it('subtracts tips from today\'s revenue', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') {
        return Promise.resolve([
          { id: 'O1', total: 260, tip: 0, status: 'served', created: '2026-08-27 19:00:00' },
          { id: 'O2', total: 225.5, tip: 20.5, status: 'served', created: '2026-08-27 18:00:00' },
        ])
      }
      if (ep === 'expenses') return Promise.resolve([])
      return Promise.resolve([])
    })

    const wrapper = mount(ReportsView, globalConfig)
    await flushPromises()

    // 260 + 225.5 - 20.5 = 465, not 485.5.
    expect(wrapper.text()).toContain('ETB 465')
    expect(wrapper.text()).not.toContain('485')
  })
})

// ─── N6: cancellation rate over all ticketed orders ──────────────────────────
import AnalyticsView from '../../../src/views/AnalyticsView.vue'

describe('N6: AnalyticsView cancellation rate is bounded by definition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentPermissions = null
  })

  it('divides cancels by cancels-plus-real, never exceeding 100%', async () => {
    const cancelled = Array.from({ length: 95 }, (_, i) => ({
      id: 'X' + i, total: 100, status: 'cancelled', created: '2026-08-20 10:00:00',
    }))
    const real = Array.from({ length: 6 }, (_, i) => ({
      id: 'R' + i, total: 178, status: 'served', payment_status: 'paid', created: '2026-08-27 19:00:00',
    }))
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve([...cancelled, ...real])
      if (ep === 'menu') return Promise.resolve([])
      return Promise.resolve([])
    })

    const wrapper = mount(AnalyticsView, globalConfig)
    await flushPromises()

    // 95 / (95 + 6) = 94.1% — alarming but possible; 1583.3% never was.
    expect(wrapper.text()).toContain('94.1')
    expect(wrapper.text()).not.toContain('1583')
  })
})
