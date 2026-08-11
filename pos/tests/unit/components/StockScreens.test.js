import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

let currentRole = 'manager'
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    get roleKey() { return currentRole },
    isAuthenticated: true,
    hasPermission: () => true,
  })),
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: (...a) => mockApiPut(...a),
  apiDelete: vi.fn(),
  ROLE_PERMISSIONS: {},
  ROLE_DEFAULT_VIEW: {},
  NAV_ITEMS: [],
  TODAY: () => '2026-08-10',
}))

import RecipesView from '../../../src/views/RecipesView.vue'
import StockControlView from '../../../src/views/StockControlView.vue'

const toastSpy = vi.fn()
const globalConfig = {
  global: { provide: { toast: toastSpy, confirm: vi.fn(() => Promise.resolve(true)) } },
}

const INVENTORY = [
  { id: 'I-coffee', name: 'Coffee beans', unit: 'kg', quantity: 20, stock: 20, cost: 1000, avg_cost: 1000 },
  { id: 'I-milk', name: 'Milk', unit: 'l', quantity: 80, stock: 80, cost: 60, avg_cost: 60 },
  { id: 'I-cup', name: 'Takeaway cup', unit: 'piece', quantity: 900, stock: 900, cost: 5, avg_cost: 5 },
]

const MENU = {
  restaurant: 'FU FUT COFFEE',
  categories: [
    { name: 'Coffee', items: [
      { id: 'M-macch', name: 'Macchiato', price: 60 },
      { id: 'M-tea', name: 'Tea', price: 30 },
    ] },
  ],
}

const RECIPES = {
  recipes: [
    {
      id: 'RC1', menu_item_id: 'M-macch', menu_item_name: 'Macchiato', menu_item_price: 60,
      name: 'Macchiato', version: 2, status: 'active', yield_qty: 1, lineCount: 3,
      cost: { ingredientCost: 25.2, packagingCost: 5, totalCost: 30.2 },
      margin: { price: 60, cost: 30.2, grossMargin: 29.8, grossMarginPct: 49.7 },
    },
  ],
}

function recipesRoutes(endpoint) {
  if (endpoint === 'recipes') return Promise.resolve(RECIPES)
  if (endpoint === 'inventory') return Promise.resolve(INVENTORY)
  if (endpoint === 'menu') return Promise.resolve(MENU)
  if (endpoint === 'units') {
    return Promise.resolve({
      units: {
        mass: [{ unit: 'g', label: 'g' }, { unit: 'kg', label: 'kg' }],
        volume: [{ unit: 'ml', label: 'ml' }, { unit: 'l', label: 'l' }],
        count: [{ unit: 'piece', label: 'piece' }, { unit: 'box', label: 'box' }],
      },
    })
  }
  return Promise.resolve({})
}

