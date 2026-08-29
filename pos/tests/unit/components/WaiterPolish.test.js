import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Waiter mobile audit pass 2 — the polish backlog (item 6 of the priority
 * order), closed the same week:
 *
 * BUG-4 (a11y): the mobile-only layers exposed no accessible names —
 *   the floating cart was a clickable div, the modifier sheet's and the
 *   cart sheet's − / + steppers were bare glyphs, and the reservation
 *   modal's labels were never linked to their inputs (a11y tree showed
 *   bare textbox / spinbutton "0").
 *
 * UX-3: Orders and Reservations stacked every table cell as a label:value
 *   line on phones (~12 lines a ticket, 8 a booking). The cards are
 *   re-laid-out compactly via the ov-compact / rv-compact grid hooks —
 *   DOM unchanged, placement only.
 *
 * UX-4: the New Reservation sheet scrolled as one block, so on a short
 *   phone the Create button started below the fold. The sheet now pins
 *   title and actions and scrolls only the form body.
 */

const mockApiGet = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  ROLE_PERMISSIONS: { manager: ['reservations'], 'head-waiter': ['reservations'] },
  ROLE_DEFAULT_VIEW: { manager: 'dashboard' },
  NAV_ITEMS: []
}))

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { firstName: 'Test', role: 'Manager' },
    roleKey: 'manager',
    isAuthenticated: true,
    permissions: ['reservations'],
    hasPermission: (v) => v === 'reservations'
  }))
}))

const mockRoute = { query: {}, params: {} }
const mockRouter = { push: vi.fn(), replace: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  useRoute: () => mockRoute
}))

import MenuView from '../../../src/views/MenuView.vue'
import ModifierSelectionSheet from '../../../src/components/ModifierSelectionSheet.vue'
import ReservationsView from '../../../src/views/ReservationsView.vue'
import OrdersView from '../../../src/views/OrdersView.vue'
import { useOrderStore } from '../../../src/stores/order'

const MENU = [
  { id: 'MI1', name: 'Tea', category: 'HOT DRINKS', price: 70, available: true, modifiers: [] },
]
const TABLES = [
  { id: 'T3', number: 3, capacity: 6, section: 'Patio', status: 'available' },
  { id: 'T1', number: 1, capacity: 4, section: 'Main Hall', status: 'available' },
]
const RESERVATIONS = [
  { id: 'R1', name: 'Abebe Kebede', date: '2026-08-28', time: '19:00', guests: 4, table_num: 3, phone: '+251911223344', status: 'new' },
]
const ORDERS = [
  { id: 'O961bf4a', items: [{ name: 'Macchiato', qty: 2 }, { name: 'Tea', qty: 1 }], total: 840, tip: 40, discount: 0, payment_method: 'cash', order_type: 'dine-in', table_number: 3, status: 'served', created: '2026-08-27T11:02:00Z' },
]

const toastFn = vi.fn()

// ─── BUG-4: floating cart is a real button ───────────────────────────────────

describe('BUG-4 a11y — floating cart', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockApiGet.mockReset()
    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint === 'menu') return Promise.resolve(MENU)
      if (endpoint === 'tables') return Promise.resolve(TABLES)
      return Promise.resolve([])
    })
  })

  async function mountWithCart() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const orderStore = useOrderStore()
    orderStore.addItem({ menuItemId: 'MI1', name: 'Tea', basePrice: 70 })
    const wrapper = mount(MenuView, {
      global: { plugins: [pinia], provide: { toast: toastFn }, stubs: { ModifierSelectionSheet: true } },
    })
    await flushPromises()
    return { wrapper, orderStore }
  }

  it('exposes role, tabindex and a spoken label naming the count and total', async () => {
    const { wrapper } = await mountWithCart()
    const cart = wrapper.find('.floating-cart')
    expect(cart.exists()).toBe(true)
    expect(cart.attributes('role')).toBe('button')
    expect(cart.attributes('tabindex')).toBe('0')
    // 1 item, ETB 70 — the waiter hears what the button does before tapping
    expect(cart.attributes('aria-label')).toBe('Open cart, 1 item, ETB 70')
  })

  it('reflects open/closed state via aria-expanded', async () => {
    const { wrapper } = await mountWithCart()
    const cart = wrapper.find('.floating-cart')
    expect(cart.attributes('aria-expanded')).toBe('false')
    await cart.trigger('click')
    expect(cart.attributes('aria-expanded')).toBe('true')
  })

  it('opens from the keyboard (Enter and Space) like any button', async () => {
    const { wrapper } = await mountWithCart()
    const cart = wrapper.find('.floating-cart')
    await cart.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.cart-sheet').exists()).toBe(true)
    await cart.trigger('keydown', { key: ' ' })
    expect(wrapper.find('.cart-sheet').exists()).toBe(false)
  })
})

