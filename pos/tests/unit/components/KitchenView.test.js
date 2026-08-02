import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import KitchenView from '../../../src/views/KitchenView.vue'

// Mock API
const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...args) => mockApiGet(...args),
  apiPut: (...args) => mockApiPut(...args)
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
  close() {
    this.readyState = 2
  }
  // Simulate connection opened
  simulateOpen() {
    this.readyState = 1
    this.onopen?.({})
  }
  // Simulate an event
  simulateEvent(event, data) {
    const listeners = this._listeners[event] || []
    listeners.forEach(fn => fn({ data: JSON.stringify(data) }))
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}
vi.stubGlobal('EventSource', MockEventSource)

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
    const wrapper = mount(KitchenView)
    await flushPromises()

    expect(wrapper.find('h3').text()).toContain('Kitchen Display')
    expect(wrapper.text()).toContain('New Orders')
    expect(wrapper.text()).toContain('Preparing')
    expect(wrapper.text()).toContain('Ready')
  })

  it('should display orders in correct columns', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: '2xEspresso, 1xLatte', status: 'new', created: new Date().toISOString() },
      { id: 'O-2', items: 'Cappuccino', status: 'preparing', created: new Date().toISOString() },
      { id: 'O-3', items: 'Americano', status: 'ready', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView)
    await flushPromises()

    // Check column headers with counts
    expect(wrapper.text()).toContain('New Orders (1)')
    expect(wrapper.text()).toContain('Preparing (1)')
    expect(wrapper.text()).toContain('Ready (1)')
  })

  it('should show empty state for columns with no orders', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView)
    await flushPromises()

    expect(wrapper.text()).toContain('New Orders (1)')
    expect(wrapper.text()).toContain('Nothing in progress')
    expect(wrapper.text()).toContain('Nothing ready yet')
  })

  it('should have action buttons for each order', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView)
    await flushPromises()

    const newOrderBtn = wrapper.findAll('button').find(b => b.text().includes('Start Preparing'))
    expect(newOrderBtn).toBeDefined()
  })

  it('should update order status when button is clicked', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView)
    await flushPromises()

    const btn = wrapper.findAll('button').find(b => b.text().includes('Start Preparing'))
    await btn.trigger('click')
    await flushPromises()

    expect(mockApiPut).toHaveBeenCalledWith('orders', expect.objectContaining({
      id: 'O-1',
      status: 'preparing'
    }))
  })

  it('should show order items', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: '2xEspresso, 1xLatte, Macchiato', status: 'new', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView)
    await flushPromises()

    expect(wrapper.text()).toContain('2xEspresso, 1xLatte, Macchiato')
  })

  it('should show refresh button', async () => {
    const wrapper = mount(KitchenView)
    await flushPromises()

    const refreshBtn = wrapper.findAll('button').find(b => b.text().includes('Refresh'))
    expect(refreshBtn).toBeDefined()
  })

  it('should have mute/unmute button', async () => {
    const wrapper = mount(KitchenView)
    await flushPromises()

    // The mute button is inside .kitchen-toolbar-actions
    const toolbar = wrapper.find('.kitchen-toolbar-actions')
    expect(toolbar.find('button').exists()).toBe(true)
  })

  it('should show order ID with # prefix', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-abc123', items: 'Latte', status: 'new', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView)
    await flushPromises()

    expect(wrapper.text()).toContain('#O-abc123')
  })

  it('should auto-refresh orders every 15 seconds', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', created: new Date().toISOString() }
    ])

    mount(KitchenView)
    await flushPromises()

    const callCountBefore = mockApiGet.mock.calls.length

    vi.advanceTimersByTime(15000)
    await flushPromises()

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callCountBefore)
  })
})
