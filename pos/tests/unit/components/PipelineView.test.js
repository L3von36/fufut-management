import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PipelineView from '../../../src/views/PipelineView.vue'

let currentRole = 'head-chef'
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    get roleKey() { return currentRole },
    isAuthenticated: true,
    hasPermission: () => true
  }))
}))

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPut: (...a) => mockApiPut(...a),
  getSSEUrl: (p) => `http://localhost:1234/api/events/${p}`,
  ROLE_PERMISSIONS: { 'head-chef': ['pipeline'] },
  ROLE_DEFAULT_VIEW: { 'head-chef': 'kitchen' },
  NAV_ITEMS: []
}))

class MockEventSource {
  constructor(url) { this.url = url; this._l = {} }
  addEventListener(e, f) { (this._l[e] ||= []).push(f) }
  removeEventListener() {}
  close() {}
}
vi.stubGlobal('EventSource', MockEventSource)

const globalConfig = { global: { provide: { toast: vi.fn() } } }

const order = (id, status) => ({
  id, status, type: 'dine-in', table_id: '4', customer: 'Walk-in',
  total: 250, items: '1xMacchiato', created: new Date().toISOString()
})

/** Open a ticket's detail panel, which is where the stage buttons live. */
async function openTicket(w) {
  const card = w.findAll('.pipeline-card, .pl-card, [class*="card"]').find(c => c.text().includes('Macchiato'))
  await card.trigger('click')
  await flushPromises()
  return w
}

async function mountWith(status) {
  mockApiGet.mockResolvedValue([order('O1', status)])
  const w = mount(PipelineView, globalConfig)
  await flushPromises()
  await openTicket(w)
  return w
}

describe('PipelineView stage transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentRole = 'head-chef'
    mockApiPut.mockResolvedValue({ ok: true })
  })

  // These three buttons mutate real tickets, which is why they were held back
  // from the browser suite. Here they can be exercised with no live order.
  it('Send to Kitchen moves a new order to preparing', async () => {
    const w = await mountWith('new')
    const btn = w.findAll('button').find(b => b.text() === 'Send to Kitchen')
    expect(btn).toBeDefined()
    await btn.trigger('click')
    await flushPromises()
    expect(mockApiPut).toHaveBeenCalledWith('orders/O1', expect.objectContaining({ status: 'preparing' }))
  })

  it('Mark Ready moves a preparing order to ready', async () => {
    const w = await mountWith('preparing')
    await w.findAll('button').find(b => b.text() === 'Mark Ready').trigger('click')
    await flushPromises()
    expect(mockApiPut).toHaveBeenCalledWith('orders/O1', expect.objectContaining({ status: 'ready' }))
  })

  it('Mark Served moves a ready order to fulfilled', async () => {
    const w = await mountWith('ready')
    await w.findAll('button').find(b => b.text() === 'Mark Served').trigger('click')
    await flushPromises()
    expect(mockApiPut).toHaveBeenCalledWith('orders/O1', expect.objectContaining({ status: 'fulfilled' }))
  })

  // Only the action for the ticket's current stage is offered, so a dish cannot
  // be skipped straight from new to served.
  it('offers only the action for the stage the ticket is at', async () => {
    const w = await mountWith('new')
    const labels = w.findAll('button').map(b => b.text())
    expect(labels).toContain('Send to Kitchen')
    expect(labels).not.toContain('Mark Ready')
    expect(labels).not.toContain('Mark Served')
  })

  it('does not offer Cancel to a chef', async () => {
    const w = await mountWith('new')
    expect(w.findAll('button').map(b => b.text())).not.toContain('Cancel')
  })

  it('offers Cancel to a manager', async () => {
    currentRole = 'manager'
    const w = await mountWith('new')
    expect(w.findAll('button').map(b => b.text())).toContain('Cancel')
  })

  it('groups tickets into their stage lanes', async () => {
    mockApiGet.mockResolvedValue([order('O1', 'new'), order('O2', 'preparing'), order('O3', 'fulfilled')])
    const w = mount(PipelineView, globalConfig)
    await flushPromises()
    expect(w.text()).toContain('New Orders')
    expect(w.text()).toContain('Preparing')
    expect(w.text()).toContain('Ready to Serve')
    expect(w.text()).toContain('Served')
  })
})
