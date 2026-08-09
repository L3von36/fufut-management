import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import KitchenView from '../../../src/views/KitchenView.vue'
import BaseButton from '../../../src/components/BaseButton.vue'

// Mock API
const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...args) => mockApiGet(...args),
  apiPut: (...args) => mockApiPut(...args),
  getSSEUrl: (eventPath) => `http://localhost:1234/api/events/${eventPath}`,
  ROLE_PERMISSIONS: { manager: ['kitchen'] },
  ROLE_DEFAULT_VIEW: { manager: 'dashboard' },
  NAV_ITEMS: []
}))

// Mock useAudioAlerts
vi.mock('../../../src/composables/useAudioAlerts', () => ({
  useAudioAlerts: vi.fn(() => ({
    muted: { value: false },
    enabled: { value: true },
    playNewOrder: vi.fn(),
    playOrderReady: vi.fn(),
    playOrderUpdate: vi.fn(),
    toggleMute: vi.fn()
  }))
}))

// Mock EventSource
class MockEventSource {
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.onopen = null
    this.onerror = null
    this.onmessage = null
    this._listeners = {}
  }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(fn)
  }
  removeEventListener(event, fn) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn)
    }
  }
  close() { this.readyState = 2 }
  simulateOpen() { this.readyState = 1; this.onopen?.({}) }
  simulateEvent(event, data) {
    const listeners = this._listeners[event] || []
    listeners.forEach(fn => fn({ data: JSON.stringify(data) }))
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}
vi.stubGlobal('EventSource', MockEventSource)

const globalConfig = {
  global: {
    stubs: { BaseButton: false },
    provide: { toast: vi.fn() }
  }
}

