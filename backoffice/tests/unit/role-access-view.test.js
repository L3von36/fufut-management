import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
vi.mock('../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: vi.fn(),
  apiPut: (...a) => mockApiPut(...a),
  apiDelete: vi.fn(),
  API: '',
  isOnline: () => true,
  onOnlineChange: () => () => {},
  TODAY: () => '2026-09-02',
  ROLE_PERMISSIONS: {},
  ROLE_DEFAULT_VIEW: {},
  NAV_ITEMS: [],
}))

import RoleAccessView from '../../src/views/RoleAccessView.vue'

const toastSpy = vi.fn()
const globalConfig = {
  global: { provide: { toast: toastSpy, confirm: vi.fn(() => Promise.resolve(true)) } },
}

const INVENTORY = [
  { id: 'I-beans', name: 'Coffee beans', category: 'Coffee & Tea' },
  { id: 'I-milk', name: 'Milk', category: 'Dairy & Eggs' },
  { id: 'I-lemon', name: 'Lemon', category: 'Fruit' },
  { id: 'I-cup', name: 'Paper cup', category: 'Packaging' },
]

const CATALOGUE = {
  ok: true,
  screens: [
    { key: 'inventory', label: 'Inventory', blurb: 'Stock levels and the item list.', scoping: 'categories+items' },
    { key: 'waste', label: 'Waste Log', blurb: 'Recording what was thrown away.', scoping: 'none' },
    { key: 'recipes', label: 'Recipes', blurb: 'Read-only lookup.', scoping: 'none' },
    { key: 'orders', label: 'Orders', blurb: 'The full ticket list.', scoping: 'none' },
  ],
  roles: ['head-chef', 'barista', 'cleaner'],
  categories: ['Coffee & Tea', 'Dairy & Eggs', 'Fruit', 'Packaging'],
  scopes: [
    {
      role: 'barista',
      scope: { inventory: { enabled: true, categories: ['Coffee & Tea'], itemIds: ['I-lemon'] } },
      updatedAt: '2026-09-02T04:43:38.729Z',
      updatedBy: 'Amanuel Fekadu',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApiGet.mockImplementation((e) => {
    if (e === 'role-scopes') return Promise.resolve(CATALOGUE)
    if (e === 'inventory') return Promise.resolve(INVENTORY)
    return Promise.resolve([])
  })
  mockApiPut.mockResolvedValue({ ok: true })
})

const open = async () => {
  const w = mount(RoleAccessView, globalConfig)
  await flushPromises()
  return w
}

const pickRole = async (w, role) => {
  await w.find('select').setValue(role)
  await flushPromises()
}

const saveButton = (w) => w.findAll('button').find((b) => b.text().includes('Save Access'))

describe('RoleAccessView — individual item scoping', () => {
  it('renders the item picker from the live inventory, sorted by category', async () => {
    const w = await open()
    await pickRole(w, 'barista')
    const names = w.findAll('.ra-item .ra-item-name').map((n) => n.text())
    // Category, then name: beans (Coffee & Tea), milk (Dairy & Eggs), lemon (Fruit), cup (Packaging)
    expect(names).toEqual(['Coffee beans', 'Milk', 'Lemon', 'Paper cup'])
  })

  it('restores a saved scope: category checked, hand-picked item flagged, chip names the item', async () => {
    const w = await open()
    await pickRole(w, 'barista')
    const catInput = w.findAll('.ra-cat').find((c) => c.text().includes('Coffee & Tea')).find('input')
    expect(catInput.element.checked).toBe(true)
    const lemonRow = w.findAll('.ra-item').find((r) => r.text().includes('Lemon'))
    expect(lemonRow.classes()).toContain('is-picked')
    expect(lemonRow.classes()).not.toContain('via-cat')
    expect(w.text()).toContain('Inventory: Coffee & Tea, Lemon')
  })

  it('saves hand-picked items beside the scoped categories', async () => {
    const w = await open()
    await pickRole(w, 'barista')
    const cupRow = w.findAll('.ra-item').find((r) => r.text().includes('Paper cup'))
    await cupRow.find('input').setValue(true)
    await saveButton(w).trigger('click')
    await flushPromises()
    expect(mockApiPut).toHaveBeenCalledTimes(1)
    const [path, body] = mockApiPut.mock.calls[0]
    expect(path).toBe('role-scopes/barista')
    expect(body.screens.inventory).toEqual({
      enabled: true,
      categories: ['Coffee & Tea'],
      itemIds: ['I-lemon', 'I-cup'],
    })
  })

  it('warns and still saves when inventory is on with nothing picked', async () => {
    const w = await open()
    await pickRole(w, 'cleaner')
    await w.find('.ra-switch input').setValue(true)
    await flushPromises()
    expect(w.text()).toMatch(/nothing picked/i)
    await saveButton(w).trigger('click')
    await flushPromises()
    const [, body] = mockApiPut.mock.calls[0]
    expect(body.screens.inventory).toEqual({ enabled: true, categories: [], itemIds: [] })
  })

  it('searches the picker by item name', async () => {
    const w = await open()
    await pickRole(w, 'barista')
    await w.find('.ra-item-search').setValue('lem')
    await flushPromises()
    const names = w.findAll('.ra-item .ra-item-name').map((n) => n.text())
    expect(names).toEqual(['Lemon'])
  })
})