describe('RecipesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentRole = 'manager'
    mockApiGet.mockImplementation(recipesRoutes)
    mockApiPost.mockResolvedValue({ ok: true, id: 'RC2', version: 1 })
  })

  const open = async () => {
    const w = mount(RecipesView, globalConfig)
    await flushPromises()
    return w
  }

  /**
   * The engine is inert without recipes: a dish with no BOM consumes nothing
   * when it sells. If this screen does not say so, nothing else will.
   */
  it('warns that dishes without a recipe do not reduce stock', async () => {
    const w = await open()
    expect(w.text()).toMatch(/no recipe/i)
    expect(w.text()).toMatch(/does not reduce stock/i)
  })

  it('lists exactly the menu items that have no recipe', async () => {
    const w = await open()
    // Macchiato is covered by RC1; Tea is not.
    expect(w.text()).toContain('Tea')
    expect(w.find('.alert-banner').text()).toContain('1')
  })

  it('shows ingredient and packaging cost separately', async () => {
    const w = await open()
    const row = w.find('tbody tr')
    expect(row.text()).toContain('25')  // ingredient
    expect(row.text()).toContain('5')   // packaging
  })

  it('calls the margin a gross margin, never a profit', async () => {
    const w = await open()
    expect(w.text()).toMatch(/gross margin/i)
    expect(w.text().toLowerCase()).not.toContain('net profit')
  })

  it('says a revision creates a new version rather than editing in place', async () => {
    const w = await open()
    mockApiGet.mockImplementation((e) => {
      if (e === 'recipes/RC1') {
        return Promise.resolve({
          recipe: { ...RECIPES.recipes[0], lines: [{ inventory_id: 'I-coffee', qty: 18, unit: 'g', is_packaging: 0 }] },
          cost: RECIPES.recipes[0].cost,
        })
      }
      return recipesRoutes(e)
    })
    await w.findAll('button').find(b => b.text() === 'Revise').trigger('click')
    await flushPromises()

    // v2 is active, so saving must be presented as producing v3.
    expect(w.find('.modal').text()).toMatch(/version\s*3/i)
    expect(w.find('.modal').text()).toMatch(/past sales keep/i)
  })

  it('refuses to save a recipe with no ingredients', async () => {
    const w = await open()
    await w.findAll('button').find(b => b.text().includes('New Recipe')).trigger('click')
    await flushPromises()
    const nameInput = w.find('.modal').findAll('input')[0]
    await nameInput.setValue('Test')
    await w.findAll('button').find(b => /create recipe/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiPost).not.toHaveBeenCalled()
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/ingredient/i), 'error')
  })

  /**
   * The server validates each line's unit against how the item is stocked and
   * returns a list. Collapsing that into one toast would hide which line is
   * wrong on a five-ingredient recipe.
   */
  it('shows the server’s per-line complaints in place', async () => {
    mockApiPost.mockResolvedValue({
      ok: false,
      error: 'Recipe is not valid',
      problems: ['Line 1 (Sugar): recipe is in ml but the item is stocked in kg'],
    })
    const w = await open()
    await w.findAll('button').find(b => b.text().includes('New Recipe')).trigger('click')
    await flushPromises()
    await w.find('.modal').findAll('input')[0].setValue('Broken')
    await w.findAll('button').find(b => /add ingredient/i.test(b.text())).trigger('click')
    await flushPromises()
    await w.findAll('button').find(b => /create recipe/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(w.find('.modal').text()).toContain('stocked in kg')
  })

  /**
   * 35 of the 41 live recipes carry quantities I estimated, flagged
   * `provisional = 1`. The ingredient lists are sound; the amounts are guesses,
   * so every cost and margin derived from them is a guess too.
   *
   * The flag was already returned by the API and shown nowhere, which is the
   * worst of both: the kitchen cannot tell which dishes need real weights, and
   * the costs on this screen read as measured fact. These tests exist so the
   * distinction cannot quietly disappear again.
   */
  const withProvisional = (endpoint) => {
    if (endpoint === 'recipes') {
      return Promise.resolve({
        recipes: [
          { ...RECIPES.recipes[0], provisional: 1 },
          {
            ...RECIPES.recipes[0], id: 'RC9', menu_item_id: 'M-tea',
            menu_item_name: 'Tea', name: 'Tea', provisional: 0,
          },
        ],
      })
    }
    return recipesRoutes(endpoint)
  }

  it('marks a recipe whose quantities are still estimates', async () => {
    mockApiGet.mockImplementation(withProvisional)
    const w = await open()
    const rows = w.findAll('tbody tr')
    const macch = rows.find((r) => r.text().includes('Macchiato'))
    const tea = rows.find((r) => r.text().includes('Tea'))
    expect(macch.text()).toMatch(/estimate/i)
    expect(tea.text()).not.toMatch(/estimate/i)
  })

  it('says how many recipes still need real quantities', async () => {
    mockApiGet.mockImplementation(withProvisional)
    const w = await open()
    expect(w.text()).toMatch(/1[\s\S]{0,40}estimated/i)
  })

  it('can narrow the list to just those needing real quantities', async () => {
    mockApiGet.mockImplementation(withProvisional)
    const w = await open()
    const select = w.find('select')
    await select.setValue('provisional')
    const rows = w.findAll('tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Macchiato')
  })

  /**
   * A cost computed from a guessed weight is a guessed cost. Presenting it in
   * the same style as a measured one is how an estimate gets quoted back as
   * fact in a price decision.
   */
  it('does not present a provisional margin as settled', async () => {
    mockApiGet.mockImplementation(withProvisional)
    const w = await open()
    const macch = w.findAll('tbody tr').find((r) => r.text().includes('Macchiato'))
    expect(macch.html()).toMatch(/provisional|estimate/i)
  })

  it('keeps recipe editing away from the assistant chef', async () => {
    currentRole = 'assistant-chef'
    const w = await open()
    const labels = w.findAll('button').map(b => b.text())
    expect(labels.some(l => l.includes('New Recipe'))).toBe(false)
    expect(labels).not.toContain('Revise')
    // Still reads them — they cook from these.
    expect(labels).toContain('Can Make')
  })
})

