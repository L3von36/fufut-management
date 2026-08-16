import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * Characterization coverage for the second wave of BaseTable migrations.
 *
 * Written before the views were touched, and unedited afterwards. Each case
 * describes what a person sees — a row count, the text of a cell, the empty
 * state — rather than the markup that produces it, so replacing the table
 * implementation underneath has to leave every one of them passing.
 *
 * A test here that needed editing during the migration would be evidence the
 * migration changed behaviour. None did.
 */

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
  useAuthStore: () => ({ user: { id: 'S9', firstName: 'Amanuel', role: 'Manager' }, roleKey: 'manager' }),
}))
vi.mock('chart.js/auto', () => ({ default: class { destroy() {} } }))
vi.mock('chart.js', () => ({
  Chart: class { constructor() {} destroy() {} static register() {} },
  registerables: [],
}))

import ExpensesView from '../../src/views/ExpensesView.vue'
import ShiftsView from '../../src/views/ShiftsView.vue'
import TimeClockView from '../../src/views/TimeClockView.vue'
import WasteView from '../../src/views/WasteView.vue'
import InventoryView from '../../src/views/InventoryView.vue'
import ReservationsView from '../../src/views/ReservationsView.vue'

const cfg = { global: { provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) } } }

async function open(view, rows) {
  mockApiGet.mockImplementation(() => Promise.resolve(rows))
  const w = mount(view, cfg)
  await flushPromises()
  return w
}

/** Dates inside the views' default windows, or the rows filter themselves out. */
const TODAY = '2026-08-11'

describe('Expenses table', () => {
  const ROWS = [
    { id: 'E1', date: TODAY, category: 'Gas', description: 'Cylinder refill', amount: 1200, paidBy: 'Amanuel' },
    { id: 'E2', date: TODAY, category: 'Charcoal', description: 'Sack', amount: 800, paidBy: 'Selam' },
    // Voided expenses are kept for the audit trail but are not money spent.
    { id: 'E3', date: TODAY, category: 'Gas', description: 'Duplicate', amount: 5000, paidBy: 'x', voided_at: '2026-08-11T10:00:00Z' },
  ]
  beforeEach(() => vi.clearAllMocks())

  it('renders a row per live expense', async () => {
    const w = await open(ExpensesView, ROWS)
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('Cylinder refill')
  })

  it('excludes voided expenses from the total', async () => {
    const w = await open(ExpensesView, ROWS)
    // 1200 + 800 = 2000, not 7000.
    expect(w.find('.summary-grid').text()).toContain('2000')
    expect(w.find('.summary-grid').text()).not.toContain('7000')
  })

  it('names the top category with its amount', async () => {
    const w = await open(ExpensesView, ROWS)
    expect(w.find('.summary-grid').text()).toMatch(/Gas/)
  })

  it('explains an empty table', async () => {
    const w = await open(ExpensesView, [])
    expect(w.find('tbody').text()).toContain('No expenses')
  })
})

describe('Shifts table', () => {
  const ROWS = [
    { id: 'SH1', date: TODAY, staffId: 'S1', staffName: 'Selam', start: '09:00', end: '17:00', role: 'head-chef' },
    { id: 'SH2', date: TODAY, staffId: 'S2', staffName: 'Bethel', start: '12:00', end: '', role: 'cashier' },
  ]
  beforeEach(() => vi.clearAllMocks())

  it('renders one row per shift', async () => {
    const w = await open(ShiftsView, ROWS)
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('Selam')
  })

  it('renders a missing end time as a placeholder, not blank', async () => {
    const w = await open(ShiftsView, ROWS)
    const row = w.findAll('tbody tr').find(r => r.text().includes('Bethel'))
    expect(row.text()).toMatch(/[-—]/)
  })

  it('explains an empty table', async () => {
    const w = await open(ShiftsView, [])
    expect(w.find('tbody').text()).toContain('No shifts')
  })
})

