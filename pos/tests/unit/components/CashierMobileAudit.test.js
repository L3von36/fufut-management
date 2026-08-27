import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

/**
 * Regression tests for the cashier mobile audit (2026-08-27).
 *
 * C1 — Cash Drawer "Today's Drawers" listed every drawer the account had ever
 *      closed, so a fresh shift opened onto days-old counts and cash sales.
 * C2 — the Active Drawer "Expected Total" ignored paid-in/paid-out, so the
 *      figure the cashier counted against all shift differed from the one the
 *      Z-count judged them by (live: displayed 640, server computed 740).
 * C4 — the Orders quick-sale left paid items in the shared cart, which then
 *      silently carried into the next order (live: a paid Espresso joined a
 *      table's first ticket).
 * C5 — a 10% tip on ETB 205 booked 20.5 while every display said "21" and the
 *      quick-tender Exact button offered 226: percentage tips now round to
 *      whole birr.
 * C6 — Analytics counted voided/cancelled orders in revenue (live: ETB 24,102
 *      shown where ETB 515.5 was real) and its fulfillment rate ignored
 *      served+paid tickets and counted voided ones in the denominator.
 * C7 — the Revenue screen's KPIs summed ALL history regardless of the picked
 *      date range (live: ETB 51,567 / 145 orders for a 14-day window whose
 *      real figures were ETB 3,500 / 8).
 */

// ─── shared mocks ────────────────────────────────────────────────────────────
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

const globalConfig = {
  global: {
    provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) },
    stubs: { RouterLink: true, 'router-link': true, canvas: true, transition: false },
  },
}

function isoOf(date) { return date.toISOString() }

// ─── C5: percentage tips round to whole birr ─────────────────────────────────
import { useOrderStore } from '../../../src/stores/order'

describe('C5: percentage tips round to whole birr (order store)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('books the tip it displays: 10% of ETB 205 is 21, not 20.5', () => {
    const store = useOrderStore()
    store.addItem({ menuItemId: 'M1', name: 'Macchiato', basePrice: 130 })
    store.addItem({ menuItemId: 'M2', name: 'Traditional coffee', basePrice: 75 })
    store.setTipPercent(10)

    expect(store.subtotal).toBe(205)
    expect(store.calculatedTip).toBe(21)
    expect(store.grandTotal).toBe(226)
  })

  it('keeps exact whole-birr percentages exact (10% of 130 stays 13)', () => {
    const store = useOrderStore()
    store.addItem({ menuItemId: 'M002', name: 'Macchiato', basePrice: 130 })
    store.setTipPercent(10)

    expect(store.calculatedTip).toBe(13)
  })

  it('rounds a half-birr tip up to what the screen always showed', () => {
    // 15% of 90 = 13.5 → 14. The old display showed 14 while booking 13.5.
    const store = useOrderStore()
    store.addItem({ menuItemId: 'M3', name: 'Lemon Tea', basePrice: 90 })
    store.setTipPercent(15)

    expect(store.calculatedTip).toBe(14)
  })
})

// ─── C1 + C2: Cash Drawer today filter and expected total ────────────────────
import CashDrawerView from '../../../src/views/CashDrawerView.vue'

