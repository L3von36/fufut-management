import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Send to Kitchen on a table that is already seated.
 *
 * The normal waiter flow: seat the party from the table sheet (the table is
 * now Occupied), open the table, add their order, Send to Kitchen. The old
 * claimTable answered that flow with a table claim — a new seating over the
 * party already sitting there — which the server refuses with 409. The api
 * layer then swallowed the refusal as a fake offline success, so the order
 * fired anyway with a poisoned write left in the sync queue.
 *
 * The fix mirrors CheckoutView: an occupied table is already claimed. The
 * order belongs to the party that is sitting there; claim nothing.
 */

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiPost = vi.fn()
const mockApiPatch = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPut: (...a) => mockApiPut(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPatch: (...a) => mockApiPatch(...a),
}))

const mockRoute = { query: { table: '3' }, params: {} }
const mockRouter = { push: vi.fn(), replace: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  useRoute: () => mockRoute
}))

vi.mock('../../../src/components/ModifierSelectionSheet.vue', () => ({
  default: { name: 'ModifierSelectionSheet', props: ['visible', 'menuItem'], emits: ['confirm', 'cancel'], template: '<div />' }
}))

import MenuView from '../../../src/views/MenuView.vue'
import { useOrderStore } from '../../../src/stores/order'

const MENU = [
  { id: 'MI1', name: 'Tea', category: 'HOT DRINKS', price: 70, available: true, modifiers: [] },
]

const OCCUPIED_TABLES = [
  { id: 'T3', number: 3, status: 'occupied', guests: 2, server: 'Yonas', seated_at: '2026-08-27T05:02:18.003Z' },
]
const FREE_TABLES = [
  { id: 'T3', number: 3, status: 'available', guests: 0, server: '', seated_at: '' },
]

const toastFn = vi.fn()

async function openWithCart(tables) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const orderStore = useOrderStore()
  orderStore.tableNum = '3'
  orderStore.orderType = 'dine-in'
  orderStore.addItem({ menuItemId: 'MI1', name: 'Tea', basePrice: 70 })

  mockApiGet.mockImplementation((endpoint) => {
    if (endpoint === 'menu') return Promise.resolve(MENU)
    if (endpoint === 'tables') return Promise.resolve(tables)
    return Promise.resolve([])
  })
  mockApiPut.mockReset().mockResolvedValue({ ok: true })
  mockApiPost.mockReset().mockResolvedValue({ ok: true, id: 'Onew123' })

  const wrapper = mount(MenuView, {
    global: {
      plugins: [pinia],
      provide: { toast: toastFn },
      stubs: { ModifierSelectionSheet: true },
    },
  })
  await flushPromises()
  return { wrapper, orderStore }
}

async function openCartAndFindSendButton(wrapper) {
  // The Send to Kitchen button lives inside the cart sheet, which opens from
  // the floating cart pill once the cart has items.
  const pill = wrapper.find('.floating-cart')
  if (pill.exists()) {
    await pill.trigger('click')
    await flushPromises()
  }
  return wrapper.findAll('button').find((b) => b.text().includes('Send to Kitchen'))
}

describe('Send to Kitchen on an already-seated table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toastFn.mockReset()
  })

  it('does not try to claim the table the party is already sitting at', async () => {
    const { wrapper } = await openWithCart(OCCUPIED_TABLES)

    const send = await openCartAndFindSendButton(wrapper)
    await send.trigger('click')
    await flushPromises()

    const tablePuts = mockApiPut.mock.calls.filter(([ep]) => String(ep).startsWith('tables/'))
    expect(tablePuts).toEqual([])
  })

  it('still fires the order — the party is seated, the kitchen should cook', async () => {
    const { wrapper } = await openWithCart(OCCUPIED_TABLES)

    const send = await openCartAndFindSendButton(wrapper)
    await send.trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('orders', expect.anything())
    expect(toastFn).toHaveBeenCalledWith(expect.stringContaining('sent to kitchen'), 'success')
  })

  it('claims a free table as before, with a new seating', async () => {
    const { wrapper } = await openWithCart(FREE_TABLES)

    const send = await openCartAndFindSendButton(wrapper)
    await send.trigger('click')
    await flushPromises()

    expect(mockApiPut).toHaveBeenCalledWith(
      'tables/T3',
      expect.objectContaining({ status: 'occupied', newSeating: true })
    )
    expect(mockApiPost).toHaveBeenCalledWith('orders', expect.anything())
  })

  it('stops the send when the claim is refused (reserved table), with the server\'s reason', async () => {
    const { wrapper } = await openWithCart(FREE_TABLES)
    mockApiPut.mockReset().mockRejectedValue(
      Object.assign(new Error('Table 3 is reserved. A manager must release it before it can be seated.'), { status: 409, httpError: true })
    )

    const send = await openCartAndFindSendButton(wrapper)
    await send.trigger('click')
    await flushPromises()

    expect(mockApiPost).not.toHaveBeenCalled()
    expect(toastFn).toHaveBeenCalledWith(expect.stringContaining('reserved'), 'error')
  })
})
