import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * The floor plan's money story and the bill request.
 *
 * Two questions the floor used to walk to the till to ask:
 *   "is the table paid?"     — answered by the payment badge derived from
 *                              the party's open checks (server-enriched);
 *   "can the cashier come?"  — answered by Ask for the Bill, which stamps
 *                              the table so the request rides the tables SSE
 *                              channel to the cashier's screen.
 *
 * The mock tables here carry exactly the shape GET /api/tables now returns:
 * `payment` ('paid' | 'partial' | 'unpaid' | null) plus the bill-request
 * stamps that live on the row.
 */

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiPost = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPut: (...a) => mockApiPut(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiDelete: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'tables', query: {} }),
}))

vi.mock('../../../src/composables/useSSE', () => ({
  useSSE: () => ({ connected: { value: false }, connect: vi.fn(), disconnect: vi.fn(), on: vi.fn() }),
}))

vi.mock('../../../src/composables/useAudioAlerts', () => ({
  useAudioAlerts: () => ({ muted: { value: true }, enabled: { value: false }, playNewOrder: vi.fn(), playOrderReady: vi.fn(), playOrderUpdate: vi.fn(), toggleMute: vi.fn() }),
}))

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => ({
    roleKey: 'head-waiter',
    isAuthenticated: true,
    user: { id: 'w1', firstName: 'Yonas' },
    hasPermission: (p) => ['orders', 'tables', 'menu-view', 'reservations'].includes(p),
    screenGrants: [],
  }),
}))

vi.mock('../../../src/stores/order', () => ({
  useOrderStore: () => ({
    isAddRound: false,
    activeOpenOrderId: null,
    tableNum: '',
    orderType: '',
  }),
}))

import TablesView from '../../../src/views/TablesView.vue'

const TABLES = [
  {
    id: 'T1', number: 1, name: 'Table 1', section: 'Main', capacity: 4,
    status: 'occupied', guests: 2, server: 'Yonas',
    seated_at: new Date(Date.now() - 10 * 60000).toISOString(),
    payment: 'unpaid', bill_requested_at: '', bill_requested_by: '',
  },
  {
    id: 'T2', number: 2, name: 'Table 2', section: 'Main', capacity: 4,
    status: 'occupied', guests: 3, server: 'Yonas',
    seated_at: new Date(Date.now() - 30 * 60000).toISOString(),
    payment: 'paid', bill_requested_at: new Date(Date.now() - 2 * 60000).toISOString(),
    bill_requested_by: 'Yonas',
  },
  {
    id: 'T3', number: 3, name: 'Table 3', section: 'Terrace', capacity: 6,
    status: 'available', guests: 0, server: '',
    payment: null, bill_requested_at: '', bill_requested_by: '',
  },
]

const mountView = async () => {
  const wrapper = mount(TablesView, {
    global: {
      // App.vue provides the toast globally; the test supplies its own so the
      // toasts fire into a spy instead of nowhere.
      provide: { toast: vi.fn(), confirm: () => Promise.resolve(true) },
      stubs: { Teleport: true, Transition: true },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApiGet.mockImplementation((path) => {
    if (path === 'tables') return Promise.resolve(TABLES)
    if (typeof path === 'string' && path.startsWith('orders?table_number=')) return Promise.resolve([])
    if (path === 'reservations') return Promise.resolve([])
    return Promise.resolve([])
  })
  mockApiPut.mockResolvedValue({ ok: true })
  mockApiPost.mockResolvedValue({ ok: true, requestedAt: new Date().toISOString() })
})

describe('the payment badge', () => {
  it('says whether a seated table is paid', async () => {
    const wrapper = await mountView()
    const t1 = wrapper.findAll('.tm-table-card').find((c) => c.text().includes('T-01'))
    const t2 = wrapper.findAll('.tm-table-card').find((c) => c.text().includes('T-02'))
    expect(t1.text()).toContain('Unpaid')
    expect(t2.text()).toContain('Paid')
    // A free table carries no money badge at all.
    const t3 = wrapper.findAll('.tm-table-card').find((c) => c.text().includes('T-03'))
    expect(t3.text()).not.toContain('Unpaid')
    expect(t3.text()).not.toContain('Paid')
  })

  it('shows a standing bill request on the tile', async () => {
    const wrapper = await mountView()
    const t2 = wrapper.findAll('.tm-table-card').find((c) => c.text().includes('T-02'))
    expect(t2.find('.tfc-bill-req').exists()).toBe(true)
    expect(t2.text()).toContain('Bill Requested')
  })
})

describe('Ask for the Bill', () => {
  it('stamps the table through the request endpoint', async () => {
    const wrapper = await mountView()
    const t1 = wrapper.findAll('.tm-table-card').find((c) => c.text().includes('T-01'))
    await t1.trigger('click')
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Ask for the Bill'))
    expect(btn).toBeDefined()
    await btn.trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('tables/T1/request-bill', {})
    // The open panel flips to the retract state without a reload.
    expect(wrapper.findAll('button').find((b) => b.text().includes('Cancel Bill Request'))).toBeDefined()
  })

  it('offers the retraction once a request is standing', async () => {
    const wrapper = await mountView()
    const t2 = wrapper.findAll('.tm-table-card').find((c) => c.text().includes('T-02'))
    await t2.trigger('click')
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('Cancel Bill Request'))
    expect(btn).toBeDefined()
    await btn.trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('tables/T2/cancel-bill-request', {})
  })
})
