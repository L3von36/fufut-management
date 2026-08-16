import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ReportsView from '../../../src/views/ReportsView.vue'

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({ roleKey: 'manager', isAuthenticated: true }))
}))

const mockApiGet = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  TODAY: () => new Date().toISOString().slice(0, 10),
  ROLE_PERMISSIONS: { manager: ['reports'] },
  ROLE_DEFAULT_VIEW: { manager: 'dashboard' },
  NAV_ITEMS: []
}))

const CATEGORIES = [
  { category: 'Food', served: 12, averageMinutes: 21.4, fastestMinutes: 14, slowestMinutes: 38 },
  { category: 'Hot Drinks', served: 40, averageMinutes: 8.2, fastestMinutes: 4, slowestMinutes: 19 }
]

function mockFeeds({ categories = CATEGORIES, sampled = 52 } = {}) {
  mockApiGet.mockImplementation((path) => {
    if (String(path).startsWith('orders/timing')) {
      return Promise.resolve({ ok: true, sampled, categories })
    }
    return Promise.resolve([])
  })
}

const globalConfig = { global: { provide: { toast: vi.fn() } } }

describe('ReportsView — time to table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockFeeds()
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('reports average time to table per category', async () => {
    const wrapper = mount(ReportsView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Time to Table')
    expect(wrapper.text()).toContain('Food')
    expect(wrapper.text()).toContain('21.4 min')
    expect(wrapper.text()).toContain('Hot Drinks')
    expect(wrapper.text()).toContain('8.2 min')
  })

  it('shows how many served items the figures came from', async () => {
    const wrapper = mount(ReportsView, globalConfig)
    await flushPromises()
    expect(wrapper.text()).toContain('52 served items')
  })

  it('shows the spread, not just the average', async () => {
    const wrapper = mount(ReportsView, globalConfig)
    await flushPromises()
    expect(wrapper.text()).toContain('fastest 14 min')
    expect(wrapper.text()).toContain('slowest 38 min')
  })

  // The bar compares categories against each other, so the slowest is full
  // width and everything else is read relative to it.
  it('scales each bar against the slowest category', async () => {
    const wrapper = mount(ReportsView, globalConfig)
    await flushPromises()

    const fills = wrapper.findAll('.rt-bar-fill')
    expect(fills[0].attributes('style')).toContain('width: 100%')
    // 8.2 / 21.4 ≈ 38%
    expect(fills[1].attributes('style')).toContain('width: 38%')
  })

  it('asks the server for a narrower window when the range changes', async () => {
    const wrapper = mount(ReportsView, globalConfig)
    await flushPromises()
    mockApiGet.mockClear()

    await wrapper.findAll('button').find(b => b.text() === '7 days').trigger('click')
    await flushPromises()

    const call = mockApiGet.mock.calls.find(c => String(c[0]).startsWith('orders/timing'))
    expect(call).toBeDefined()
    expect(call[0]).toContain('from=')
  })

  // "Nothing sold" and "sold but never marked served" need different fixes, so
  // the empty state names the second one rather than just saying no data.
  it('explains that timings need the kitchen to mark items served', async () => {
    mockFeeds({ categories: [], sampled: 0 })
    const wrapper = mount(ReportsView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('No items have been marked served')
    expect(wrapper.text()).toContain('Kitchen screen')
  })

  it('does not break the rest of the report when timing is unavailable', async () => {
    mockApiGet.mockImplementation((path) =>
      String(path).startsWith('orders/timing')
        ? Promise.reject(new Error('offline'))
        : Promise.resolve([])
    )

    const wrapper = mount(ReportsView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Reports')
    expect(wrapper.text()).toContain('No items have been marked served')
  })
})
