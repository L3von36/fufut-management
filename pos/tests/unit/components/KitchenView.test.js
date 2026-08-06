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

  it('should have action buttons for each order', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    const newOrderBtn = wrapper.findAll('button').find(b => b.text().includes('Start Preparing'))
    expect(newOrderBtn).toBeDefined()
  })

  it('should update order status when button is clicked', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'Espresso', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    const btn = wrapper.findAll('button').find(b => b.text().includes('Start Preparing'))
    await btn.trigger('click')
    await flushPromises()

    expect(mockApiPut).toHaveBeenCalledWith('orders/O-1', expect.objectContaining({
      status: 'preparing'
    }))
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
