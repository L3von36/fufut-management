import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Waiter mobile audit pass 2, BUG-1 (P1): the stale success screen.
 *
 * checkoutStep becomes 'success' when a payment completes and nothing resets
 * it on route-leave. On a shared floor tablet the SPA session lives all
 * shift, so every settle after the first payment re-entered Checkout with
 * the step still 'success' — Open Checks → Settle hydrated the NEW check's
 * cart correctly but rendered the PREVIOUS order's "Order Confirmed!" screen
 * over it, and the new check's money was unpayable until a full reload.
 *
 * The receipt payload (lastPayload) is component-instance state, so a
 * remounted 'success' step is always stale: CheckoutView must drop it back
 * to the review step on mount.
 */

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiPost = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPut: (...a) => mockApiPut(...a),
  apiPost: (...a) => mockApiPost(...a),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../../../src/composables/useAudioAlerts', () => ({
  useAudioAlerts: () => ({ playOrderReady: vi.fn() }),
}))

vi.mock('../../../src/lib/print', () => ({
  customerReceipt: vi.fn(() => true),
}))

vi.mock('../../../src/lib/receiptVerifier', () => ({
  verifyReceipt: vi.fn(() => null),
}))

vi.mock('../../../src/components/ModifierSelectionSheet.vue', () => ({
  default: { name: 'ModifierSelectionSheet', props: ['visible', 'menuItem'], emits: ['confirm', 'cancel'], template: '<div />' }
}))

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => ({
    roleKey: 'head-waiter',
    isAuthenticated: true,
    user: { firstName: 'Yonas' },
    hasPermission: () => true,
  }),
}))

import CheckoutView from '../../../src/views/CheckoutView.vue'
import { useOrderStore } from '../../../src/stores/order'

const TABLES = [
  { id: 'T3', number: 3, status: 'occupied', guests: 2, server: 'Yonas', seated_at: '2026-08-27T05:02:18.003Z' },
]

// The fresh open check the waiter is settling: one unpaid line, still open.
const OPEN_ORDER_B = {
  id: 'Ob5d8535',
  status: 'preparing',
  payment_status: 'unpaid',
  table_number: 3,
  type: 'dine-in',
  items: [{ name: 'Tea', qty: 1, unit_price: 70, status: 'preparing' }],
}

const toastFn = vi.fn()

/**
 * Mount Checkout the way the bug reproduced live: an earlier payment in the
 * same SPA session left the store on the success step (cart cleared,
 * lastOrderId of the PAID order), and Open Checks → Settle then pointed
 * activeOpenOrderId at a different, still-open check.
 */
async function mountWithStaleSuccess() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useOrderStore()
  // ── State after settling order A (the session's first payment) ──
  store.checkoutStep = 'success'
  store.lastOrderId = 'O961bf4a'   // order A, already paid
  store.clearCart()                 // cart cleared on payment
  store.orderType = 'dine-in'
  store.tableNum = '3'
  // ── Then Open Checks → Settle on a fresh check ──
  store.activeOpenOrderId = 'Ob5d8535'

  mockApiGet.mockImplementation((endpoint) => {
    if (endpoint === 'tables') return Promise.resolve(TABLES)
    if (endpoint === 'orders/Ob5d8535') return Promise.resolve(OPEN_ORDER_B)
    return Promise.resolve([])
  })
  mockApiPut.mockReset().mockResolvedValue({ ok: true })

  const wrapper = mount(CheckoutView, {
    global: {
      plugins: [pinia],
      provide: { toast: toastFn },
      stubs: { ModifierSelectionSheet: true },
    },
  })
  await flushPromises()
  return { wrapper, store }
}

describe('stale success screen on re-entry (BUG-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toastFn.mockReset()
  })

  it('drops a stale success step and hydrates the new check at the review step', async () => {
    const { wrapper, store } = await mountWithStaleSuccess()

    // Not the previous order's confirmation…
    expect(wrapper.text()).not.toContain('Order Confirmed!')
    expect(wrapper.text()).not.toContain('O961bf4a')
    // …the new check is hydrated and the store is back at the review step.
    expect(store.checkoutStep).toBe('cart')
    expect(store.items.length).toBe(1)
    expect(store.items[0].name).toBe('Tea')
    expect(wrapper.text()).toContain('Tea')
  })

  it('keeps the paid order id out of the screen even after hydration bails', async () => {
    // Settle points at a check that was already paid elsewhere: the stale
    // success screen must still not survive the mount.
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useOrderStore()
    store.checkoutStep = 'success'
    store.lastOrderId = 'O961bf4a'
    store.clearCart()
    store.activeOpenOrderId = 'Ogone999'

    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint === 'tables') return Promise.resolve(TABLES)
      if (endpoint === 'orders/Ogone999') {
        return Promise.resolve({ id: 'Ogone999', status: 'served', payment_status: 'paid', items: [] })
      }
      return Promise.resolve([])
    })

    const wrapper = mount(CheckoutView, {
      global: {
        plugins: [pinia],
        provide: { toast: toastFn },
        stubs: { ModifierSelectionSheet: true },
      },
    })
    await flushPromises()

    expect(store.checkoutStep).not.toBe('success')
    expect(wrapper.text()).not.toContain('Order Confirmed!')
  })

  it('does not touch the step when the screen is entered without a stale success', async () => {
    // Fresh session, waiter walks in from the menu with a cart: the step is
    // 'cart' and must stay exactly where the flow expects it.
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useOrderStore()
    store.orderType = 'takeaway'
    store.addItem({ menuItemId: 'MI1', name: 'Tea', basePrice: 70 })
    store.activeOpenOrderId = null

    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint === 'tables') return Promise.resolve(TABLES)
      return Promise.resolve([])
    })

    mount(CheckoutView, {
      global: {
        plugins: [pinia],
        provide: { toast: toastFn },
        stubs: { ModifierSelectionSheet: true },
      },
    })
    await flushPromises()

    expect(store.checkoutStep).toBe('cart')
    expect(store.items.length).toBe(1)
  })
})
