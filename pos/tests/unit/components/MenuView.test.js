import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MenuView from '../../../src/views/MenuView.vue'

const mockApiGet = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a)
}))

const mockRoute = { query: {}, params: {} }
const mockRouter = { push: vi.fn(), replace: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  useRoute: () => mockRoute
}))

vi.mock('../../../src/components/ModifierSelectionSheet.vue', () => ({
  default: { name: 'ModifierSelectionSheet', props: ['visible', 'menuItem'], emits: ['confirm', 'cancel'], template: '<div />' }
}))

// Live categories served by /api/menu on 2026-08-14.
const LIVE_ITEMS = [
  { id: 'MI1', name: 'Tea', category: 'HOT DRINKS', price: 70, available: true, modifiers: [] },
  { id: 'MI2', name: 'Garden Salad', category: 'SALAD BOWL', price: 350, available: true, modifiers: [] },
  { id: 'MI3', name: 'Beyeaynet', category: 'ETHIOPIAN DISH', price: 350, available: true, modifiers: [] },
  { id: 'MI4', name: 'Omelette', category: 'Breakfast', price: 360, available: true, modifiers: [] },
  { id: 'MI5', name: 'Macchiato', category: 'Coffee', price: 130, available: true, modifiers: [] },
  { id: 'MI6', name: 'Soda', category: 'Drinks', price: 90, available: true, modifiers: [] }
]

function mountView() {
  return mount(MenuView, {
    global: {
      plugins: [createPinia()],
      provide: { toast: vi.fn() },
      stubs: { ModifierSelectionSheet: true }
    }
  })
}

describe('MenuView category icons', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockApiGet.mockReset()
  })

  it('renders a specific icon for every live category, not the generic fallback', async () => {
    mockApiGet.mockResolvedValue(LIVE_ITEMS)
    const wrapper = mountView()
    await flushPromises()

    const icons = wrapper.findAll('.cat-icon').map(n => n.text())
    // Order follows category insertion order: HOT DRINKS, SALAD BOWL, ETHIOPIAN DISH, Breakfast, Coffee, Drinks, then All.
    expect(icons[0]).toBe('☕')
    expect(icons[1]).toBe('🥗')
    expect(icons[2]).toBe('🫕')
    expect(icons[3]).toBe('🍳')
    expect(icons[4]).toBe('☕')
    expect(icons[5]).toBe('🥤')
    expect(icons).not.toContain('🍽️')
  })

  it('falls back to the generic plate for an unknown category', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'MIx', name: 'Mystery', category: 'UNKNOWN CATEGORY', price: 10, available: true, modifiers: [] }
    ])
    const wrapper = mountView()
    await flushPromises()
    const icon = wrapper.findAll('.cat-icon').map(n => n.text())
    expect(icon[0]).toBe('🍽️')
  })

  it('matches category names case-insensitively', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'MIy', name: 'Latte', category: 'hot drinks', price: 10, available: true, modifiers: [] }
    ])
    const wrapper = mountView()
    await flushPromises()
    const icon = wrapper.findAll('.cat-icon').map(n => n.text())
    expect(icon[0]).toBe('☕')
  })
})
