import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOrderStore } from '../../src/stores/order'

function addMacchiato(store) {
  store.addItem({ menuItemId: 'M002', name: 'Macchiato', basePrice: 130 })
}

describe('Order Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('tip defaults', () => {
    // Regression: tipType defaulted to 'percentage' at 10%, so a fresh cart
    // quietly billed ETB 143 for a 130 ETB coffee before anyone chose a tip.
    it('applies no tip until one is explicitly chosen', () => {
      const store = useOrderStore()
      addMacchiato(store)

      expect(store.tipType).toBe('none')
      expect(store.calculatedTip).toBe(0)
      expect(store.grandTotal).toBe(130)
    })

    it('keeps grandTotal equal to cartTotal on a fresh cart', () => {
      const store = useOrderStore()
      addMacchiato(store)

      // The floating cart and the cart sheet must never show two different
      // totals for the same order.
      expect(store.grandTotal).toBe(store.cartTotal)
    })

    it('still applies a tip once the user selects one', () => {
      const store = useOrderStore()
      addMacchiato(store)
      store.setTipPercent(10)

      expect(store.calculatedTip).toBe(13)
      expect(store.grandTotal).toBe(143)
    })
  })

  describe('order context across checkout', () => {
    // Regression: moving cart -> checkout called resetCheckout(), which wiped
    // tableNum, so the table the waiter picked never reached the order.
    it('preserves table, type and customer when keepOrderContext is set', () => {
      const store = useOrderStore()
      store.tableNum = '7'
      store.orderType = 'dine-in'
      store.customerName = 'Selam'
      store.tendered = 500

      store.resetCheckout({ keepOrderContext: true })

      expect(store.tableNum).toBe('7')
      expect(store.orderType).toBe('dine-in')
      expect(store.customerName).toBe('Selam')
      // Payment state is still cleared.
      expect(store.tendered).toBe(0)
    })

    it('clears order context by default', () => {
      const store = useOrderStore()
      store.tableNum = '7'
      store.customerName = 'Selam'

      store.resetCheckout()

      expect(store.tableNum).toBe('')
      expect(store.customerName).toBe('')
    })

    it('carries the table number into the order payload', () => {
      const store = useOrderStore()
      addMacchiato(store)
      store.tableNum = '7'

      expect(store.buildOrderPayload().tableNum).toBe('7')
    })
  })

  describe('order notes', () => {
    // Regression: notes were bound in the checkout UI but never serialized,
    // so allergy/prep instructions were silently dropped before the kitchen.
    it('includes order notes in the payload', () => {
      const store = useOrderStore()
      addMacchiato(store)
      store.notes = 'No dairy — allergy'

      expect(store.buildOrderPayload().notes).toBe('No dairy — allergy')
    })

    it('omits notes when blank rather than sending empty strings', () => {
      const store = useOrderStore()
      addMacchiato(store)
      store.notes = '   '

      expect(store.buildOrderPayload().notes).toBeUndefined()
    })

    it('does not leak notes into the next order', () => {
      const store = useOrderStore()
      addMacchiato(store)
      store.notes = 'No dairy — allergy'

      store.resetFull()

      expect(store.notes).toBe('')
      expect(store.buildOrderPayload().notes).toBeUndefined()
    })
  })

  describe('cart line identity', () => {
    // Regression: /api/menu served every item with id:"", so dedupKey collapsed
    // to the same string for all 45 products. Adding a 130 macchiato to a cart
    // holding a 65 coffee merged into the coffee's line and billed 2 x 65 = 130
    // instead of 195, and the macchiato never reached the kitchen.
    it('keeps two different items on separate lines even with blank ids', () => {
      const store = useOrderStore()
      store.addItem({ menuItemId: '', name: 'Tridintional coffee', basePrice: 65 })
      store.addItem({ menuItemId: '', name: 'Macchiato', basePrice: 130 })

      expect(store.items).toHaveLength(2)
      expect(store.cartItemCount).toBe(2)
      expect(store.cartTotal).toBe(195)
    })

    it('does not let a third blank-id item inherit the first price', () => {
      const store = useOrderStore()
      store.addItem({ menuItemId: '', name: 'Tridintional coffee', basePrice: 65 })
      store.addItem({ menuItemId: '', name: 'Macchiato', basePrice: 130 })
      store.addItem({ menuItemId: '', name: 'TEA', basePrice: 70 })

      expect(store.items).toHaveLength(3)
      expect(store.cartTotal).toBe(265)
    })

    it('still merges genuine repeats of the same item into one line', () => {
      const store = useOrderStore()
      addMacchiato(store)
      addMacchiato(store)

      expect(store.items).toHaveLength(1)
      expect(store.items[0].qty).toBe(2)
      expect(store.cartTotal).toBe(260)
    })

    it('separates the same item when its price differs', () => {
      // The live menu carries two dishes both named "Fut Special Gebeta" at
      // 1400 and 900. They must not merge.
      const store = useOrderStore()
      store.addItem({ menuItemId: '', name: 'Fut Special Gebeta', basePrice: 1400 })
      store.addItem({ menuItemId: '', name: 'Fut Special Gebeta', basePrice: 900 })

      expect(store.items).toHaveLength(2)
      expect(store.cartTotal).toBe(2300)
    })
  })

  describe('cart persistence', () => {
    // Regression: the cart was memory-only, so a refresh on a tablet discarded
    // an order the waiter may already have read back to the guest.
    it('restores items and table context into a new store instance', () => {
      const first = useOrderStore()
      first.addItem({ menuItemId: 'M002', name: 'Macchiato', basePrice: 130 })
      first.tableNum = '4'
      first.persist()

      // A reload means a fresh pinia and a fresh store, same localStorage.
      setActivePinia(createPinia())
      const afterReload = useOrderStore()

      expect(afterReload.items).toHaveLength(1)
      expect(afterReload.cartTotal).toBe(130)
      expect(afterReload.tableNum).toBe('4')
    })

    it('discards a cart older than one shift', () => {
      const store = useOrderStore()
      store.addItem({ menuItemId: 'M002', name: 'Macchiato', basePrice: 130 })
      store.persist()

      // Backdate the saved blob by 13 hours.
      const saved = JSON.parse(localStorage.getItem('fufut.pos.cart.v1'))
      saved.savedAt = Date.now() - 13 * 60 * 60 * 1000
      localStorage.setItem('fufut.pos.cart.v1', JSON.stringify(saved))

      setActivePinia(createPinia())
      const afterReload = useOrderStore()

      expect(afterReload.items).toHaveLength(0)
      expect(localStorage.getItem('fufut.pos.cart.v1')).toBeNull()
    })

    it('clears the persisted cart when the order completes', () => {
      const store = useOrderStore()
      store.addItem({ menuItemId: 'M002', name: 'Macchiato', basePrice: 130 })
      store.persist()
      expect(localStorage.getItem('fufut.pos.cart.v1')).not.toBeNull()

      store.resetFull()

      expect(localStorage.getItem('fufut.pos.cart.v1')).toBeNull()
    })

    it('ignores a malformed persisted blob instead of throwing', () => {
      localStorage.setItem('fufut.pos.cart.v1', '{not json')

      setActivePinia(createPinia())
      const store = useOrderStore()

      expect(store.items).toHaveLength(0)
    })
  })
})
