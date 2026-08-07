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
})
