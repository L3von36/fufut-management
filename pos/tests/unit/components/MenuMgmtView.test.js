import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MenuMgmtView from '../../../src/views/MenuMgmtView.vue'
import BaseButton from '../../../src/components/BaseButton.vue'

let currentRole = 'manager'
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    get roleKey() { return currentRole },
    isAuthenticated: true,
    hasPermission: () => true
  }))
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: (...a) => mockApiPut(...a),
  apiDelete: (...a) => mockApiDelete(...a),
  ROLE_PERMISSIONS: { 'head-chef': ['menu-mgmt'], manager: ['menu-mgmt'] },
  ROLE_DEFAULT_VIEW: { 'head-chef': 'kitchen' },
  NAV_ITEMS: []
}))

const ITEMS = () => ([
  { id: 'MI1', name: 'Macchiato', category: 'Espresso', price: 130, cost: 40, modifiers: '', available: true },
  { id: 'MI2', name: 'FASTING FIRFIR', category: 'Food', price: 220, cost: 90, modifiers: '', available: false }
])

const globalConfig = {
  global: { stubs: { BaseButton: false }, provide: { toast: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) } }
}

async function open() {
  mockApiGet.mockResolvedValue(ITEMS())
  const w = mount(MenuMgmtView, globalConfig)
  await flushPromises()
  return w
}

const labels = (w) => w.findAll('button').map(b => b.text())

describe('MenuMgmtView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentRole = 'manager'
    mockApiPut.mockResolvedValue({ ok: true, changedBy: 'Selam Wondimu', changedAt: '2026-08-09T18:00:00.000Z' })
  })

  describe('as a head chef', () => {
    beforeEach(() => { currentRole = 'head-chef' })

    it('can take a dish off when the kitchen runs out', async () => {
      const w = await open()
      expect(labels(w)).toContain('Mark 86')

      await w.findAll('button').find(b => b.text() === 'Mark 86').trigger('click')
      await flushPromises()

      // Its own endpoint, carrying only the flag - not the item.
      expect(mockApiPut).toHaveBeenCalledWith('menu/MI1/availability', { available: false })
    })

    it('can put a dish back on', async () => {
      const w = await open()
      await w.findAll('button').find(b => b.text() === 'Restore').trigger('click')
      await flushPromises()
      expect(mockApiPut).toHaveBeenCalledWith('menu/MI2/availability', { available: true })
    })

    // The whole point of the split: 86ing must not become repricing.
    it('is offered no way to add, edit, delete or reprice', async () => {
      const w = await open()
      const l = labels(w)
      expect(l).not.toContain('+ Add Item')
      expect(l).not.toContain('Edit')
      expect(l).not.toContain('Delete')
    })

    it('is not shown cost or margin', async () => {
      const w = await open()
      const heads = w.findAll('th').map(h => h.text())
      expect(heads).toContain('Price')
      expect(heads).not.toContain('Cost')
      expect(heads).not.toContain('Margin')
    })

    it('records who changed availability', async () => {
      const w = await open()
      await w.findAll('button').find(b => b.text() === 'Mark 86').trigger('click')
      await flushPromises()
      expect(w.text()).toContain('Selam Wondimu')
    })

    it('leaves the dish on if the server refuses', async () => {
      mockApiPut.mockRejectedValue(new Error('Your role does not have access to this data'))
      const w = await open()
      await w.findAll('button').find(b => b.text() === 'Mark 86').trigger('click')
      await flushPromises()
      // Not flipped optimistically, so the board never claims a dish is off
      // when the kitchen is still being asked for it.
      expect(labels(w)).toContain('Mark 86')
    })
  })

  describe('as a manager', () => {
    it('keeps the full menu controls', async () => {
      const w = await open()
      const l = labels(w)
      expect(l).toContain('+ Add Item')
      expect(l).toContain('Edit')
      expect(l).toContain('Mark 86')
    })

    it('is shown cost and margin', async () => {
      const w = await open()
      const heads = w.findAll('th').map(h => h.text())
      expect(heads).toContain('Cost')
      expect(heads).toContain('Margin')
    })
  })
})
