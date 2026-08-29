import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MyPerformanceView from '../../src/views/MyPerformanceView.vue'

/**
 * Backoffice MyPerformanceView smoke test. Mirrors the POS test for the
 * parallel-ported view. Confirms the view mounts, fetches the user's own
 * audit slice via /api/audit?actor_id=<me>, renders role-aware KPIs
 * (dishes served for chefs, deliveries completed for drivers, etc.),
 * and the activity-log table.
 */

vi.mock('../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'S7', firstName: 'Sara', lastName: 'Tesfaye', role: 'delivery-staff' },
    roleKey: 'delivery-staff',
    isAuthenticated: true,
  })),
}))

const mockApiGet = vi.fn()
vi.mock('../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  TODAY: () => '2026-08-14',
}))

const ENTRIES = [
  {
    id: 'AL1',
    at: '2026-08-14T13:14:00.000Z',
    actor_id: 'S7',
    actor_name: 'Sara Tesfaye',
    actor_role: 'delivery-staff',
    action: 'update',
    entity: 'delivery',
    entity_id: 'D1',
    before: { status: 'out_for_delivery' },
    after: { status: 'delivered' },
    reason: null,
  },
  {
    id: 'AL2',
    at: '2026-08-14T12:30:00.000Z',
    actor_id: 'S7',
    actor_name: 'Sara Tesfaye',
    actor_role: 'delivery-staff',
    action: 'update',
    entity: 'delivery',
    entity_id: 'D1',
    before: { status: 'picked_up' },
    after: { status: 'out_for_delivery' },
    reason: null,
  },
  {
    id: 'AL3',
    at: '2026-08-14T11:00:00.000Z',
    actor_id: 'S7',
    actor_name: 'Sara Tesfaye',
    actor_role: 'delivery-staff',
    action: 'create',
    entity: 'payments',
    entity_id: 'P1',
    before: null,
    after: { method: 'cash', amount: 250 },
    reason: 'Doorstep cash',
  },
]

const globalConfig = { global: { provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) } } }

function mockApi() {
  mockApiGet.mockImplementation((path) => {
    if (String(path).startsWith('audit')) {
      return Promise.resolve({ ok: true, count: ENTRIES.length, entries: ENTRIES })
    }
    return Promise.resolve([])
  })
}

describe('Backoffice MyPerformanceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockApi()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('mounts, fetches the user own audit slice and renders KPIs', async () => {
    const wrapper = mount(MyPerformanceView, globalConfig)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('My Activity')
    expect(text).toContain('Sara Tesfaye')
    expect(text).toContain('Delivery Staff')
    // delivery-staff role gets a "Delivered" KPI; the test data has one delivery
    // row that moved to "delivered", so the count "1" should appear next to it.
    expect(text).toContain('Delivered')
    expect(text).toContain('Payments Recorded')
  })

  it('renders the activity log rows with before → after summary', async () => {
    const wrapper = mount(MyPerformanceView, globalConfig)
    await flushPromises()

    const text = wrapper.text()
    // The changeSummary output puts the after-status as "status: delivered".
    expect(text).toContain('delivered')
    expect(text).toContain('Doorstep cash')
  })

  it('hits /api/audit?actor_id=<me> on mount', async () => {
    mount(MyPerformanceView, globalConfig)
    await flushPromises()

    const call = mockApiGet.mock.calls.find(([p]) => String(p).startsWith('audit'))
    expect(call).toBeTruthy()
    expect(decodeURIComponent(String(call[0]))).toMatch(/actor_id=S7/)
    expect(decodeURIComponent(String(call[0]))).toMatch(/from=\d{4}-\d{2}-\d{2}/)
    expect(decodeURIComponent(String(call[0]))).toMatch(/to=\d{4}-\d{2}-\d{2}/)
  })
})