describe('C1/C2: CashDrawerView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentPermissions = null
  })

  const now = new Date('2026-08-27T15:00:00')
  const OLD = new Date('2026-08-25T05:00:00')

  function drawerOf(id, opened, cashSales, extra = {}) {
    return {
      id,
      opened_at: isoOf(opened),
      opened: isoOf(opened),
      opening_balance: 1000,
      openingBal: 1000,
      cash_sales: cashSales,
      cashSales,
      closing_balance: 1000 + cashSales,
      expected: 1000 + cashSales,
      variance: 0,
      status: 'closed',
      ...extra,
    }
  }

  it('lists only drawers opened today under "Today\'s Drawers"', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'cashdrawer') {
        return Promise.resolve({
          drawers: [
            drawerOf('CD-today', now, 140),
            drawerOf('CD-old1', OLD, 1570),
            drawerOf('CD-old2', new Date('2026-08-26T06:00:00'), 0),
          ],
          active: null,
        })
      }
      if (ep === 'cashdrawer/history') return Promise.resolve({ drawers: [] })
      return Promise.resolve({})
    })

    const wrapper = mount(CashDrawerView, globalConfig)
    await flushPromises()

    // KPI counts today's drawers only — 1, not 3.
    expect(wrapper.text()).toContain('1')
    const rows = wrapper.findAll('tbody tr')
    const rowText = rows.map(r => r.text()).join('\n')
    expect(rowText).toContain('CD-today')
    expect(rowText).not.toContain('CD-old1')
    expect(rowText).not.toContain('CD-old2')
    expect(wrapper.text()).toContain('1 drawer(s) today')
  })

  it('sums cash sales from today\'s drawers only', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'cashdrawer') {
        return Promise.resolve({
          drawers: [
            drawerOf('CD-today', now, 140),
            drawerOf('CD-old1', OLD, 1570),
          ],
          active: null,
        })
      }
      if (ep === 'cashdrawer/history') return Promise.resolve({ drawers: [] })
      return Promise.resolve({})
    })

    const wrapper = mount(CashDrawerView, globalConfig)
    await flushPromises()

    // 140, not 1710 — the old code summed every drawer ever closed.
    expect(wrapper.text()).toContain('ETB 140')
  })

  it('C2: expected total includes paid-in and paid-out', async () => {
    const active = {
      id: 'CD-live',
      opened_at: isoOf(now),
      opened: isoOf(now),
      opening_balance: 500,
      openingBal: 500,
      cash_sales: 140,
      cashSales: 140,
      paid_in: 100,
      paid_out: 25,
      status: 'open',
    }
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'cashdrawer') return Promise.resolve({ drawers: [active], active })
      if (ep === 'cashdrawer/history') return Promise.resolve({ drawers: [] })
      return Promise.resolve({})
    })

    const wrapper = mount(CashDrawerView, globalConfig)
    await flushPromises()

    // Server close-time formula: 500 + 140 + 100 − 25 = 715. The old display
    // showed 640 and let the paid-in/out surface as phantom variance at close.
    expect(wrapper.text()).toContain('ETB 715')
    expect(wrapper.text()).not.toContain('ETB 640')
  })
})

// ─── C4: quick-sale clears the cart ─────────────────────────────────────────
import OrdersView from '../../../src/views/OrdersView.vue'

describe('C4: OrdersView quick-sale clears the cart after payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentPermissions = ['orders', 'checkout']
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve([])
      if (ep === 'menu') return Promise.resolve([
        { id: 'M-1', name: 'Espresso', category: 'Coffee', price: 150 },
      ])
      if (ep === 'tables') return Promise.resolve([])
      return Promise.resolve([])
    })
    mockApiPost.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve({ ok: true, id: 'Oqk0001' })
      return Promise.resolve({ ok: true })
    })
  })

  it('empties the order store once the quick sale is paid', async () => {
    const wrapper = mount(OrdersView, globalConfig)
    await flushPromises()

    // Open the New Order quick-sale modal.
    const newOrderBtn = wrapper.findAll('button').find(b => b.text().includes('New Order'))
    expect(newOrderBtn).toBeDefined()
    await newOrderBtn.trigger('click')
    await flushPromises()

    // Add an item into the shared cart.
    const itemBtn = wrapper.findAll('button').find(b => b.text().includes('Espresso'))
    expect(itemBtn).toBeDefined()
    await itemBtn.trigger('click')
    await flushPromises()

    const store = useOrderStore()
    expect(store.items.length).toBe(1)

    // Pay.
    const payBtn = wrapper.findAll('button').find(b => b.text() === 'Process Payment')
    expect(payBtn).toBeDefined()
    await payBtn.trigger('click')
    await flushPromises()

    // The sale finished — the cart must not remember paid lines.
    expect(store.items.length).toBe(0)
    expect(store.isEmpty).toBe(true)
  })
})

