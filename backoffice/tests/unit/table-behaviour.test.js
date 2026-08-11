import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * Characterization coverage for the table screens, written immediately before
 * they are migrated onto a shared BaseTable component.
 *
 * ── Why these exist alongside the Playwright suite ─────────────────────────
 *
 * tests/e2e/tables.spec.js covers the same ground in a real browser and is the
 * better test — it can see computed styles, so it can catch a badge that
 * renders unstyled. It runs in CI. It cannot run on this machine: Playwright
 * 1.62.1 here fails to register any test file, including the POS suite that
 * passes in CI, so it is a local environment fault rather than a config one.
 *
 * A characterization suite that cannot be executed before the refactor proves
 * nothing about the refactor. So these mount the real views in jsdom and assert
 * the same behaviours one layer up — class names instead of computed colours —
 * which is what actually gates the migration locally.
 *
 * They assert what a person would look at: how many rows, what a cell says,
 * which badge class. Not internal structure, so replacing the markup underneath
 * must leave them passing untouched.
 */

const mockApiGet = vi.fn()
vi.mock('../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  API: '',
  isOnline: () => true,
  onOnlineChange: () => () => {},
  TODAY: () => '2026-08-11',
}))
vi.mock('../../src/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'S9', firstName: 'Amanuel', role: 'Manager' }, roleKey: 'manager' }),
}))
vi.mock('chart.js/auto', () => ({ default: class { destroy() {} } }))

import OrdersView from '../../src/views/OrdersView.vue'
import DeliveryView from '../../src/views/DeliveryView.vue'
import StaffView from '../../src/views/StaffView.vue'

const cfg = { global: { provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) } } }

/** Only these classes exist in styles.css; anything else renders unstyled. */
const STYLED = ['badge-success', 'badge-new', 'badge-pending', 'badge-cancelled', 'badge-neutral',
  'badge-preparing', 'badge-ready', 'badge-completed', 'badge-fulfilled', 'badge-low',
  'badge-active', 'badge-available', 'badge-confirmed', 'badge-assigned', 'badge-in-transit', 'badge-delivered']

const ORDERS = [
  { id: 'O-alpha', tableId: 'T1', items: '2x Macchiato, 1x Tea', total: 550, tip: 50, status: 'fulfilled', payment: 'cash', created: '2026-08-11 09:15:00' },
  { id: 'O-bravo', tableId: 'T2', items: '1x Tibs', total: 900, tip: 0, status: 'cancelled', payment: 'telebirr', created: '2026-08-11 10:00:00' },
  { id: 'O-charlie', tableId: 'T3', items: '1x Pizza', total: 400, tip: 0, status: 'fulfilled', payment: 'cash', created: '2026-08-11 11:00:00', voided_at: '2026-08-11 11:30:00' },
  { id: 'O-delta', tableId: 'T4', items: '1x Dulet', total: 300, tip: 0, status: 'new', payment: 'cbe', created: '2026-08-10 22:30:00' },
]

const DELIVERY = [
  { id: 'D1', orderId: 'O-alpha', customer: 'Ahmed', address: 'Bole', phone: '0911', status: 'picked_up' },
  { id: 'D2', orderId: 'O-delta', customer: 'Sara', address: 'Kazanchis', phone: '0922', status: 'out_for_delivery' },
  { id: 'D3', orderId: 'O-bravo', customer: 'Dawit', address: 'Piassa', phone: '0933', status: 'delivered' },
]

const STAFF = [
  { id: 'S1', firstName: 'Selam', lastName: 'Wondimu', email: 'selam@fufut.coffee', role: 'head-chef', status: 'active' },
  { id: 'S3', firstName: 'Nohemail', lastName: 'Person', email: '', role: 'cleaner', status: 'active' },
]

async function open(view, rows) {
  mockApiGet.mockImplementation(() => Promise.resolve(rows))
  const w = mount(view, cfg)
  await flushPromises()
  return w
}