// ─── BUG-4: cart sheet and modifier steppers ─────────────────────────────────

describe('BUG-4 a11y — quantity steppers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockApiGet.mockReset()
    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint === 'menu') return Promise.resolve(MENU)
      return Promise.resolve([])
    })
  })

  it('cart sheet − / + / remove speak the dish they act on', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const orderStore = useOrderStore()
    orderStore.addItem({ menuItemId: 'MI1', name: 'Tea', basePrice: 70 })
    const wrapper = mount(MenuView, {
      global: { plugins: [pinia], provide: { toast: toastFn }, stubs: { ModifierSelectionSheet: true } },
    })
    await flushPromises()
    await wrapper.find('.floating-cart').trigger('click')

    const [minus, plus] = wrapper.findAll('.cart-qty .qty-btn')
    expect(minus.attributes('aria-label')).toBe('Remove one Tea from the order')
    expect(plus.attributes('aria-label')).toBe('Add one more Tea')
    expect(wrapper.find('.cart-remove').attributes('aria-label')).toBe('Remove Tea from the order')
    // the count itself is announced when it changes
    expect(wrapper.find('.qty-value').attributes('aria-live')).toBe('polite')
  })

  it('modifier sheet steppers are named and grouped under the Quantity label', async () => {
    const wrapper = mount(ModifierSelectionSheet, {
      props: {
        visible: true,
        menuItem: { id: 'MI1', name: 'Tea', price: 70, modifiers: ['Hot'] },
      },
      global: { provide: { toast: toastFn } },
    })
    await flushPromises()

    const controls = wrapper.find('.mod-qty-controls')
    expect(controls.attributes('role')).toBe('group')
    expect(controls.attributes('aria-labelledby')).toBeTruthy()
    // the label it points at exists and says Quantity
    const labelId = controls.attributes('aria-labelledby')
    const label = wrapper.find('#' + labelId)
    expect(label.exists()).toBe(true)
    expect(label.text()).toBe('Quantity')

    const [minus, plus] = wrapper.findAll('.mod-qty-btn')
    expect(minus.attributes('aria-label')).toBe('Decrease quantity')
    expect(plus.attributes('aria-label')).toBe('Increase quantity')
    expect(wrapper.find('.mod-qty-value').attributes('aria-live')).toBe('polite')
  })
})

// ─── BUG-4: reservation modal labels linked to inputs ────────────────────────

describe('BUG-4 a11y — reservation form', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockApiGet.mockReset()
    mockApiGet.mockImplementation((path) => {
      if (path === 'reservations') return Promise.resolve(RESERVATIONS)
      if (path === 'tables') return Promise.resolve(TABLES)
      if (String(path).startsWith('reservations/availability')) return Promise.resolve({ ok: true, taken: [] })
      return Promise.resolve([])
    })
  })

  async function mountOpen() {
    const wrapper = mount(ReservationsView, {
      global: { provide: { toast: toastFn, confirm: vi.fn(() => Promise.resolve(true)) } },
    })
    await flushPromises()
    const addBtn = wrapper.findAll('button').find(b => b.text().includes('New'))
    await addBtn.trigger('click')
    await flushPromises()
    return wrapper
  }

  it('every field label is programmatically linked to its control', async () => {
    const wrapper = await mountOpen()
    const modal = wrapper.find('.modal')

    for (const field of ['rv-name', 'rv-guests', 'rv-date', 'rv-time', 'rv-table', 'rv-duration', 'rv-phone']) {
      const input = modal.find('#' + field)
      expect(input.exists(), `input #${field} should exist`).toBe(true)
      // a label pointing at it exists (this is what the a11y tree reads)
      const label = modal.find(`label[for="${field}"]`)
      expect(label.exists(), `label[for=${field}] should exist`).toBe(true)
      expect(label.text().length).toBeGreaterThan(0)
    }
  })
})

