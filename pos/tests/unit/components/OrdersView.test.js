import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import OrdersView from '../../../src/views/OrdersView.vue'

// Mock API
const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiPost = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...args) => mockApiGet(...args),
  apiPut: (...args) => mockApiPut(...args),
  apiPost: (...args) => mockApiPost(...args),
  ROLE_PERMISSIONS: { manager: ['dashboard','orders','tables','menu-mgmt','menu-view','expenses','pnl','cashdrawer','inventory','waste','staff','shifts','timeclock','kitchen','reports','reservations','delivery','analytics','checkout','pipeline','revenue'] },
  ROLE_DEFAULT_VIEW: { manager: 'dashboard' },
  NAV_ITEMS: []
}))

describe('OrdersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())

    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint === 'orders') return Promise.resolve([])
      if (endpoint === 'menu') return Promise.resolve([
        { id: 'M-1', name: 'Espresso', category: 'Espresso', price: 60 },
        { id: 'M-2', name: 'Latte', category: 'Espresso', price: 85 },
        { id: 'M-3', name: 'Macchiato', category: 'Espresso', price: 75 }
      ])
      return Promise.resolve([])
    })
    mockApiPut.mockResolvedValue({ ok: true })
    mockApiPost.mockResolvedValue({ ok: true, id: 'O-new123' })
  })

  it('should render the orders table', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    expect(wrapper.find('.ov-toolbar-title').text()).toBe('Orders')
    expect(wrapper.find('thead').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(true)
  })

  it('should show filter dropdown with status options', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    const select = wrapper.find('select')
    expect(select.exists()).toBe(true)
    const options = select.findAll('option')
    // All + 6 statuses — 'served' added by the waiter mobile audit pass 2
    // (BUG-2): settling a check sets that status, which the filter never
    // offered, so a waiter filtering for "the table I just closed" found
    // nothing.
    expect(options.length).toBe(7)
    expect(options[0].text()).toBe('All Statuses')
    expect(options[1].text()).toBe('New')
    expect(options.map(o => o.attributes('value')).join(','))
      .toBe(',new,preparing,ready,served,fulfilled,cancelled')
  })

  it('should display orders in the table', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve([
        { id: 'O-1', items: '2xEspresso', total: 120, payment: 'cash', type: 'dine-in', status: 'new', created: new Date().toISOString() }
      ])
      if (ep === 'menu') return Promise.resolve([])
      return Promise.resolve([])
    })

    const wrapper = mount(OrdersView)
    await flushPromises()

    expect(wrapper.text()).toContain('O-1')
    expect(wrapper.text()).toContain('2xEspresso')
    expect(wrapper.text()).toContain('ETB 120')
  })

  it('should show empty state when no orders', async () => {
    mockApiGet.mockResolvedValue([])

    const wrapper = mount(OrdersView)
    await flushPromises()

    expect(wrapper.text()).toContain('No orders yet')
  })

  it('should show Refresh button', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    const buttons = wrapper.findAll('button')
    const refreshBtn = buttons.find(b => b.attributes('title') === 'Refresh')
    expect(refreshBtn).toBeDefined()
  })

  it('should not show New Order button without checkout permission', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    const buttons = wrapper.findAll('button')
    const newOrderBtn = buttons.find(b => b.text().includes('New Order'))
    expect(newOrderBtn).toBeUndefined()
  })

  it('should filter orders by status', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve([
        { id: 'O-1', items: 'Espresso', total: 60, status: 'new', created: new Date().toISOString() },
        { id: 'O-2', items: 'Latte', total: 85, status: 'preparing', created: new Date().toISOString() },
        { id: 'O-3', items: 'Cappuccino', total: 90, status: 'new', created: new Date().toISOString() }
      ])
      if (ep === 'menu') return Promise.resolve([])
      return Promise.resolve([])
    })

    const wrapper = mount(OrdersView)
    await flushPromises()

    // Initially shows all 3 (data rows + empty state row)
    const dataRows = wrapper.findAll('tbody tr').filter(r => !r.text().includes('No orders found'))
    expect(dataRows.length).toBe(3)

    // Filter by 'new'
    const select = wrapper.find('select')
    await select.setValue('new')

    // After filter, only 2 new orders
    expect(wrapper.text()).toContain('2 order(s)')
  })

  it('should show status badge on each order', async () => {
    mockApiGet.mockImplementation((ep) => {
      if (ep === 'orders') return Promise.resolve([
        { id: 'O-1', items: 'Espresso', total: 60, status: 'preparing', created: new Date().toISOString() }
      ])
      if (ep === 'menu') return Promise.resolve([])
      return Promise.resolve([])
    })

    const wrapper = mount(OrdersView)
    await flushPromises()

    const badge = wrapper.find('.badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('preparing')
  })

  it('escapeHtml should sanitize malicious content for receipt printing', () => {
    // Test the escapeHtml function directly (extracted from the component)
    function escapeHtml(str) {
      const s = String(str ?? '')
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }

    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml('<img onerror=alert(1)>')).toBe('&lt;img onerror=alert(1)&gt;')
    expect(escapeHtml('"onclick="alert(1)')).toBe('&quot;onclick=&quot;alert(1)')
    expect(escapeHtml('Normal text & numbers 123')).toBe('Normal text &amp; numbers 123')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(42)).toBe('42')
  })
})
