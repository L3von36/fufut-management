import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ReservationsView from '../../../src/views/ReservationsView.vue'

// Creating and cancelling bookings follow the reservations permission, so the
// view renders nothing to act on without a role. Mocking the store rather than
// driving the real one matches how the other component tests here work.
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { firstName: 'Test', role: 'Manager' },
    roleKey: 'manager',
    isAuthenticated: true,
    permissions: ['reservations'],
    hasPermission: (v) => v === 'reservations'
  }))
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: (...a) => mockApiPut(...a),
  ROLE_PERMISSIONS: { manager: ['reservations'], 'head-waiter': ['reservations'] },
  ROLE_DEFAULT_VIEW: { manager: 'dashboard' },
  NAV_ITEMS: []
}))

const TABLES = [
  { id: 'T3', number: 3, capacity: 6, section: 'Patio' },
  { id: 'T1', number: 1, capacity: 4, section: 'Main Hall' },
  { id: 'T8', number: 8, capacity: 2, section: 'Window' }
]

/** Route each endpoint the component actually calls. */
function mockFeeds({ reservations = [], tables = TABLES, taken = [] } = {}) {
  mockApiGet.mockImplementation((path) => {
    if (path === 'reservations') return Promise.resolve(reservations)
    if (path === 'tables') return Promise.resolve(tables)
    if (String(path).startsWith('reservations/availability')) {
      return Promise.resolve({ ok: true, taken })
    }
    return Promise.resolve([])
  })
}

const globalConfig = { global: { provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) } } }

async function openForm(wrapper) {
  const addBtn = wrapper.findAll('button').find(b => b.text().includes('New'))
  await addBtn.trigger('click')
  await flushPromises()
}

// Scoped to the dialog on purpose: the toolbar above the table also carries a
// status filter select and a search input, so an unscoped findAll would return
// those first and quietly assert against the wrong control.
const modalSelects = (wrapper) => wrapper.find('.modal').findAll('select.select')
const modalInputs = (wrapper) => wrapper.find('.modal').findAll('input')

describe('ReservationsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockApiPost.mockResolvedValue({ ok: true })
    mockFeeds()
  })

  it('builds the table picker from the tables that exist, in number order', async () => {
    const wrapper = mount(ReservationsView, globalConfig)
    await flushPromises()
    await openForm(wrapper)

    const options = modalSelects(wrapper)[0].findAll('option')
    const labels = options.map(o => o.text())
    // First entry is the "no table" escape hatch; the rest are real tables.
    expect(labels[0]).toContain('No table yet')
    expect(labels[1]).toContain('Table 1')
    expect(labels[2]).toContain('Table 3')
    expect(labels[3]).toContain('Table 8')
  })

  it('shows capacity and section so a host can choose sensibly', async () => {
    const wrapper = mount(ReservationsView, globalConfig)
    await flushPromises()
    await openForm(wrapper)

    const text = modalSelects(wrapper)[0].text()
    expect(text).toContain('6 seats')
    expect(text).toContain('Patio')
  })

  // The server refuses an overlapping booking; offering it in the list would
  // invite staff to promise a table they cannot have.
  it('disables tables already booked for the chosen window', async () => {
    mockFeeds({ taken: [{ table_id: 'T3' }] })
    const wrapper = mount(ReservationsView, globalConfig)
    await flushPromises()
    await openForm(wrapper)

    const options = modalSelects(wrapper)[0].findAll('option')
    const t3 = options.find(o => o.text().includes('Table 3'))
    const t1 = options.find(o => o.text().includes('Table 1'))
    expect(t3.attributes('disabled')).toBeDefined()
    expect(t3.text()).toContain('booked')
    expect(t1.attributes('disabled')).toBeUndefined()
  })

  it('sends the chosen table and hold length when creating', async () => {
    const wrapper = mount(ReservationsView, globalConfig)
    await flushPromises()
    await openForm(wrapper)

    const inputs = modalInputs(wrapper)
    await inputs[0].setValue('Amanuel')
    const selects = modalSelects(wrapper)
    await selects[0].setValue(3)   // table
    await selects[1].setValue(120) // hold length

    await wrapper.findAll('button').find(b => b.text() === 'Create').trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('reservations', expect.objectContaining({
      name: 'Amanuel',
      tableNum: 3,
      duration_min: 120,
      status: 'new'
    }))
  })

  it('keeps the form open and explains when the table is already taken', async () => {
    mockApiPost.mockRejectedValue(new Error('That table is already reserved for an overlapping time'))
    const wrapper = mount(ReservationsView, globalConfig)
    await flushPromises()
    await openForm(wrapper)

    await modalInputs(wrapper)[0].setValue('Amanuel')
    await modalSelects(wrapper)[0].setValue(3)
    await wrapper.findAll('button').find(b => b.text() === 'Create').trigger('click')
    await flushPromises()

    // The clash is stated in the form, where the table and time can be changed.
    expect(wrapper.find('.rv-clash').exists()).toBe(true)
    expect(wrapper.find('.rv-clash').text()).toContain('already reserved')
    expect(wrapper.find('.modal').exists()).toBe(true)
  })

  it('warns when the party is larger than the table, without blocking', async () => {
    const wrapper = mount(ReservationsView, globalConfig)
    await flushPromises()
    await openForm(wrapper)

    await modalInputs(wrapper)[1].setValue(6)   // guests
    await modalSelects(wrapper)[0].setValue(8) // Table 8 seats 2
    await flushPromises()

    expect(wrapper.text()).toContain('This table seats 2')
    // Still creatable - staff do seat five at a four-top.
    expect(wrapper.findAll('button').find(b => b.text() === 'Create').attributes('disabled')).toBeUndefined()
  })

  it('resolves table_id to a table number in the list', async () => {
    mockFeeds({
      reservations: [{ id: 'R1', name: 'Sara', table_id: 'T3', status: 'new', date: '2026-08-11', time: '18:30' }]
    })
    const wrapper = mount(ReservationsView, globalConfig)
    await flushPromises()

    expect(wrapper.text()).toContain('Table 3')
  })

  // The 15 legacy rows have no table at all and must not render as broken.
  it('shows a dash for a booking with no table', async () => {
    mockFeeds({
      reservations: [{ id: 'R2', name: 'Legacy', table_id: '', status: 'new', date: '2026-08-01', time: '7:00 AM' }]
    })
    const wrapper = mount(ReservationsView, globalConfig)
    await flushPromises()

    // Escaped rather than a literal em dash so the assertion cannot be broken
    // by the file's encoding.
    expect(wrapper.text()).toContain('—')
  })

  // Availability is a convenience, not the rule: the server still rejects a
  // real clash, so a failed lookup must never stop a booking being taken.
  it('still allows booking when the availability lookup fails', async () => {
    mockApiGet.mockImplementation((path) => {
      if (path === 'reservations') return Promise.resolve([])
      if (path === 'tables') return Promise.resolve(TABLES)
      return Promise.reject(new Error('offline'))
    })

    const wrapper = mount(ReservationsView, globalConfig)
    await flushPromises()
    await openForm(wrapper)

    const options = modalSelects(wrapper)[0].findAll('option')
    expect(options.every(o => o.attributes('disabled') === undefined)).toBe(true)
  })
})
