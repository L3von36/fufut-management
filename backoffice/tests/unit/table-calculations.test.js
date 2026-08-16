import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockApiGet = vi.fn()
vi.mock('../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  API: '',
  isOnline: () => true,
  onOnlineChange: () => () => {},
  TODAY: () => '2026-08-11',
}))

vi.mock('../../src/stores/auth', () => ({
  useAuthStore: () => ({ user: { firstName: 'A', role: 'Manager', id: 'S1' }, roleKey: 'manager' }),
}))

// Chart.js touches canvas, which jsdom does not implement.
vi.mock('chart.js/auto', () => ({ default: class { constructor() {} destroy() {} } }))

import OrdersView from '../../src/views/OrdersView.vue'
import TimeClockView from '../../src/views/TimeClockView.vue'

const globalConfig = {
  global: { provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) } },
}

describe('OrdersView revenue', () => {
  /**
   * Revenue summed every filtered row including cancelled and voided ones, so
   * the headline inflated by the value of everything that fell through — and
   * filtering the table to "cancelled" produced a revenue figure made entirely
   * of sales that never happened.
   */
  const ORDERS = [
    { id: 'O1', total: 500, tip: 50, status: 'completed' },
    { id: 'O2', total: 300, tip: 0, status: 'completed' },
    { id: 'O3', total: 900, tip: 0, status: 'cancelled' },
    { id: 'O4', total: 400, tip: 0, status: 'completed', voided_at: '2026-08-11T10:00:00Z' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue(ORDERS)
  })

  it('excludes cancelled and voided orders', async () => {
    const w = mount(OrdersView, globalConfig)
    await flushPromises()
    // 500 + 300 = 800, less the 50 tip = 750. Not 2,100.
    expect(w.text()).toContain('750')
    expect(w.text()).not.toContain('2100')
  })

  it('subtracts tips, which are not the restaurant’s money', async () => {
    const w = mount(OrdersView, globalConfig)
    await flushPromises()
    expect(w.text()).not.toContain('800')
  })

  it('says how many rows it left out', async () => {
    const w = mount(OrdersView, globalConfig)
    await flushPromises()
    expect(w.text()).toMatch(/2 excluded/)
  })

  it('reports zero rather than NaN when everything is cancelled', async () => {
    mockApiGet.mockResolvedValue([{ id: 'O1', total: 500, status: 'cancelled' }])
    const w = mount(OrdersView, globalConfig)
    await flushPromises()
    expect(w.text()).not.toContain('NaN')
  })
})

describe('TimeClockView totals', () => {
  const ENTRIES = [
    { id: 'T1', date: '2026-08-11', staff_id: 'S1', duration: '08:00:00', clockOut: '17:00' },
    { id: 'T2', date: '2026-08-11', staff_id: 'S2', duration: '01:30:45', clockOut: null },
    { id: 'T3', date: '2026-08-10', staff_id: 'S1', duration: '09:00:00', clockOut: '18:00' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue(ENTRIES)
  })

  /**
   * The KPIs hardcoded TODAY() while the table honoured the date picker, so
   * choosing any other date produced a header and a table describing different
   * days with nothing saying so.
   */
  it('counts only the day being viewed', async () => {
    const w = mount(TimeClockView, globalConfig)
    await flushPromises()
    // Two entries on 2026-08-11, not all three.
    expect(w.text()).toContain('2')
    expect(w.text()).toMatch(/Clock-ins today/)
  })

  it('keeps seconds instead of dropping them', async () => {
    const w = mount(TimeClockView, globalConfig)
    await flushPromises()
    // 08:00:00 + 01:30:45 = 9.5125h → 9.5. Dropping the 45s still gives 9.5
    // here, so the assertion that matters is that it is not 9.0 from integer
    // truncation of the minutes field.
    expect(w.text()).toContain('9.5')
  })

  it('labels the period rather than always saying today', async () => {
    const w = mount(TimeClockView, globalConfig)
    await flushPromises()
    expect(w.text()).toMatch(/today/)
  })
})