describe('StockControlView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint.startsWith('inventory/reorder')) {
        return Promise.resolve({
          count: 1, estimatedTotal: 33000,
          items: [{
            inventoryId: 'I-coffee', name: 'Coffee beans', unit: 'kg',
            currentStock: 12, reorderPoint: 15, targetStock: 45, suggestedQty: 33,
            estimatedCost: 33000, urgency: 'low', preferredSupplier: 'ABC Coffee',
          }],
        })
      }
      if (endpoint.startsWith('inventory/variance')) {
        return Promise.resolve({
          note: 'Variance is a question, not a finding.',
          items: [{
            inventoryId: 'I-coffee', name: 'Coffee beans', unit: 'kg',
            expected: 1.8, actual: 2.2, variance: 0.4, variancePct: 22.2,
            wasted: 0, direction: 'over',
            possibleReasons: ['Waste or spillage', 'Portions larger than the recipe'],
          }],
        })
      }
      if (endpoint === 'inventory') return Promise.resolve(INVENTORY)
      return Promise.resolve({ items: [] })
    })
    mockApiPost.mockResolvedValue({ ok: true, countId: 'SC1', items: [] })
  })

  const open = async () => {
    const w = mount(StockControlView, globalConfig)
    await flushPromises()
    return w
  }

  it('opens on the reorder list with a recommended quantity', async () => {
    const w = await open()
    expect(w.text()).toContain('Coffee beans')
    expect(w.text()).toContain('33')
    expect(w.text()).toContain('ABC Coffee')
  })

  /**
   * The spec is explicit that a variance must not be presented as a finding
   * about people. The explanation leads the table rather than trailing it.
   */
  it('frames variance as a question and never names theft', async () => {
    const w = await open()
    await w.findAll('button.tab').find(b => b.text() === 'Variance').trigger('click')
    await flushPromises()

    expect(w.find('.tab-note').text()).toMatch(/question, not a finding/i)
    expect(w.text().toLowerCase()).not.toContain('theft')
    expect(w.text()).toContain('Waste or spillage')
  })

  it('posts only the rows somebody actually counted', async () => {
    const w = await open()
    await w.findAll('button.tab').find(b => /stock count/i.test(b.text())).trigger('click')
    await flushPromises()

    // Count one of the three items; the other two are left blank.
    await w.findAll('input.count-input')[0].setValue('19.8')
    await w.findAll('button').find(b => /post count/i.test(b.text())).trigger('click')
    await flushPromises()

    const [, body] = mockApiPost.mock.calls.find(c => c[0] === 'inventory/count')
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ inventoryId: 'I-coffee', countedQty: 19.8 })
  })

  /**
   * A blank is "not counted", not zero. Treating it as zero would write off
   * every item nobody got to.
   */
  it('refuses to post a count sheet where nothing was entered', async () => {
    const w = await open()
    await w.findAll('button.tab').find(b => /stock count/i.test(b.text())).trigger('click')
    await flushPromises()

    await w.findAll('button').find(b => /post count/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('shows the variance against the system figure as it is typed', async () => {
    const w = await open()
    await w.findAll('button.tab').find(b => /stock count/i.test(b.text())).trigger('click')
    await flushPromises()

    await w.findAll('input.count-input')[0].setValue('19.8')
    await flushPromises()
    // System says 20, counted 19.8 → −0.20
    expect(w.text()).toContain('-0.20')
  })
})
