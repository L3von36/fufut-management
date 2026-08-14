import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AuditLogView from '../../../src/views/AuditLogView.vue'

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({ roleKey: 'manager', isAuthenticated: true }))
}))

const mockApiGet = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  ROLE_PERMISSIONS: { manager: ['audit'] },
  ROLE_DEFAULT_VIEW: { manager: 'dashboard' },
  NAV_ITEMS: []
}))

const ENTRIES = [
  {
    id: 'AL1',
    at: '2026-08-14T12:33:39.636Z',
    actor_id: 'S1',
    actor_name: 'Amanuel Fekadu',
    actor_role: 'manager',
    action: 'update',
    entity: 'menu',
    entity_id: 'MIe6d19d99',
    before: { price: 350 },
    after: { price: 150 },
    reason: null
  },
  {
    id: 'AL2',
    at: '2026-08-14T12:03:26.487Z',
    actor_id: null,
    actor_name: 'anonymous',
    actor_role: null,
    action: 'create',
    entity: 'orders',
    entity_id: 'O100ea55',
    before: null,
    after: { type: 'dine-in', table_id: '3', total: 70 },
    reason: null
  },
  {
    id: 'AL3',
    at: '2026-08-14T11:00:00.000Z',
    actor_id: 'S2',
    actor_name: 'Yonas Worku',
    actor_role: 'head-waiter',
    action: 'void',
    entity: 'orders',
    entity_id: 'O99999',
    before: { status: 'new' },
    after: { status: 'cancelled' },
    reason: 'Wrong table'
  }
]

function mockApi(after) {
  mockApiGet.mockImplementation((path) => {
    if (String(path).startsWith('audit')) {
      return Promise.resolve({ ok: true, count: ENTRIES.length, entries: after })
    }
    return Promise.resolve([])
  })
}

const globalConfig = { global: { provide: { toast: vi.fn() } } }

describe('AuditLogView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockApi(ENTRIES)
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('renders every audit entry with actor, action, entity and reason', async () => {
    const wrapper = mount(AuditLogView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Audit Log')
    expect(wrapper.text()).toContain('Amanuel Fekadu')
    expect(wrapper.text()).toContain('Yonas Worku')
    expect(wrapper.text()).toContain('MIe6d19d99')
    expect(wrapper.text()).toContain('Wrong table')
  })

  it('shows the before → after diff for an update', async () => {
    const wrapper = mount(AuditLogView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('price: 350 → 150')
  })

  it('requests the audit endpoint with date filters on apply', async () => {
    const wrapper = mount(AuditLogView, globalConfig)
    await flushPromises()
    mockApiGet.mockClear()

    await wrapper.find('button.btn-secondary').trigger('click')
    await flushPromises()

    const call = mockApiGet.mock.calls.find(([p]) => String(p).startsWith('audit'))
    expect(call).toBeTruthy()
    const qs = decodeURIComponent(String(call[0]))
    expect(qs).toMatch(/^audit\?/)
    expect(qs).toMatch(/limit=500/)
    expect(qs).toMatch(/to=\d{4}-\d{2}-\d{2}T23:59:59/)
  })
})
