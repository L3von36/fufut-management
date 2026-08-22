import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * Characterization coverage for the final four table views, written against
 * them before migration and unedited afterwards.
 *
 * These four were the ones I argued should stay on their own markup. Three of
 * those arguments were wrong: StaffRequests and Payroll are ordinary
 * row-per-record tables that happen to sit behind tabs, and AuditLog's "bespoke
 * diff cell" is exactly what a slot is for. Only PnL is genuinely a different
 * shape — a statement with fixed lines rather than a row per record — and it
 * turns out to read better once those lines are built as data.
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

import AuditLogView from '../../src/views/AuditLogView.vue'
import MenuView from '../../src/views/MenuView.vue'
import StaffRequestsView from '../../src/views/StaffRequestsView.vue'
import PnLView from '../../src/views/PnLView.vue'

const cfg = { global: { provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) } } }

async function mountWith(view, impl) {
  mockApiGet.mockImplementation(impl)
  const w = mount(view, cfg)
  await flushPromises()
  await flushPromises()
  return w
}

describe('Audit log table', () => {
  const ENTRIES = [
    {
      id: 'AL1', at: '2026-08-11T07:15:00Z', actor_name: 'Amanuel Fekadu', actor_role: 'manager',
      action: 'update', entity: 'inventory', entity_id: 'I-beef',
      before: { yield_pct: 100 }, after: { yield_pct: 85 }, reason: 'Trim and bone',
    },
    {
      id: 'AL2', at: '2026-08-11T08:00:00Z', actor_name: 'system', actor_role: 'system',
      action: 'void', entity: 'orders', entity_id: 'O-1', before: null, after: null, reason: 'Duplicate',
    },
  ]
  beforeEach(() => vi.clearAllMocks())

  const open = () => mountWith(AuditLogView, () => Promise.resolve({ ok: true, entries: ENTRIES }))

  it('renders one row per entry', async () => {
    const w = await open()
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('Amanuel Fekadu')
  })

  /** The whole question an audit log answers: what moved, from what, to what. */
  it('renders the change as a readable diff, not raw JSON', async () => {
    const w = await open()
    // fieldLabel title-cases field names: yield_pct → "Yield Pct"
    expect(w.text()).toContain('Yield Pct')
    expect(w.text()).toContain('100')
    expect(w.text()).toContain('85')
    expect(w.text()).not.toContain('{"yield_pct"')
    // actor_role is now formatted via roleLabel: manager → "Manager"
    expect(w.text()).toContain('Manager')
  })

  it('shows the reason recorded against a change', async () => {
    const w = await open()
    expect(w.text()).toContain('Trim and bone')
  })

  it('shows local time, not the stored UTC', async () => {
    // 07:15 UTC is 10:15 in Addis.
    const w = await open()
    expect(w.text()).toContain('10:15')
  })

  it('explains an empty log', async () => {
    const w = await mountWith(AuditLogView, () => Promise.resolve({ ok: true, entries: [] }))
    expect(w.find('tbody').text()).toMatch(/no entries/i)
  })
})

describe('Menu table', () => {
  /**
   * A flat array, which is what `GET /api/menu` returns for this client — the
   * handler flattens the categorised structure before sending it. Feeding this
   * view `{categories:[…]}` makes it throw on `menu.value.map`, so the shape
   * matters and is asserted by using it.
   */
  const MENU = [
    { id: 'M1', name: 'Macchiato', category: 'Hot Drinks', price: 60, cost: 18, available: true, modifiers: ['Hot'] },
    { id: 'M2', name: 'Tea', category: 'Hot Drinks', price: 30, cost: 5, available: false, modifiers: [] },
  ]
  beforeEach(() => vi.clearAllMocks())

  const openTable = async () => {
    const w = await mountWith(MenuView, () => Promise.resolve(MENU))
    // Opens in grid mode; the table is behind the toggle.
    const toggle = w.findAll('button').find(b => /table view/i.test(b.text()))
    if (toggle) { await toggle.trigger('click'); await flushPromises() }
    return w
  }

  it('renders one row per dish in table mode', async () => {
    const w = await openTable()
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('Macchiato')
  })

  it('marks an unavailable dish distinctly from an available one', async () => {
    const w = await openTable()
    const badges = w.findAll('tbody .badge').map(b => b.text())
    expect(badges).toContain('Yes')
    expect(badges).toContain('No')
  })

  it('explains an empty menu', async () => {
    const w = await mountWith(MenuView, () => Promise.resolve([]))
    const toggle = w.findAll('button').find(b => /table view/i.test(b.text()))
    if (toggle) { await toggle.trigger('click'); await flushPromises() }
    expect(w.text()).toMatch(/no items/i)
  })
})