// ─── C6: Analytics real orders + fulfillment ────────────────────────────────
import AnalyticsView from '../../../src/views/AnalyticsView.vue'

describe('C6: AnalyticsView counts real orders and finished service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentPermissions = ['analytics', 'dashboard']
  })

  const today = '2026-08-27'

  it('excludes voided orders from revenue and the order count', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve([
        { id: 'O-real', items: '1xTEA', total: 140, status: 'fulfilled', payment_status: 'paid', created: `${today} 15:54:00` },
        { id: 'O-void', items: '10xPizza', total: 3800, status: 'cancelled', voided_at: `${today} 09:00:00`, created: `${today} 08:00:00` },
        { id: 'O-void2', items: '5xTibs', total: 1900, status: 'new', voided_at: `${today} 10:00:00`, created: `${today} 09:30:00` },
      ])
      if (ep === 'menu') return Promise.resolve([])
      return Promise.resolve([])
    })

    const wrapper = mount(AnalyticsView, globalConfig)
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))

    const text = wrapper.text()
    // Only ETB 140 of that is real; 5,700 of voided tickets must not appear.
    expect(text).toContain('ETB 140')
    expect(text).toContain('1 order')
    expect(text).not.toContain('5,700')
    expect(text).not.toContain('5,840')
  })

  it('counts served+paid as fulfilled and voided not at all', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve([
        // Real and complete three ways:
        { id: 'O-a', items: 'TEA', total: 70, status: 'fulfilled', payment_status: 'paid', created: `${today} 11:00:00` },
        { id: 'O-b', items: 'TEA', total: 70, status: 'served', payment_status: 'paid', created: `${today} 11:30:00` },
        { id: 'O-c', items: 'TEA', total: 70, status: 'served', payment_status: 'unpaid', created: `${today} 12:00:00` },
        // Voided — must not drag the rate down:
        { id: 'O-d', items: 'TEA', total: 70, status: 'cancelled', voided_at: `${today} 12:30:00`, created: `${today} 12:15:00` },
      ])
      if (ep === 'menu') return Promise.resolve([])
      return Promise.resolve([])
    })

    const wrapper = mount(AnalyticsView, globalConfig)
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))

    // 3 real orders, 2 complete (fulfilled + served&paid) → 67%.
    const text = wrapper.text()
    expect(text).toContain('67%')
    expect(text).not.toContain('25%')
    expect(text).not.toContain('50%')
  })
})

// ─── C7: Revenue KPIs respect the date range and real orders ────────────────
import RevenueView from '../../../src/views/RevenueView.vue'

describe('C7: RevenueView sums only the picked range, real orders only', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentPermissions = ['revenue']
  })

  it('keeps history out of the KPIs', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve([
        // In range, real:
        { id: 'O-in', total: 140, payment: 'cash', status: 'fulfilled', created: '2026-08-27 15:54:00' },
        // In range, voided — excluded by isRealOrder:
        { id: 'O-invoid', total: 5000, payment: 'cash', status: 'cancelled', voided_at: '2026-08-27 10:00:00', created: '2026-08-27 09:00:00' },
        // Out of range (before the default 14-day window start 2026-08-14):
        { id: 'O-old', total: 9999, payment: 'cash', status: 'fulfilled', created: '2026-07-01 10:00:00' },
      ])
      return Promise.resolve([])
    })

    const wrapper = mount(RevenueView, globalConfig)
    await flushPromises()
    await new Promise(r => setTimeout(r, 50))

    const text = wrapper.text()
    expect(text).toContain('ETB 140')
    // All-history total (14,999+5,000) or voided-in-range (5,000) must not show.
    expect(text).not.toContain('5,000')
    expect(text).not.toContain('5,140')
    expect(text).not.toContain('9,999')
    expect(text).not.toContain('15,139')
  })
})
