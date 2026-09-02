import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * The success screen's Free Up Table button.
 *
 * Freeing the table after the guest pays is the waiter's next physical act,
 * but the only Free Up button lived on the review step — reachable only
 * BEFORE payment. Once "Order Confirmed!" appeared there was no way back, and
 * the floor plan accumulated occupied tables nobody remembered to clear by
 * hand (the mobile waiter audit reproduced exactly that: paid bill, table
 * still Occupied).
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

const toastFn = vi.fn()

async function mountAtSuccess({ orderType = 'dine-in', tableNum = '3' } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useOrderStore()
  store.orderType = orderType
  store.tableNum = tableNum
  store.addItem({ menuItemId: 'MI1', name: 'Tea', basePrice: 70 })
  // Arrive on the success step the way processPayment leaves it: cart cleared,
  // table context still on the store, an open tab settled.
  store.activeOpenOrderId = 'Otab88a4'
  store.lastOrderId = 'Otab88a4'

  mockApiGet.mockImplementation((endpoint) => {
    if (endpoint === 'tables') return Promise.resolve(TABLES)
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
  store.checkoutStep = 'success'
  await flushPromises()
  return { wrapper, store }
}

describe('success screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toastFn.mockReset()
  })

  it('offers Free Up Table for a settled dine-in tab', async () => {
    const { wrapper } = await mountAtSuccess()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('Free Up Table'))
    expect(btn?.text()).toContain('3')
  })

  it('frees the table through the same confirm dialog and retires the button', async () => {
    const { wrapper } = await mountAtSuccess()

    await wrapper.findAll('button').find((b) => b.text().includes('Free Up Table')).trigger('click')
    await flushPromises()

    // Confirm dialog appears…
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'Yes, Free Table')
    expect(confirmBtn).toBeTruthy()
    await confirmBtn.trigger('click')
    await flushPromises()

    expect(mockApiPut).toHaveBeenCalledWith('tables/T3', expect.objectContaining({ status: 'available' }))
    // The section owner survives: the PUT must not carry a server key at all
    // (omitting it leaves the stored name untouched — that name is what the
    // head-waiter's Orders scoping matches on). Overwriting it with '' would
    // wipe the table out of Yonas's section on every freed party.
    const putBody = mockApiPut.mock.calls.find((c) => c[0] === 'tables/T3')[1]
    expect(putBody).not.toHaveProperty('server')
    expect(wrapper.findAll('button').find((b) => b.text().includes('Free Up Table'))).toBeUndefined()
  })

  it('shows nothing to free on a takeaway', async () => {
    const { wrapper } = await mountAtSuccess({ orderType: 'takeaway', tableNum: '' })
    expect(wrapper.findAll('button').find((b) => b.text().includes('Free Up Table'))).toBeUndefined()
  })
})
