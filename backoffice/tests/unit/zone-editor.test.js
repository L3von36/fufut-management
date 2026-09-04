import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * The manager's zone editor, mounted for real.
 *
 * Zones were hardcoded in the POS; they are data now (settings key
 * tables.sections) and this modal is the editor. The API owns the rules —
 * nine-zone cap, rename cascades, remove-needs-a-destination — so these tests
 * pin the contract the modal has with it:
 *
 *   - only a manager sees the entry point,
 *   - the list renders with each zone's table count,
 *   - renaming posts {action:'rename'} and reports how many tables moved,
 *   - deleting an occupied zone asks where the tables go instead of
 *     deleting outright (progressive disclosure, not a wall of warnings),
 *   - the counter shows the n/9 budget in the header.
 */

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
vi.mock('../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: (...a) => mockApiPut(...a),
  apiDelete: vi.fn(),
  API: '',
  isOnline: () => true,
  onOnlineChange: () => () => {},
  TODAY: () => '2026-08-11',
}))

let mockRoleKey = 'manager'
vi.mock('../../src/stores/auth', () => ({
  useAuthStore: () => ({ roleKey: mockRoleKey }),
}))

vi.mock('../../src/composables/useSSE', () => ({
  useSSE: () => ({ connected: { value: false }, connect: vi.fn(), disconnect: vi.fn(), on: vi.fn() }),
}))
vi.mock('../../src/composables/useButtonState', () => ({
  useButtonState: () => ({ setLoading: vi.fn(), reset: vi.fn() }),
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,x') },
}))

import TablesView from '../../src/views/TablesView.vue'

const toast = vi.fn()
const confirmBox = vi.fn(() => Promise.resolve(true))
const cfg = { global: { provide: { toast, confirm: confirmBox } } }

const TABLES = [
  { id: 'T1', number: 1, section: 'Patio', status: 'available', capacity: 4 },
  { id: 'T2', number: 2, section: 'Patio', status: 'occupied', capacity: 4 },
  { id: 'T3', number: 3, section: 'Bar', status: 'available', capacity: 2 },
]
const SECTIONS = {
  ok: true,
  sections: ['Patio', 'Main Hall', 'Bar'],
  usage: { Patio: 2, Bar: 1 },
  custom: false,
  max: 9,
  nameMax: 24,
}

/** Mount with `tables` and `tables/sections` served, everything else empty. */
async function openTables() {
  mockApiGet.mockImplementation((endpoint) => {
    if (endpoint === 'tables/sections') return Promise.resolve(SECTIONS)
    if (endpoint === 'tables') return Promise.resolve(TABLES)
    if (endpoint === 'orders') return Promise.resolve([])
    if (endpoint === 'reservations') return Promise.resolve([])
    return Promise.resolve([])
  })
  const w = mount(TablesView, cfg)
  await flushPromises()
  return w
}

function openEditor(w) {
  return w.findAll('button').find((b) => b.text() === 'Manage Zones').trigger('click')
}

describe('the zone editor entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoleKey = 'manager'
  })

  it('a manager sees Manage Zones; another role does not', async () => {
    const w = await openTables()
    expect(w.findAll('button').some((b) => b.text() === 'Manage Zones')).toBe(true)
    w.unmount()

    mockRoleKey = 'head-waiter'
    const w2 = await openTables()
    expect(w2.findAll('button').some((b) => b.text() === 'Manage Zones')).toBe(false)
  })
})

