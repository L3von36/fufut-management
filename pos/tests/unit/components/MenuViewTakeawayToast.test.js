import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Waiter mobile audit pass 2 — the two MenuView fixes:
 *
 * BUG-3: tapping an unavailable dish was a silent no-op. On a phone the
 *   "Unavailable" ribbon is small; three taps that do nothing read as a
 *   frozen app. The tap now says why nothing happened.
 *
 * UX-1: the table context bar's button said "Change" but what it did was
 *   unbind the table and silently turn the order into a takeaway —
 *   destructive once items are on the ticket. It now says what it does
 *   ("Make Takeaway") and confirms when the ticket has lines.
 */

const mockApiGet = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a)
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
  { id: 'MI2', name: 'Pizza', category: 'ETHIOPIAN DISH', price: 500, available: false, modifiers: [] },
]

const TABLES = [
  { id: 'T3', number: 3, status: 'occupied', guests: 2, server: 'Yonas', seated_at: '2026-08-27T05:02:18.003Z' },
]

const toastFn = vi.fn()

async function mountWithTable({ withItems = false } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const orderStore = useOrderStore()
  orderStore.tableNum = '3'
  orderStore.orderType = 'dine-in'
  if (withItems) {
    orderStore.addItem({ menuItemId: 'MI1', name: 'Tea', basePrice: 70 })
  }

  mockApiGet.mockImplementation((endpoint) => {
    if (endpoint === 'menu') return Promise.resolve(MENU)
    if (endpoint === 'tables') return Promise.resolve(TABLES)
    return Promise.resolve([])
  })

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

/** The menu card tile for a given item name (tap target). */
function cardFor(wrapper, name) {
  return wrapper.findAll('.menu-card').find(n => n.text().includes(name))
}

describe('BUG-3: tapping an unavailable dish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toastFn.mockReset()
  })

  it('explains itself instead of being a silent no-op', async () => {
    const { wrapper, orderStore } = await mountWithTable()

    // The unavailable card is still rendered (disabled ribbon)…
    expect(wrapper.text()).toContain('Pizza')
    // …and tapping any element of it does not add it…
    const before = orderStore.items.length
    const pizza = cardFor(wrapper, 'Pizza')
    if (pizza) {
      await pizza.trigger('click')
      await flushPromises()
    }
    expect(orderStore.items.length).toBe(before)
    // …but the waiter is told why.
    expect(toastFn).toHaveBeenCalled()
    const msg = String(toastFn.mock.calls[0]?.[0] || '')
    expect(msg.toLowerCase()).toContain('unavailable')
  })
})

describe('UX-1: the table context bar unbind action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toastFn.mockReset()
  })

  it('says what it does instead of "Change"', async () => {
    const { wrapper } = await mountWithTable()
    const bar = wrapper.find('.table-context-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('Ordering for')
    expect(bar.text()).toContain('Table 3')
    expect(bar.find('button').text()).toBe('Make Takeaway')
    expect(bar.find('button').text()).not.toBe('Change')
  })

  it('confirms before unbinding a table that has a ticket', async () => {
    const { wrapper, orderStore } = await mountWithTable({ withItems: true })

    await wrapper.find('.tcb-clear').trigger('click')
    await flushPromises()

    // Not cleared yet — the confirm dialog is up, table still bound.
    expect(orderStore.tableNum).toBe('3')
    expect(wrapper.text()).toContain('Make this a takeaway?')

    const confirm = wrapper.findAll('button').find(b => b.text().includes('Yes, Make Takeaway'))
    expect(confirm).toBeTruthy()
    await confirm.trigger('click')
    await flushPromises()

    expect(orderStore.tableNum).toBe('')
    expect(orderStore.orderType).toBe('takeaway')
    // The ticket itself survives — only the table binding is dropped.
    expect(orderStore.items.length).toBe(1)
  })

  it('unbinds immediately when the ticket is empty (nothing to lose)', async () => {
    const { wrapper, orderStore } = await mountWithTable({ withItems: false })

    await wrapper.find('.tcb-clear').trigger('click')
    await flushPromises()

    expect(orderStore.tableNum).toBe('')
    expect(orderStore.orderType).toBe('takeaway')
    expect(wrapper.text()).not.toContain('Make this a takeaway?')
  })
})
