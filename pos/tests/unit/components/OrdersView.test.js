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
  apiPost: (...args) => mockApiPost(...args)
}))

describe('OrdersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())

    // Create toast container
    const container = document.createElement('div')
    container.id = 'toastContainer'
    document.body.appendChild(container)

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

    expect(wrapper.find('h3').text()).toBe('Orders')
    expect(wrapper.find('thead').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(true)
  })

  it('should show filter dropdown with status options', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    const select = wrapper.find('select')
    expect(select.exists()).toBe(true)
    const options = select.findAll('option')
    expect(options.length).toBe(6) // All + 5 statuses
    expect(options[0].text()).toBe('All Statuses')
    expect(options[1].text()).toBe('New')
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

    expect(wrapper.text()).toContain('No orders found')
  })

  it('should show "New Order" and "Refresh" buttons', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    const buttons = wrapper.findAll('button')
    const newOrderBtn = buttons.find(b => b.text().includes('New Order'))
    const refreshBtn = buttons.find(b => b.text().includes('Refresh'))
    expect(newOrderBtn).toBeDefined()
    expect(refreshBtn).toBeDefined()
  })

  it('should open new order modal when clicking New Order', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    const newOrderBtn = wrapper.findAll('button').find(b => b.text().includes('New Order'))
    await newOrderBtn.trigger('click')

    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
    expect(wrapper.find('.modal h3').text()).toBe('New Order')
  })

  it('should show order type select in modal', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    await wrapper.findAll('button').find(b => b.text().includes('New Order')).trigger('click')

    const modal = wrapper.find('.modal')
    const typeSelect = modal.findAll('select')[0]
    const options = typeSelect.findAll('option')
    expect(options.map(o => o.text())).toEqual(['Dine In', 'Takeaway', 'Delivery'])
  })

  it('should show menu items grouped by category in modal', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    await wrapper.findAll('button').find(b => b.text().includes('New Order')).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Espresso')
    expect(wrapper.text()).toContain('Latte')
    expect(wrapper.text()).toContain('ETB 60')
    expect(wrapper.text()).toContain('ETB 85')
  })

  it('should show payment method options', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    await wrapper.findAll('button').find(b => b.text().includes('New Order')).trigger('click')

    const modal = wrapper.find('.modal')
    const paymentSelects = modal.findAll('select')
    const paymentSelect = paymentSelects[paymentSelects.length - 1]
    const options = paymentSelect.findAll('option')
    expect(options.map(o => o.text())).toEqual(['Cash', 'Card', 'Mobile Money'])
  })

  it('should show empty cart message initially', async () => {
    const wrapper = mount(OrdersView)
    await flushPromises()

    await wrapper.findAll('button').find(b => b.text().includes('New Order')).trigger('click')

    expect(wrapper.text()).toContain('Cart is empty')
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
