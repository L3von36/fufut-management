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

// The board reads the route to tell the kitchen screen from the barista one
// (isBarista), so the tests need a route even though none mounts a router.
// Flip mockRoute.name to 'barista' to exercise the barista mode.
const mockRoute = { name: 'kitchen' }
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute
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

    mockApiGet.mockResolvedValue([])
    mockApiPut.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.useRealTimers()
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

    // Espresso is a drink, Firfir is food. On All Stations each tracked line
    // gets its own control...
    await wrapper.find('select.ks-station-select').setValue('all')
    await flushPromises()
    const lines = wrapper.findAll('.ko-line-tap')
    expect(lines).toHaveLength(2)
    expect(lines[0].text()).toContain('Espresso')
    expect(lines[1].text()).toContain('Firfir')

    // ...and on a station board only that station's lines render at all.
    await wrapper.find('select.ks-station-select').setValue('hot')
    await flushPromises()
    const hotLines = wrapper.findAll('.ko-line-tap')
    expect(hotLines).toHaveLength(1)
    expect(hotLines[0].text()).toContain('Firfir')

    await wrapper.find('select.ks-station-select').setValue('bar')
    await flushPromises()
    const barLines = wrapper.findAll('.ko-line-tap')
    expect(barLines).toHaveLength(1)
    expect(barLines[0].text()).toContain('Espresso')
  })

  it('routes a mixed ticket: each board shows only its own lines', async () => {
    // The routing complaint this pins: a salad, a soda and a juice on one
    // ticket used to land on both boards (dimmed, but looking like work).
    // Strict routing means the drink never renders on the hot view and the
    // food never renders on the bar view.
    mockFeeds([{ ...trackedOrder, status: 'new' }], makeTrackedItems())
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    // Default hot view: the food is work, the drink is invisible.
    expect(wrapper.text()).toContain('Firfir')
    expect(wrapper.text()).not.toContain('Espresso')

    await wrapper.find('select.ks-station-select').setValue('bar')
    await flushPromises()
    expect(wrapper.text()).toContain('Espresso')
    expect(wrapper.text()).not.toContain('Firfir')
  })

  it('advances a single line without touching the rest of the ticket', async () => {
    mockFeeds([trackedOrder], makeTrackedItems())
    mockApiPut.mockResolvedValue({ ok: true, status: 'preparing', orderStatus: 'preparing' })

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    // Both lines visible on All Stations, so line[0] is the Espresso.
    await wrapper.find('select.ks-station-select').setValue('all')
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

    // Espresso is a drink: visible on the bar view, hidden on hot.
    await wrapper.find('select.ks-station-select').setValue('bar')
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

    // Whole-ticket progress is an All Stations read.
    await wrapper.find('select.ks-station-select').setValue('all')
    await flushPromises()
    expect(wrapper.text()).toContain('1 of 2 ready')
  })

  // ─── Station filter ───
  // A mixed ticket (one drink, one food) still appears on BOTH boards — the
  // ticket header is shared context — but each board renders only its own
  // lines. Hot Pass Only narrows to what is sitting ready for pickup.
  it('keeps a mixed ticket on both the hot and the bar board', async () => {
    // Fresh object: earlier tests mutate shared fixtures optimistically, and a
    // ticket that has quietly become 'preparing' would pass these assertions
    // from the wrong column.
    mockFeeds([{ ...trackedOrder, status: 'new' }], makeTrackedItems())
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    await wrapper.find('select.ks-station-select').setValue('hot')
    await flushPromises()
    expect(wrapper.text()).toContain('O-1')

    await wrapper.find('select.ks-station-select').setValue('bar')
    await flushPromises()
    expect(wrapper.text()).toContain('O-1')
  })

  it('hides a ticket with no lines for the selected station', async () => {
    const foodOnly = [
      { id: 'OI-1', order_id: 'O-1', line_no: 0, name: 'Firfir', category: 'ETHIOPIAN DISH', qty: 2, status: 'new', modifiers: null }
    ]
    mockFeeds([{ ...trackedOrder, status: 'new' }], foodOnly)
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    await wrapper.find('select.ks-station-select').setValue('bar')
    await flushPromises()
    expect(wrapper.text()).toContain('No new orders')

    await wrapper.find('select.ks-station-select').setValue('hot')
    await flushPromises()
    expect(wrapper.text()).toContain('Firfir')
  })

  it('narrows Hot Pass Only to tickets that are ready', async () => {
    mockFeeds(
      [
        { ...trackedOrder, status: 'new' },
        { id: 'O-2', items: 'Firfir', status: 'ready', type: 'dine-in', created: new Date().toISOString() }
      ],
      makeTrackedItems()
    )
    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    await wrapper.find('select.ks-station-select').setValue('pass')
    await flushPromises()

    expect(wrapper.text()).toContain('O-2')
    expect(wrapper.text()).toContain('No new orders')
    expect(wrapper.text()).toContain('Nothing in progress')
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
      { id: 'O-1', items: '2xEspresso, 1xLatte, Macchiato', status: 'new', type: 'dine-in', created: new Date().toISOString() },
      { id: 'O-2', items: '1xFut breakfast Gebeta, 1xChechebesa', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    // Station routing applies from the FIRST tick, even before the item rows
    // arrive: the board classifies the ticket from its own item summary. A
    // drinks-only ticket is the bar's work and must not flash here (this was
    // the "tea appears on the chef board then vanishes" bug), while the food
    // ticket renders through the same fallback path.
    expect(wrapper.text()).not.toContain('Espresso')
    expect(wrapper.text()).not.toContain('Latte')
    expect(wrapper.text()).toContain('Fut breakfast Gebeta')
    expect(wrapper.text()).toContain('Chechebesa')
  })

  it('shows the whole fallback list when the ticket cannot be classified', async () => {
    // Legacy free text with no "<qty>x" markers at all: the board cannot tell
    // whose ticket it is, so it fails open rather than hiding somebody's work.
    mockApiGet.mockResolvedValue([
      { id: 'O-1', items: 'the usual for the morning crew', status: 'new', type: 'dine-in', created: new Date().toISOString() }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('the usual for the morning crew')
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

  // The API returns `updated_at` (and stamps `ready_at` the first time an
  // order becomes ready). The board used to read `updated`, a field that has
  // never existed on a row, so every ready ticket showed "Waiting —m" and the
  // 5-minute pick-up warning could never fire.
  it('shows how long a ready order has been waiting, from updated_at', async () => {
    mockApiGet.mockResolvedValue([
      {
        id: 'O-1', items: 'Espresso', status: 'ready', type: 'dine-in',
        created: new Date(Date.now() - 20 * 60000).toISOString(),
        updated_at: new Date(Date.now() - 8 * 60000).toISOString()
      }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Waiting 8m')
    expect(wrapper.text()).not.toContain('Waiting —m')
  })

  it('flags a ready order that passed the 5-minute pick-up window', async () => {
    mockApiGet.mockResolvedValue([
      {
        id: 'O-2', items: 'Latte', status: 'ready', type: 'dine-in',
        created: new Date(Date.now() - 15 * 60000).toISOString(),
        ready_at: new Date(Date.now() - 6 * 60000).toISOString()
      }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Pick up!')
  })

  it('measures waiting from ready_at when the order carries one', async () => {
    // updated_at was touched 2 minutes ago, but the order has been ready for
    // 10 — the pass cares about when the food came up, not the last write.
    mockApiGet.mockResolvedValue([
      {
        id: 'O-3', items: 'Macchiato', status: 'ready', type: 'dine-in',
        created: new Date(Date.now() - 25 * 60000).toISOString(),
        ready_at: new Date(Date.now() - 10 * 60000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 60000).toISOString()
      }
    ])

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Waiting 10m')
  })

  it('measures a re-opened ticket from its newest line, not the first round', async () => {
    // The order went ready 14 minutes ago, was served, then a round was added
    // and the new dish came up a minute ago. Stamps are write-once, so the
    // order-level ready_at still says 14 minutes — but the pass shows the
    // coffee that is actually sitting there.
    mockFeeds(
      [
        {
          id: 'O-4', items: 'Espresso, Macchiato', status: 'ready', type: 'dine-in',
          created: new Date(Date.now() - 30 * 60000).toISOString(),
          ready_at: new Date(Date.now() - 14 * 60000).toISOString(),
          updated_at: new Date(Date.now() - 1 * 60000).toISOString()
        }
      ],
      [
        {
          id: 'OI-1', order_id: 'O-4', line_no: 0, name: 'Espresso', qty: 1,
          status: 'served', modifiers: null,
          ready_at: new Date(Date.now() - 14 * 60000).toISOString()
        },
        {
          id: 'OI-2', order_id: 'O-4', line_no: 1, name: 'Macchiato', qty: 1,
          status: 'ready', modifiers: null,
          ready_at: new Date(Date.now() - 1 * 60000).toISOString()
        }
      ]
    )

    const wrapper = mount(KitchenView, globalConfig)
    await flushPromises()

    // Both lines are drinks (Espresso, Macchiato): visible on All Stations.
    await wrapper.find('select.ks-station-select').setValue('all')
    await flushPromises()
    expect(wrapper.text()).toContain('Waiting 1m')
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