describe('KitchenView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setActivePinia(createPinia())

    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

    mockApiGet.mockResolvedValue([])
    mockApiPut.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    const c = document.getElementById('toastContainer')
    if (c) c.remove()
  })

  it('should render the kitchen display with 3 columns', async () => {
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Kitchen Display')
    expect(wrapper.text()).toContain('New Orders')
    expect(wrapper.text()).toContain('Preparing')
    expect(wrapper.text()).toContain('Ready')
  })

  it('should display orders in correct columns', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: '2xEspresso, 1xLatte', status: 'new', type: 'dine-in', created: new Date().toISOString() },
      { id: 'O-2', items: 'Cappuccino', status: 'preparing', type: 'dine-in', created: new Date().toISOString() },
      { id: 'O-3', items: 'Americano', status: 'ready', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('New Orders')
    expect(wrapper.text()).toContain('Preparing')
    expect(wrapper.text()).toContain('Ready')
    expect(wrapper.findAll('.kc-count').length).toBe(3)
  })

  it('should show empty state for columns with no orders', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('New Orders')
    expect(wrapper.text()).toContain('Nothing in progress')
    expect(wrapper.text()).toContain('Nothing ready yet')
  })

  // The whole-ticket button is now labelled "Start All", because marking one
  // line at a time sits alongside it. It must stay a single tap: if the
  // granular path were the only path, the screen would be slower than before.
  it('should have action buttons for each order', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    const newOrderBtn = wrapper.findAll('button').find(b => b.text().includes('Start All'))
    expect(newOrderBtn).toBeDefined()
  })

  it('should update order status when button is clicked', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    const btn = wrapper.findAll('button').find(b => b.text().includes('Start All'))
    await btn.trigger('click')
    await flushPromises()

    expect(mockApiPut).toHaveBeenCalledWith('orders/O-1', expect.objectContaining({
      status: 'preparing'
    }))
  })

  // â”€â”€â”€ Per-item marking â”€â”€â”€
  // Route the two feeds separately, which is what the component actually does.
  function mockFeeds(orders, items) {
    mockApiGet.mockImplementation((path) =>
      Promise.resolve(path === 'orders/items/active' ? items : orders)
    )
  }

  const trackedOrder = {
    id: 'O-1', items: 'Espresso, Firfir', status: 'new', type: 'dine-in',
    created: new Date().toISOString()
  }

  // Built fresh per test on purpose. The component updates a line optimistically
  // by mutating the row it was handed, so a shared fixture array would carry a
  // previous test's status into the next one.
  const makeTrackedItems = () => ([
    { id: 'OI-1', order_id: 'O-1', line_no: 0, name: 'Espresso', category: 'Hot Drinks', qty: 1, status: 'new', modifiers: null },
    { id: 'OI-2', order_id: 'O-1', line_no: 1, name: 'Firfir', category: 'Food', qty: 2, status: 'new', modifiers: null }
  ])

  it('renders one tappable control per tracked line', async () => {
    mockFeeds([trackedOrder], makeTrackedItems())
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    const lines = wrapper.findAll('.ko-line-tap')
    expect(lines).toHaveLength(2)
    expect(lines[0].text()).toContain('Espresso')
    expect(lines[1].text()).toContain('Firfir')
  })

  it('advances a single line without touching the rest of the ticket', async () => {
    mockFeeds([trackedOrder], makeTrackedItems())
    mockApiPut.mockResolvedValue({ ok: true, status: 'preparing', orderStatus: 'preparing' })

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    await wrapper.findAll('.ko-line-tap')[0].trigger('click')
    await flushPromises()

    // Only the tapped line is sent, and only to its own endpoint.
    expect(mockApiPut).toHaveBeenCalledWith('orders/O-1/items/OI-1', { status: 'preparing' })
    expect(mockApiPut).not.toHaveBeenCalledWith('orders/O-1/items/OI-2', expect.anything())
  })

  it('walks a line through the flow one state at a time', async () => {
    mockFeeds([trackedOrder], [{ ...makeTrackedItems()[0], status: 'preparing' }])
    mockApiPut.mockResolvedValue({ ok: true })

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    await wrapper.find('.ko-line-tap').trigger('click')
    await flushPromises()

    expect(mockApiPut).toHaveBeenCalledWith('orders/O-1/items/OI-1', { status: 'ready' })
  })

  it('shows how much of a ticket is finished', async () => {
    mockFeeds(
      [{ ...trackedOrder, status: 'preparing' }],
      [
        { ...makeTrackedItems()[0], status: 'ready' },
        { ...makeTrackedItems()[1], status: 'preparing' }
      ]
    )
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('1 of 2 ready')
  })

  // Orders taken before per-line tracking existed have no rows in order_items,
  // and must still show their contents rather than an empty ticket.
  it('falls back to the flat item list when a line has no tracking row', async () => {
    mockFeeds([trackedOrder], [])
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.findAll('.ko-line-tap')).toHaveLength(0)
    expect(wrapper.text()).toContain('Espresso')
  })

  it('restores the line and warns if the server rejects the change', async () => {
    mockFeeds([trackedOrder], makeTrackedItems())
    mockApiPut.mockRejectedValue(new Error('offline'))

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    await wrapper.findAll('.ko-line-tap')[0].trigger('click')
    await flushPromises()

    // Optimistic update rolled back, so the line does not look done when it is not.
    expect(wrapper.findAll('.ko-line-tap')[0].classes()).toContain('st-new')
  })

  // The tickets still have to render if only the tracking feed is down.
  it('still shows orders when the item feed fails', async () => {
    mockApiGet.mockImplementation((path) =>
      path === 'orders/items/active'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve([trackedOrder])
    )

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Espresso')
  })

  it('should show order items', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: '2xEspresso, 1xLatte, Macchiato', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Espresso')
    expect(wrapper.text()).toContain('Latte')
    expect(wrapper.text()).toContain('Macchiato')
  })

  it('should show refresh button', async () => {
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    const refreshBtn = wrapper.findAll('button').find(b => b.text().includes('Refresh'))
    expect(refreshBtn).toBeDefined()
  })

  it('should have mute/unmute button', async () => {
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    const toolbar = wrapper.find('.kitchen-toolbar-actions')
    expect(toolbar.find('button').exists()).toBe(true)
  })

  it('should show order ID', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-abc123', items: 'Latte', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    // shortId may truncate, just verify # prefix is present
    expect(wrapper.find('.ko-id').text()).toMatch(/^#/)
  })

  it('should auto-refresh orders every 15 seconds', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    mount(KitchenView, globalConfig)
    await flushPromises()

    const callCountBefore = mockApiGet.mock.calls.length

    vi.advanceTimersByTime(15000)
    await flushPromises()

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callCountBefore)
  })
})