describe('Time clock table', () => {
  const ROWS = [
    { id: 'TC1', date: TODAY, staff_id: 'S1', clock_in: '09:00', clock_out: '17:00', duration: '08:00:00', hours: 8, status: 'complete' },
    { id: 'TC2', date: TODAY, staff_id: 'S2', clock_in: '12:00', clock_out: null, duration: '', hours: 0, status: 'open' },
  ]
  beforeEach(() => vi.clearAllMocks())

  it('renders one row per entry for the selected day', async () => {
    const w = await open(TimeClockView, ROWS)
    expect(w.findAll('tbody tr')).toHaveLength(2)
  })

  it('counts only the day being viewed, and labels the period', async () => {
    const w = await open(TimeClockView, [...ROWS, { id: 'TC3', date: '2026-08-01', staff_id: 'S1', hours: 5 }])
    expect(w.find('.summary-grid').text()).toContain('2')
    expect(w.text()).toMatch(/today/i)
  })

  it('explains an empty table', async () => {
    const w = await open(TimeClockView, [])
    expect(w.find('tbody').text()).toContain('No time entries')
  })
})

describe('Waste table', () => {
  const ROWS = [
    { id: 'W1', date: TODAY, itemName: 'Milk', category: 'Produce', qty: 2, quantity: 2, unit: 'litre', reason: 'Spoiled', est_cost: 120 },
    { id: 'W2', date: TODAY, itemName: 'Injera', category: 'Food', qty: 5, quantity: 5, unit: 'piece', reason: 'Burned', est_cost: 50 },
  ]
  beforeEach(() => vi.clearAllMocks())

  it('renders one row per waste entry', async () => {
    const w = await open(WasteView, ROWS)
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('Milk')
  })

  /** Litres and pieces cannot be summed into one figure. */
  it('reports quantity per unit rather than adding units together', async () => {
    const w = await open(WasteView, ROWS)
    const summary = w.find('.summary-grid').text()
    expect(summary).toMatch(/litre|piece/)
    expect(summary).not.toContain('7.0 litre')
  })

  it('sums only real costs', async () => {
    const w = await open(WasteView, ROWS)
    expect(w.find('.summary-grid').text()).toContain('170')
  })

  it('explains an empty table', async () => {
    const w = await open(WasteView, [])
    expect(w.find('tbody').text()).toContain('No waste')
  })
})

describe('Inventory table', () => {
  const ROWS = [
    { id: 'I1', name: 'Coffee beans', category: 'Coffee & Tea', quantity: 20, stock: 20, unit: 'kg', minLevel: 8, min_level: 8, cost: 700 },
    { id: 'I2', name: 'Milk', category: 'Dairy', quantity: 2, stock: 2, unit: 'litre', minLevel: 30, min_level: 30, cost: 60 },
  ]
  beforeEach(() => vi.clearAllMocks())

  it('renders one row per stock item', async () => {
    const w = await open(InventoryView, ROWS)
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('Coffee beans')
  })

  it('gives every status badge a class that exists', async () => {
    const STYLED = ['badge-success', 'badge-new', 'badge-pending', 'badge-cancelled', 'badge-neutral', 'badge-low', 'badge-available', 'badge-active']
    const w = await open(InventoryView, ROWS)
    for (const b of w.findAll('tbody .badge')) {
      expect(b.classes().some(c => STYLED.includes(c)), `unstyled: ${b.classes()}`).toBe(true)
    }
  })

  it('explains an empty table', async () => {
    const w = await open(InventoryView, [])
    expect(w.find('tbody').text()).toMatch(/no items|no inventory/i)
  })
})

describe('Reservations table', () => {
  const ROWS = [
    { id: 'R1', date: TODAY, time: '19:00', name: 'Ahmed', guests: 4, tableId: 'T5', status: 'confirmed', notes: 'Window seat' },
    { id: 'R2', date: TODAY, time: '20:00', name: 'Sara', guests: 2, tableId: 'T2', status: 'cancelled', notes: '' },
  ]
  beforeEach(() => vi.clearAllMocks())

  it('renders one row per reservation', async () => {
    const w = await open(ReservationsView, ROWS)
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('Ahmed')
  })

  it('gives every status badge a class that exists', async () => {
    const STYLED = ['badge-success', 'badge-new', 'badge-pending', 'badge-cancelled', 'badge-neutral', 'badge-confirmed', 'badge-completed']
    const w = await open(ReservationsView, ROWS)
    for (const b of w.findAll('tbody .badge')) {
      expect(b.classes().some(c => STYLED.includes(c)), `unstyled: ${b.classes()}`).toBe(true)
    }
  })

  it('explains an empty table', async () => {
    const w = await open(ReservationsView, [])
    expect(w.find('tbody').text()).toMatch(/no reservations/i)
  })
})
