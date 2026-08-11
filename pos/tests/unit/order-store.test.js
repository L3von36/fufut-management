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

  /**
   * Takeaway and delivery capture. Before these fields existed, an address had
   * to be typed into the order notes — where the kitchen saw it and the driver
   * did not — and the delivery job the API builds had nothing to read.
   */
  describe('takeaway and delivery details', () => {
    it('charges a delivery fee on a delivery', () => {
      const store = useOrderStore()
      addMacchiato(store)
      store.orderType = 'delivery'
      store.deliveryFee = 50

      expect(store.grandTotal).toBe(180)
    })

    it('ignores a stale fee once the order is no longer a delivery', () => {
      // Switching type after typing a fee must not leave the guest paying for a
      // trip nobody is making.
      const store = useOrderStore()
      addMacchiato(store)
      store.deliveryFee = 50
      store.orderType = 'takeaway'

      expect(store.chargedDeliveryFee).toBe(0)
      expect(store.grandTotal).toBe(130)
    })

    it('does not tip on the delivery fee', () => {
      // A percentage tip is on the food, not on the trip — so the fee is added
      // after the tip is worked out, never inside its base.
      const store = useOrderStore()
      addMacchiato(store)
      store.orderType = 'delivery'
      store.deliveryFee = 50
      store.setTipPercent(10)

      expect(store.calculatedTip).toBe(13)      // 10% of 130, not of 180
      expect(store.grandTotal).toBe(193)        // 130 + 13 + 50
    })

    it('does not discount the delivery fee', () => {
      const store = useOrderStore()
      addMacchiato(store)
      store.orderType = 'delivery'
      store.deliveryFee = 50
      store.setDiscount('percentage', 10, 'Loyalty')

      expect(store.calculatedDiscount).toBe(13) // 10% of the food
      expect(store.grandTotal).toBe(167)        // 130 − 13 + 50
    })

    it('sends the address and phone the delivery job is built from', () => {
      const store = useOrderStore()
      addMacchiato(store)
      store.orderType = 'delivery'
      store.customerPhone = '0911223344'
      store.deliveryAddress = 'Bole, behind the Total station'
      store.deliveryFee = 50

      const payload = store.buildOrderPayload()
      expect(payload.customerPhone).toBe('0911223344')
      expect(payload.address).toBe('Bole, behind the Total station')
      expect(payload.deliveryFee).toBe(50)
    })

    it('omits the address on an order that is not a delivery', () => {
      const store = useOrderStore()
      addMacchiato(store)
      store.orderType = 'takeaway'
      store.customerPhone = '0911223344'
      store.deliveryAddress = 'left over from the last order'

      const payload = store.buildOrderPayload()
      expect(payload.address).toBeUndefined()
      expect(payload.customerPhone).toBe('0911223344')
    })

    it('clears the phone and address between orders', () => {
      // Carrying these over would send the next delivery to the wrong house.
      const store = useOrderStore()
      store.orderType = 'delivery'
      store.customerPhone = '0911223344'
      store.deliveryAddress = 'Bole'
      store.deliveryFee = 50

      store.resetCheckout()

      expect(store.customerPhone).toBe('')
      expect(store.deliveryAddress).toBe('')
      expect(store.deliveryFee).toBe(0)
    })
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