// ─── UX-4: reservation sheet pins title and actions, scrolls the body ────────

describe('UX-4 — reservation modal scrolls its body, not its buttons', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockApiGet.mockReset()
    mockApiGet.mockImplementation((path) => {
      if (path === 'reservations') return Promise.resolve(RESERVATIONS)
      if (path === 'tables') return Promise.resolve(TABLES)
      if (String(path).startsWith('reservations/availability')) return Promise.resolve({ ok: true, taken: [] })
      return Promise.resolve([])
    })
  })

  async function mountOpen() {
    const wrapper = mount(ReservationsView, {
      global: { provide: { toast: toastFn, confirm: vi.fn(() => Promise.resolve(true)) } },
    })
    await flushPromises()
    const addBtn = wrapper.findAll('button').find(b => b.text().includes('New'))
    await addBtn.trigger('click')
    await flushPromises()
    return wrapper
  }

  it('the form sits in a scrollable body; Create lives outside it', async () => {
    const wrapper = await mountOpen()
    const body = wrapper.find('.rv-modal-body')
    expect(body.exists()).toBe(true)
    // every input is inside the scrolling body
    expect(body.findAll('input, select').length).toBeGreaterThanOrEqual(7)
    // the actions row is NOT inside the body — it can never scroll away
    const actions = wrapper.find('.modal-actions')
    expect(body.find('.modal-actions').exists()).toBe(false)
    expect(actions.exists()).toBe(true)
    expect(actions.text()).toContain('Create')
  })
})

// ─── UX-3: compact card hooks on the two stacked tables ──────────────────────

describe('UX-3 — compact card hooks', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockApiGet.mockReset()
    mockApiGet.mockImplementation((path) => {
      if (path === 'orders' || path === 'menu') return Promise.resolve(ORDERS)
      if (path === 'reservations') return Promise.resolve(RESERVATIONS)
      if (path === 'tables') return Promise.resolve(TABLES)
      return Promise.resolve([])
    })
  })

  it('reservations table carries the rv-compact hook with all cells intact', async () => {
    const wrapper = mount(ReservationsView, {
      global: { provide: { toast: toastFn, confirm: vi.fn(() => Promise.resolve(true)) } },
    })
    await flushPromises()

    const table = wrapper.find('table.rv-compact')
    expect(table.exists()).toBe(true)
    // the data the compact layout places is all still in the DOM
    const row = table.find('tbody tr')
    const cells = row.findAll('td')
    expect(cells.length).toBe(8)
    expect(row.text()).toContain('Abebe Kebede')
    expect(row.text()).toContain('19:00')
    expect(row.text()).toContain('+251911223344')
  })

  it('orders table carries the ov-compact hook with all cells intact', async () => {
    const wrapper = mount(OrdersView, {
      global: {
        provide: { toast: toastFn, confirm: vi.fn(() => Promise.resolve(true)) },
      },
    })
    await flushPromises()

    const table = wrapper.find('table.ov-compact')
    expect(table.exists()).toBe(true)
    const row = table.find('tbody tr')
    // all twelve cells stay in the DOM — only CSS placement changes
    expect(row.findAll('td').length).toBe(12)
    expect(row.text()).toContain('#O961bf4a')
    expect(row.text()).toContain('840')
    expect(row.text()).toContain('served')
  })
})