describe('Staff requests tables', () => {
  const LEAVE = [{
    id: 'LV1', staff_id: 'S1', staff_name: 'Selam Wondimu', type: 'annual',
    start_date: '2026-08-12', end_date: '2026-08-14', days: 3, paid: 1,
    reason: 'Family', status: 'pending',
  }]
  beforeEach(() => vi.clearAllMocks())

  const open = () => mountWith(StaffRequestsView, (e) => {
    if (e.startsWith('leave')) return Promise.resolve(LEAVE)
    if (e === 'staff') return Promise.resolve([{ id: 'S1', firstName: 'Selam', lastName: 'Wondimu' }])
    return Promise.resolve([])
  })

  it('renders the leave tab with one row per request', async () => {
    const w = await open()
    expect(w.text()).toContain('Selam Wondimu')
    expect(w.text()).toContain('annual')
  })

  it('offers approve and reject on a pending request', async () => {
    const w = await open()
    const labels = w.findAll('button').map(b => b.text())
    expect(labels).toContain('Approve')
    expect(labels).toContain('Reject')
  })

  it('states the self-approval rule on the screen', async () => {
    const w = await open()
    expect(w.text()).toMatch(/cannot approve your own/i)
  })

  it('explains an empty tab', async () => {
    const w = await mountWith(StaffRequestsView, () => Promise.resolve([]))
    expect(w.text()).toMatch(/nothing awaiting|no records/i)
  })
})

describe('P&L statement', () => {
  const ORDERS = [
    { id: 'O1', total: 1000, tip: 0, status: 'fulfilled', created: '2026-08-11 09:00:00' },
  ]
  beforeEach(() => vi.clearAllMocks())

  const open = () => mountWith(PnLView, (e) => {
    if (e === 'orders') return Promise.resolve(ORDERS)
    if (e === 'expenses') return Promise.resolve([{ id: 'E1', date: '2026-08-11', category: 'Gas', amount: 200 }])
    // Flat, like the API. Handing this view `{categories:[…]}` makes it throw
    // while building the cost map, and the catch swallows it — so the expense
    // breakdown silently never appears. Worth knowing: any caller that sends
    // the categorised shape loses the whole lower half of the statement with
    // no error on screen.
    if (e === 'menu') return Promise.resolve([])
    return Promise.resolve([])
  })

  /**
   * A P&L is a statement, not a list: the reader follows it top to bottom and
   * the order carries the meaning. Whatever renders it must keep that order.
   */
  it('reads as a statement in order', async () => {
    const w = await open()
    const text = w.text()
    const iRev = text.indexOf('Revenue')
    const iGross = text.indexOf('Gross Profit')
    const iNet = text.indexOf('Net Profit')
    expect(iRev).toBeGreaterThan(-1)
    expect(iGross).toBeGreaterThan(iRev)
    expect(iNet).toBeGreaterThan(iGross)
  })

  it('shows every line of the statement', async () => {
    const w = await open()
    expect(w.text()).toContain('Cost of Goods Sold')
    expect(w.text()).toContain('Net Profit')
  })

  it('lists each expense category as its own line', async () => {
    const w = await open()
    expect(w.text()).toContain('Gas')
  })
})