describe('Orders table', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one row per order with its id and items', async () => {
    const w = await open(OrdersView, ORDERS)
    expect(w.findAll('tbody tr')).toHaveLength(ORDERS.length)
    expect(w.text()).toContain('O-alpha')
    expect(w.text()).toContain('2x Macchiato, 1x Tea')
  })

  /**
   * `created` is UTC, the wall clock is UTC+3. A 22:30 stamp is a 01:30 sale
   * and the kitchen was shown the UTC time.
   */
  it('shows local time, not UTC', async () => {
    const w = await open(OrdersView, ORDERS)
    const row = w.findAll('tbody tr').find(r => r.text().includes('O-delta'))
    expect(row.text()).toContain('01:30')
    expect(row.text()).not.toContain('22:30')
  })

  /** 550 − 50 tip + 300 = 800. Gross of everything would be 2150. */
  it('nets sales of cancelled, voided and tips', async () => {
    const w = await open(OrdersView, ORDERS)
    const summary = w.find('.summary-grid').text()
    expect(summary).toContain('800')
    expect(summary).not.toContain('2150')
    expect(summary).toContain('2 excluded')
  })

  it('gives every status badge a class that exists', async () => {
    const w = await open(OrdersView, ORDERS)
    const badges = w.findAll('tbody .badge')
    expect(badges.length).toBeGreaterThan(0)
    for (const b of badges) {
      const styled = b.classes().some(c => STYLED.includes(c))
      expect(styled, `unstyled badge: ${b.classes().join(' ')}`).toBe(true)
    }
  })

  it('explains an empty table rather than showing nothing', async () => {
    const w = await open(OrdersView, [])
    expect(w.find('tbody').text()).toContain('No orders')
  })

  it('paginates rather than putting every row in the DOM', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...ORDERS[0], id: `O-${i}` }))
    const w = await open(OrdersView, many)
    expect(w.findAll('tbody tr')).toHaveLength(50)
    expect(w.find('.pagination').text()).toContain('1–50 of 120')
  })

  it('advances a page', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...ORDERS[0], id: `O-${i}` }))
    const w = await open(OrdersView, many)
    await w.findAll('.pagination button').find(b => b.text() === 'Next').trigger('click')
    expect(w.find('.pagination').text()).toContain('51–100 of 120')
  })

  it('freezes the first column on a wide table', async () => {
    const w = await open(OrdersView, ORDERS)
    // jsdom applies no stylesheet, so the opt-in class is the assertable proxy
    // for the sticky behaviour the browser suite checks directly.
    expect(w.find('.table-scroll').classes()).toContain('table-sticky-first')
  })
})

describe('Delivery table', () => {
  beforeEach(() => vi.clearAllMocks())

  /**
   * The defect that motivated the badge composable: `picked_up` and
   * `out_for_delivery` had no CSS class, so a driver's two busiest states
   * rendered as bare text.
   */
  it('styles every lifecycle status, including picked_up', async () => {
    const w = await open(DeliveryView, DELIVERY)
    const badges = w.findAll('tbody .badge')
    expect(badges.length).toBe(DELIVERY.length)
    for (const b of badges) {
      expect(b.classes().some(c => STYLED.includes(c)), `unstyled: ${b.classes()}`).toBe(true)
    }
  })

  it('renders machine statuses readably', async () => {
    const w = await open(DeliveryView, DELIVERY)
    expect(w.text()).toContain('Out for delivery')
    expect(w.text()).not.toContain('out_for_delivery')
  })
})

describe('Staff table', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the email each account signs in with', async () => {
    const w = await open(StaffView, STAFF)
    expect(w.text()).toContain('selam@fufut.coffee')
  })

  it('flags an account that cannot sign in', async () => {
    const w = await open(StaffView, STAFF)
    const row = w.findAll('tbody tr').find(r => r.text().includes('Nohemail'))
    expect(row.text()).toContain('cannot sign in')
  })

  it('shows the current role in the selector', async () => {
    const w = await open(StaffView, STAFF)
    const row = w.findAll('tbody tr').find(r => r.text().includes('Selam'))
    expect(row.find('select').element.value).toBe('head-chef')
  })
})
