import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import InventoryView from '../../../src/views/InventoryView.vue'

// Every mutation on this screen is manager-only; a chef gets "View only".
let currentRole = 'manager'
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    get roleKey() { return currentRole },
    isAuthenticated: true,
    hasPermission: (v) => ['inventory', 'kitchen', 'orders'].includes(v)
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
  ROLE_PERMISSIONS: { 'head-chef': ['inventory'] },
  ROLE_DEFAULT_VIEW: { 'head-chef': 'kitchen' },
  NAV_ITEMS: []
}))

// One low-stock item and one healthy one, so the low-stock filter has something
// to actually narrow.
const ITEMS = () => ([
  { id: 'I1', name: 'Espresso Beans', category: 'Coffee', quantity: 2, minLevel: 10, unit: 'kg', cost: 900 },
  { id: 'I2', name: 'Oat Milk', category: 'Dairy', quantity: 40, minLevel: 5, unit: 'L', cost: 120 }
])

// Named rather than inline so tests can assert what the chef was actually told
// — a refused adjustment has to say so, not fail silently.
const toastSpy = vi.fn()
const globalConfig = { global: { provide: { toast: toastSpy, confirm: vi.fn(() => Promise.resolve(true)) } } }

const modalInputs = (w) => w.find('.modal').findAll('input')

async function open() {
  mockApiGet.mockResolvedValue(ITEMS())
  const w = mount(InventoryView, globalConfig)
  await flushPromises()
  return w
}

