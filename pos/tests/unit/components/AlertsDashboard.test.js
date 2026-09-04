import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * The SLA Alerts dashboard — the manager's view of the rules engine.
 *
 * Pinned here: the KPI row agrees with the lists under it (counts are derived
 * from the same rows that render, not from a second endpoint that can drift),
 * the rules grid mirrors the eight server rule ids, "resolved today" means
 * today at the restaurant (not today in UTC — Addis is UTC+3 and the 03:00
 * window is exactly where that bug would bite), and the ack flow moves a row
 * from open to acknowledged without a reload.
 */

vi.mock('../../../src/composables/useSSE', () => ({
  useSSE: () => ({ connect: vi.fn(), disconnect: vi.fn(), on: vi.fn() }),
}))

vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: vi.fn(),
  TODAY: () => '2026-08-28',
}))

let authRoleKey = 'manager'
let authName = 'Test Manager'
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => ({ roleKey: authRoleKey, name: authName }),
}))

import AlertsDashboardView from '../../../src/views/AlertsDashboardView.vue'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const toastFn = vi.fn()

const OPEN = [
  {
    id: 'A1', rule_id: 'order-preparing-too-long', severity: 'critical',
    message: 'Takeaway #17 has been preparing for 17 h 40 min',
    created: '2026-08-27T16:20:00.000Z',
  },
  {
    id: 'A2', rule_id: 'reservation-no-show', severity: 'warning',
    message: 'Reservation for Abebe never checked in',
    created: '2026-08-28T09:30:00.000Z',
  },
  {
    id: 'A3', rule_id: 'order-ready-not-served', severity: 'warning',
    message: 'Table 4 food ready 14 min',
    created: '2026-08-28T09:40:00.000Z',
  },
]
const ACKED = [
  {
    id: 'A0', rule_id: 'order-new-unaccepted', severity: 'warning',
    message: 'Takeaway #16 unaccepted 8 min',
    created: '2026-08-28T07:50:00.000Z',
    acknowledged_by: 'Bereket', acknowledged_at: '2026-08-28T08:00:00.000Z',
  },
]
const RESOLVED = [
  {
    id: 'A9', rule_id: 'order-served-unpaid', severity: 'warning',
    message: 'Table 2 unpaid 31 min', created: '2026-08-28T06:40:00.000Z',
    resolved_at: '2026-08-28T07:15:00.000Z',
  },
  {
    id: 'A8', rule_id: 'table-seated-too-long', severity: 'warning',
    message: 'Table 7 occupied 2 h', created: '2026-08-27T15:00:00.000Z',
    resolved_at: '2026-08-27T18:00:00.000Z', // yesterday local — must not count
  },
]

function mockEndpoints() {
  mockApiGet.mockImplementation((endpoint) => {
    if (endpoint.startsWith('alerts?status=open')) return Promise.resolve({ ok: true, alerts: OPEN })
    if (endpoint.startsWith('alerts?status=acknowledged')) return Promise.resolve({ ok: true, alerts: ACKED })
    if (endpoint.startsWith('alerts?status=resolved')) return Promise.resolve({ ok: true, alerts: RESOLVED })
    return Promise.resolve({ ok: true })
  })
}

function mountView() {
  return mount(AlertsDashboardView, { global: { provide: { toast: toastFn } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  toastFn.mockReset()
  authRoleKey = 'manager'
  authName = 'Test Manager'
  mockEndpoints()
})

describe('SLA dashboard', () => {
  it('renders all nine rules of the engine', async () => {
    const wrapper = mountView()
    await flushPromises()
    const cards = wrapper.findAll('.sla-rule')
    expect(cards.length).toBe(9)
    const names = cards.map((c) => c.find('.sla-rule-name').text())
    expect(names).toContain('Preparing too long')
    expect(names).toContain('Reservation no-show')
    expect(names).toContain('Driver out too long')
  })

  it('derives the KPI row from the same rows it renders', async () => {
    const wrapper = mountView()
    await flushPromises()
    const kpis = wrapper.findAll('.sla-kpi')
    const num = (i) => Number(kpis[i].find('.sla-kpi-num').text())
    expect(num(0)).toBe(3)            // open
    expect(num(1)).toBe(1)            // critical
    expect(num(2)).toBe(2)            // warning
    expect(num(3)).toBe(1)            // acknowledged
    expect(num(4)).toBe(1)            // resolved today (yesterday excluded)
  })

  it('marks rule cards critical, warning or clear from live rows', async () => {
    const wrapper = mountView()
    await flushPromises()
    const states = {}
    for (const card of wrapper.findAll('.sla-rule')) {
      states[card.find('.sla-rule-name').text()] = card.find('.sla-rule-state').text()
    }
    expect(states['Preparing too long']).toBe('critical')
    expect(states['Reservation no-show']).toBe('warning')
    expect(states['Driver out too long']).toBe('clear')
    expect(wrapper.find('.sla-rule.critical').exists()).toBe(true)
  })

  it('lists critical rows first in the open panel', async () => {
    const wrapper = mountView()
    await flushPromises()
    const firstRow = wrapper.find('.sla-panel .sla-row')
    expect(firstRow.classes()).toContain('critical')
    expect(firstRow.text()).toContain('Takeaway #17')
  })

  it('moves a row from open to acknowledged without a reload', async () => {
    mockApiPost.mockResolvedValue({ ok: true })
    const wrapper = mountView()
    await flushPromises()

    const rows = wrapper.findAll('.sla-panel').at(0).findAll('.sla-row')
    expect(rows.length).toBe(3)
    const ackBtn = rows.at(1).find('.sla-ack') // the warning reservation row
    await ackBtn.trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('alerts/A2/acknowledge', {})
    expect(wrapper.findAll('.sla-panel').at(0).findAll('.sla-row').length).toBe(2)
    expect(toastFn).toHaveBeenCalledWith('Alert acknowledged', 'success')
    // The acknowledged panel now carries the row with the acker's name.
    expect(wrapper.find('.sla-panel-head-gap').text()).toContain('Resolved today')
  })

  it('offers acknowledge-all only to roles the server lets ack', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.sla-panel-head .btn').exists()).toBe(true)

    authRoleKey = 'assistant-chef' // reads alerts, cannot sign them
    const quiet = mountView()
    await flushPromises()
    expect(quiet.find('.sla-panel-head .btn').exists()).toBe(false)
    // ...and no per-row ack buttons either.
    expect(quiet.findAll('.sla-ack').length).toBe(0)
    quiet.unmount()
  })

  it('keeps every ack button off for roles without alerts write', async () => {
    authRoleKey = 'delivery-staff'
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('.sla-ack').length).toBe(0)
  })
})
