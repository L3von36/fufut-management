import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OrdersHistoryView from '../../../src/views/OrdersHistoryView.vue'

// Mock API — OrdersView.test.js's shape. TODAY/isTodayStamp mirror the real
// local-today helpers because the suites fabricate stamps with new Date().
const mockApiGet = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...args) => mockApiGet(...args),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
  ROLE_PERMISSIONS: { manager: ['orders-history'] },
  ROLE_DEFAULT_VIEW: { manager: 'dashboard' },
  NAV_ITEMS: [],
  TODAY: () => {
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  },
  isTodayStamp: (s) => {
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0')
    return String(s || '').slice(0, 10) === `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
}))

describe('OrdersHistoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue([])
  })

  const localToday = () => {
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

  it('renders the history page with its range bar', async () => {
    const wrapper = mount(OrdersHistoryView)
    await flushPromises()
    expect(wrapper.find('.ov-toolbar-title').text()).toBe('Order History')
    const chips = wrapper.findAll('.oh-chip').map(c => c.text())
    expect(chips).toEqual(['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'])
  })

  it('defaults to the yesterday window and pages with limit/offset', async () => {
    mockApiGet.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({
        id: 'O' + i, total: 10, status: 'fulfilled', created: `${daysAgo(1)} 12:00:00`,
      }))
    )
    const wrapper = mount(OrdersHistoryView)
    await flushPromises()

    const first = mockApiGet.mock.calls[0][0]
    expect(first).toBe(`orders?from=${daysAgo(1)}&to=${daysAgo(1)}&limit=100&offset=0`)
    expect(wrapper.text()).toContain('100 loaded')
    // 100 rows back = probably more, so the pager offers Load more.
    expect(wrapper.find('.oh-pagination button').exists()).toBe(true)

    await wrapper.find('.oh-pagination button').trigger('click')
    await flushPromises()
    const second = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0]
    expect(second).toBe(`orders?from=${daysAgo(1)}&to=${daysAgo(1)}&limit=100&offset=100`)
  })

  it('switches windows when a preset chip is pressed', async () => {
    const wrapper = mount(OrdersHistoryView)
    await flushPromises()
    await wrapper.findAll('.oh-chip').find(c => c.text() === 'Today').trigger('click')
    await flushPromises()
    const last = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0]
    expect(last).toBe(`orders?from=${localToday()}&to=${localToday()}&limit=100&offset=0`)
  })

  it('sums page money over real orders only (voided and cancelled excluded)', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'O-1', total: 140, status: 'fulfilled', created: `${daysAgo(1)} 15:54:00` },
      { id: 'O-2', total: 5000, status: 'cancelled', voided_at: `${daysAgo(1)} 10:00:00`, created: `${daysAgo(1)} 09:00:00` },
      { id: 'O-3', total: 60, status: 'new', created: `${daysAgo(1)} 08:00:00` },
    ])
    const wrapper = mount(OrdersHistoryView)
    await flushPromises()
    expect(wrapper.text()).toContain('ETB 200')
    expect(wrapper.text()).not.toContain('ETB 5200')
  })

  it('searches by id, items, customer and table', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'Oaaa', items: '1xLatte', total: 90, status: 'fulfilled', customer: 'Abebe', table_number: '3', created: `${daysAgo(1)} 10:00:00` },
      { id: 'Obbb', items: '1xTea', total: 40, status: 'served', customer: 'Sara', table_number: '5', created: `${daysAgo(1)} 11:00:00` },
    ])
    const wrapper = mount(OrdersHistoryView)
    await flushPromises()
    await wrapper.find('.ov-search-input').setValue('sara')
    await flushPromises()
    expect(wrapper.text()).toContain('Obbb')
    expect(wrapper.text()).not.toContain('Oaaa')
  })

  it('shows the empty state with guidance when the window has no orders', async () => {
    const wrapper = mount(OrdersHistoryView)
    await flushPromises()
    expect(wrapper.text()).toContain('No orders in this window')
    expect(wrapper.text()).toContain('history keeps every ticket')
  })
})