describe('InventoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    currentRole = 'manager'
    mockApiPut.mockResolvedValue({ ok: true })
    mockApiPost.mockResolvedValue({ ok: true })
  })

  // Monitoring levels, ordering supplies and controlling food cost are the
  // duties a head chef's role is defined by, so this screen has to let them.
  describe('as a head chef', () => {
    beforeEach(() => { currentRole = 'head-chef' })

    it('can add, adjust and edit stock', async () => {
      const w = await open()
      const labels = w.findAll('button').map(b => b.text())
      expect(labels).toContain('Add Item')
      expect(labels).toContain('Edit')
      expect(labels).toContain('+1')
      expect(w.text()).not.toContain('View only')
    })

    it('records an adjustment against the item', async () => {
      const w = await open()
      await w.findAll('button').find(b => b.text() === '+1').trigger('click')
      await flushPromises()
      expect(mockApiPost).toHaveBeenCalledWith(
        'inventory/I1/adjust',
        expect.objectContaining({ qty: 1 })
      )
    })

    // Removing an item from the catalogue is a different act from recording
    // what was used, and stays with the manager.
    it('cannot delete an item from the catalogue', async () => {
      const w = await open()
      expect(w.findAll('button').map(b => b.text())).not.toContain('Delete')
    })
  })

  // An assistant works against the counts rather than setting them.
  describe('as an assistant chef', () => {
    beforeEach(() => { currentRole = 'assistant-chef' })

    it('can read stock but is offered no way to change it', async () => {
      const w = await open()
      expect(w.text()).toContain('Espresso Beans')
      expect(w.text()).toContain('View only')

      const labels = w.findAll('button').map(b => b.text())
      expect(labels).not.toContain('Edit')
      expect(labels).not.toContain('Delete')
      expect(labels).not.toContain('+1')
      expect(labels).not.toContain('Add Item')
    })

    it('can still use the filters, which are read-only', async () => {
      const w = await open()
      await w.find('select.select').setValue('low')
      await flushPromises()
      expect(w.findAll('tbody tr')).toHaveLength(1)
    })
  })

  it('lists stock with its own columns', async () => {
    const w = await open()
    expect(w.text()).toContain('Espresso Beans')
    expect(w.text()).toContain('Coffee')
    expect(w.text()).toContain('Oat Milk')
  })

  it('narrows the table to low stock and restores it', async () => {
    const w = await open()
    expect(w.findAll('tbody tr')).toHaveLength(2)

    await w.find('select.select').setValue('low')
    await flushPromises()
    // Espresso Beans is 2 against a minimum of 10; Oat Milk is comfortably above.
    expect(w.findAll('tbody tr')).toHaveLength(1)
    expect(w.text()).toContain('Espresso Beans')
    expect(w.text()).not.toContain('Oat Milk')

    await w.find('select.select').setValue('')
    await flushPromises()
    expect(w.findAll('tbody tr')).toHaveLength(2)
  })

  // The gap TestSprite kept failing to assert: the edit form must arrive
  // carrying the row's values, not empty.
  it('opens the edit form pre-filled with that row\'s existing values', async () => {
    const w = await open()
    await w.findAll('button').find(b => b.text() === 'Edit').trigger('click')
    await flushPromises()

    const values = modalInputs(w).map(i => i.element.value)
    expect(values).toContain('Espresso Beans')
    expect(values).toContain('2')     // stock quantity
    expect(values).toContain('10')    // minimum level
    expect(values).toContain('900')   // cost per unit

    // Unit is a select rather than a text box, so it is checked separately -
    // it is still a pre-filled value and would be just as wrong if blank.
    const selects = w.find('.modal').findAll('select').map(s => s.element.value)
    expect(selects).toContain('kg')
  })

  it('saves an edit against that item\'s own id', async () => {
    const w = await open()
    await w.findAll('button').find(b => b.text() === 'Edit').trigger('click')
    await flushPromises()

    const nameInput = modalInputs(w).find(i => i.element.value === 'Espresso Beans')
    await nameInput.setValue('Espresso Beans (Dark)')
    await w.findAll('button').find(b => /save|update/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiPut).toHaveBeenCalledWith('inventory/I1', expect.objectContaining({
      name: 'Espresso Beans (Dark)'
    }))
  })

  it('refuses to save an item with no name, and sends nothing', async () => {
    const w = await open()
    await w.findAll('button').find(b => b.text() === 'Edit').trigger('click')
    await flushPromises()

    const nameInput = modalInputs(w).find(i => i.element.value === 'Espresso Beans')
    await nameInput.setValue('')
    await w.findAll('button').find(b => /save|update/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiPut).not.toHaveBeenCalled()
    expect(w.find('.field-error').exists()).toBe(true)
  })

  /**
   * Quick adjust used to PUT the whole item with a new `quantity`, which
   * overwrote the previous figure and recorded nothing about who changed it.
   * Stock now moves only through the ledger, so the button posts a signed
   * delta and a reason and the server returns the resulting balance.
   */
  it('posts a signed delta rather than overwriting the quantity', async () => {
    mockApiPost.mockResolvedValue({ ok: true, stock: 3, unit: 'kg' })
    const w = await open()
    await w.findAll('button').find(b => b.text() === '+1').trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith(
      'inventory/I1/adjust',
      expect.objectContaining({ qty: 1 })
    )
    // The old write path must not be used at all — a PUT carrying a quantity is
    // now refused by the server.
    expect(mockApiPut).not.toHaveBeenCalled()
  })

  it('sends a reason with every adjustment', async () => {
    // An adjustment with no reason cannot be told apart from a mistake later,
    // and the server refuses one.
    mockApiPost.mockResolvedValue({ ok: true, stock: 3, unit: 'kg' })
    const w = await open()
    await w.findAll('button').find(b => b.text() === '+1').trigger('click')
    await flushPromises()

    const [, body] = mockApiPost.mock.calls.find(c => c[0].endsWith('/adjust'))
    expect(body.reason).toBeTruthy()
  })

  it('shows the balance the server reports rather than a locally computed one', async () => {
    // Another movement may have posted since this screen loaded, so the ledger
    // total is the only figure that is actually current.
    mockApiPost.mockResolvedValue({ ok: true, stock: 7, unit: 'kg' })
    const w = await open()
    await w.findAll('button').find(b => b.text() === '+1').trigger('click')
    await flushPromises()

    expect(w.text()).toContain('7')
  })

  it('sends a decrement as a negative delta', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'I3', name: 'Vanilla Syrup', category: 'Syrups', quantity: 0, minLevel: 2, unit: 'bottle', cost: 50 }
    ])
    mockApiPost.mockResolvedValue({ ok: true, stock: 0, unit: 'bottle' })
    const w = mount(InventoryView, globalConfig)
    await flushPromises()

    await w.findAll('button').find(b => b.text().includes('1') && b.text() !== '+1').trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith(
      'inventory/I3/adjust',
      expect.objectContaining({ qty: -1 })
    )
  })

  /**
   * The negative-stock guard moved to the server, where it belongs: the client
   * clamping at zero meant a decrement below zero silently did nothing and the
   * chef saw a success toast. The server now refuses it and says by how much.
   */
  it('surfaces the server’s refusal instead of silently clamping', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'I3', name: 'Vanilla Syrup', category: 'Syrups', quantity: 0, minLevel: 2, unit: 'bottle', cost: 50 }
    ])
    mockApiPost.mockRejectedValue(new Error('Vanilla Syrup: only 0 bottle in stock, cannot remove 1'))
    const w = mount(InventoryView, globalConfig)
    await flushPromises()

    await w.findAll('button').find(b => b.text().includes('1') && b.text() !== '+1').trigger('click')
    await flushPromises()

    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringContaining('only 0 bottle in stock'),
      'error'
    )
  })

  /**
   * Editing an item is now two acts: the catalogue record, and — only if the
   * count changed — an audited adjustment. A quantity inside the PUT is
   * refused, so it must not be sent.
   */
  it('keeps the quantity out of a catalogue edit', async () => {
    const w = await open()
    await w.findAll('button').find(b => b.text() === 'Edit').trigger('click')
    await flushPromises()

    const nameInput = modalInputs(w).find(i => i.element.value === 'Espresso Beans')
    await nameInput.setValue('Espresso Beans (Dark)')
    await w.findAll('button').find(b => /save|update/i.test(b.text())).trigger('click')
    await flushPromises()

    const [, body] = mockApiPut.mock.calls.find(c => c[0] === 'inventory/I1')
    expect(body.name).toBe('Espresso Beans (Dark)')
    expect(body).not.toHaveProperty('quantity')
    // The count did not change, so no adjustment should have been raised.
    expect(mockApiPost.mock.calls.filter(c => c[0].endsWith('/adjust'))).toHaveLength(0)
  })

  it('raises an adjustment when an edit changes the count', async () => {
    const w = await open()
    await w.findAll('button').find(b => b.text() === 'Edit').trigger('click')
    await flushPromises()

    const qtyInput = modalInputs(w).find(i => i.element.value === '2')
    await qtyInput.setValue('19.8')
    await w.findAll('button').find(b => /save|update/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith(
      'inventory/I1/adjust',
      expect.objectContaining({ newQty: 19.8 })
    )
  })
})