describe('the Manage Zones modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoleKey = 'manager'
  })

  it('renders one row per zone with its table count and the n/max counter', async () => {
    const w = await openTables()
    await openEditor(w)
    await flushPromises()

    const rows = w.findAll('.zone-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].find('input').element.value).toBe('Patio')
    expect(rows[0].text()).toContain('2 tables')
    expect(rows[2].find('input').element.value).toBe('Bar')
    expect(w.find('.zone-counter').text()).toBe('3 / 9')
  })

  it('renaming posts the rename action and reports how many tables followed', async () => {
    mockApiPost.mockResolvedValue({ ok: true, sections: ['Terrace', 'Main Hall', 'Bar'], tablesMoved: 2 })
    const w = await openTables()
    await openEditor(w)
    await flushPromises()

    const input = w.findAll('.zone-row')[0].find('input')
    await input.setValue('Terrace')
    await input.trigger('keyup.enter')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('tables/sections', {
      action: 'rename', from: 'Patio', to: 'Terrace',
    })
    expect(toast).toHaveBeenCalledWith('Patio → Terrace — 2 tables moved with it')
    // The list re-read: the new name is in the store the pickers use.
    expect(mockApiGet).toHaveBeenCalledWith('tables/sections')
  })

  it('a failed rename restores the row instead of leaving it half-edited', async () => {
    mockApiPost.mockRejectedValue(new Error('"Bar" is already a zone. Rename to something distinct.'))
    const w = await openTables()
    await openEditor(w)
    await flushPromises()

    const input = w.findAll('.zone-row')[0].find('input')
    await input.setValue('Bar')
    await input.trigger('keyup.enter')
    await flushPromises()

    expect(toast).toHaveBeenCalledWith('"Bar" is already a zone. Rename to something distinct.', 'error')
    expect(w.findAll('.zone-row')[0].find('input').element.value).toBe('Patio')
  })

  it('deleting an occupied zone asks for a destination before it deletes', async () => {
    mockApiPost.mockResolvedValue({ ok: true, sections: ['Main Hall', 'Bar'], tablesMoved: 2 })
    const w = await openTables()
    await openEditor(w)
    await flushPromises()

    await w.findAll('.zone-row')[0].find('.zone-delete').trigger('click')
    await flushPromises()

    // No delete has been posted yet — the destination panel is up instead.
    expect(mockApiPost).not.toHaveBeenCalled()
    const panel = w.find('.zone-remove')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('2 tables')

    await panel.findAll('button').find((b) => b.text() === 'Move & Delete').trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('tables/sections', {
      action: 'remove', name: 'Patio', moveTo: 'Main Hall',
    })
    expect(toast).toHaveBeenCalledWith('Zone deleted — 2 tables moved to Main Hall')
  })

  it('deleting an empty zone goes through the plain confirm, no destination panel', async () => {
    mockApiPost.mockResolvedValue({ ok: true, sections: ['Patio', 'Bar'], tablesMoved: 0 })
    const w = await openTables()
    await openEditor(w)
    await flushPromises()

    await w.findAll('.zone-row')[1].find('.zone-delete').trigger('click') // Main Hall: 0 tables
    await flushPromises()

    expect(confirmBox).toHaveBeenCalledWith('Delete the zone "Main Hall"?')
    expect(mockApiPost).toHaveBeenCalledWith('tables/sections', { action: 'remove', name: 'Main Hall' })
    expect(w.find('.zone-remove').exists()).toBe(false)
  })

  it('adding a zone posts it and clears the input', async () => {
    mockApiPost.mockResolvedValue({ ok: true, sections: ['Patio', 'Main Hall', 'Bar', 'Terrace'] })
    const w = await openTables()
    await openEditor(w)
    await flushPromises()

    await w.find('.zone-add input').setValue('Terrace')
    await w.find('.zone-add input').trigger('keyup.enter')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('tables/sections', { action: 'add', name: 'Terrace' })
    expect(w.find('.zone-add input').element.value).toBe('')
    expect(toast).toHaveBeenCalledWith('Zone "Terrace" added')
  })
})

describe('moving a single table between zones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoleKey = 'manager'
  })

  it('posts the gated per-table route and updates the card', async () => {
    mockApiPut.mockResolvedValue({ ok: true })
    const w = await openTables()

    await w.findAll('.tm-table-card')[0].trigger('click')
    await flushPromises()

    const select = w.find('.zone-edit-row select')
    expect(select.exists()).toBe(true)
    expect(select.element.value).toBe('Patio')

    await select.setValue('Bar')
    await w.findAll('button').find((b) => b.text() === 'Move').trigger('click')
    await flushPromises()

    expect(mockApiPut).toHaveBeenCalledWith('tables/T1', { section: 'Bar' })
    expect(toast).toHaveBeenCalledWith('Table moved to Bar')
  })
})
