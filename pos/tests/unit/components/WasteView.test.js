import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WasteView from '../../../src/views/WasteView.vue'

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    roleKey: 'head-chef',
    isAuthenticated: true,
    hasPermission: (v) => v === 'waste'
  }))
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiDelete: (...a) => mockApiDelete(...a),
  ROLE_PERMISSIONS: { 'head-chef': ['waste'] },
  ROLE_DEFAULT_VIEW: { 'head-chef': 'kitchen' },
  NAV_ITEMS: []
}))

const ENTRIES = () => ([
  { id: 'W1', name: 'Croissants', category: 'Food', quantity: 4, reason: 'spoiled', cost: 120, date: '2026-08-09' },
  { id: 'W2', name: 'Milk', category: 'Beverage', quantity: 2, reason: 'quality', cost: 80, date: '2026-08-09' }
])

const globalConfig = { global: { provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) } } }

const modal = (w) => w.find('.modal')
const submitBtn = (w) => modal(w).findAll('button').find(b => /^log$/i.test(b.text().trim()))

async function openForm(w) {
  await w.findAll('button').find(b => b.text().includes('Log Waste')).trigger('click')
  await flushPromises()
}

describe('WasteView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockApiGet.mockResolvedValue(ENTRIES())
    mockApiPost.mockResolvedValue({ ok: true })
  })

  it('lists logged waste with its details', async () => {
    const w = mount(WasteView, globalConfig)
    await flushPromises()
    expect(w.text()).toContain('Croissants')
    expect(w.text()).toContain('spoiled')
  })

  it('filters entries by category', async () => {
    const w = mount(WasteView, globalConfig)
    await flushPromises()
    expect(w.findAll('tbody tr')).toHaveLength(2)

    await w.find('select.select').setValue('Food')
    await flushPromises()
    expect(w.findAll('tbody tr')).toHaveLength(1)
    expect(w.text()).toContain('Croissants')
    expect(w.text()).not.toContain('Milk')
  })

  // The gap TestSprite kept failing to assert. An empty submit must be refused
  // visibly - a blank waste entry is worse than no entry, because it silently
  // corrupts the cost figures the manager reads.
  it('refuses an empty submission and writes nothing', async () => {
    const w = mount(WasteView, globalConfig)
    await flushPromises()
    await openForm(w)

    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(mockApiPost).not.toHaveBeenCalled()
    expect(modal(w).find('.field-error').exists()).toBe(true)
  })

  it('keeps the form open when the submission is refused', async () => {
    const w = mount(WasteView, globalConfig)
    await flushPromises()
    await openForm(w)

    await submitBtn(w).trigger('click')
    await flushPromises()

    // Closing it would discard whatever the user had already typed.
    expect(w.find('.modal').exists()).toBe(true)
  })

  it('logs an entry once the required item name is given', async () => {
    const w = mount(WasteView, globalConfig)
    await flushPromises()
    await openForm(w)

    await modal(w).findAll('input')[0].setValue('Burnt beans')
    await submitBtn(w).trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('waste', expect.objectContaining({ name: 'Burnt beans' }))
  })

  it('starts a new entry dated today rather than blank', async () => {
    const w = mount(WasteView, globalConfig)
    await flushPromises()
    await openForm(w)

    const today = new Date().toISOString().slice(0, 10)
    const values = modal(w).findAll('input').map(i => i.element.value)
    expect(values).toContain(today)
  })
})
