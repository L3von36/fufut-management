import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Order Store — Phase 1: Structured cart with modifier support.
 * Phase 2: Tip, discount, split bill, multi-payment.
 *
 * Cart item shape:
 * {
 *   uid: string,            // unique line id (dedup key)
 *   menuItemId: string,     // menu item id (M001)
 *   name: string,           // display name
 *   basePrice: number,      // base price from menu
 *   qty: number,            // quantity
 *   selectedModifiers: [{ name, priceDelta, type }],
 *   notes: string           // special instructions
 * }
 */

let _uidCounter = 0
function uid() { return 'c' + Date.now().toString(36) + (++_uidCounter).toString(36) }

function dedupKey(menuItemId, selectedModifiers, notes) {
  const modNames = (selectedModifiers || [])
    .map(m => m.name)
    .slice()
    .sort()
    .join('|')
  return `${menuItemId}::${modNames}::${(notes || '').trim().toLowerCase()}`
}

export const useOrderStore = defineStore('order', () => {
  // ─── Cart State ───
  const items = ref([])
  const notes = ref('')  // order-level notes (table, customer, etc.)

  // ─── Checkout State ───
  const paymentMethod = ref('cash')     // cash | card | mobile
  const tendered = ref(0)               // cash amount tendered
  const orderType = ref('dine-in')      // dine-in | takeaway | delivery
  const tableNum = ref('')
  const customerName = ref('')
  const checkoutStep = ref('cart')      // cart | payment | processing | success
  const lastOrderId = ref(null)
  const lastOrderError = ref(null)

  // ─── Phase 2: Tip ───
  // Defaults to 'none': a tip must be chosen explicitly by staff/guest, never
  // pre-applied to the bill.
  const tipType = ref('none')            // 'percentage' | 'fixed' | 'none'
  const tipPercent = ref(10)             // preset: 10, 15, 20
  const tipAmount = ref(0)               // fixed ETB amount

  // ─── Phase 2: Discount ───
  const discountType = ref('none')       // 'none' | 'percentage' | 'fixed'
  const discountValue = ref(0)           // 10 means 10% or ETB 10
  const discountReason = ref('')         // e.g. "Loyalty discount"

  // ─── Phase 2: Split Bill ───
  const splitEnabled = ref(false)
  const splitPayments = ref([])          // [{ method: 'cash'|'card'|'mobile', amount: number }]

  // ─── Getters ───
  const subtotal = computed(() =>
    items.value.reduce((sum, item) => sum + lineTotal(item) * item.qty, 0)
  )

  const cartTotal = computed(() =>
    items.value.reduce((sum, item) => sum + lineTotal(item) * item.qty, 0)
  )

  const cartItemCount = computed(() =>
    items.value.reduce((sum, item) => sum + item.qty, 0)
  )

  const isEmpty = computed(() => items.value.length === 0)

  // ─── Phase 2: Tip Computed ───
  const calculatedTip = computed(() => {
    if (tipType.value === 'none') return 0
    if (tipType.value === 'fixed') return Math.max(0, tipAmount.value || 0)
    // percentage
    return Math.round(subtotal.value * (tipPercent.value || 0) / 100 * 100) / 100
  })

  // ─── Phase 2: Discount Computed ───
  const calculatedDiscount = computed(() => {
    if (discountType.value === 'none') return 0
    if (discountType.value === 'fixed') return Math.min(Math.max(0, discountValue.value || 0), subtotal.value)
    // percentage — cap at 100%
    const pct = Math.min(100, Math.max(0, discountValue.value || 0))
    return Math.round(subtotal.value * pct / 100 * 100) / 100
  })

  // ─── Phase 2: Grand Total ───
  const grandTotal = computed(() => {
    return Math.max(0, subtotal.value - calculatedDiscount.value + calculatedTip.value)
  })

  // ─── Phase 2: Split Validation ───
  const splitRemaining = computed(() => {
    if (!splitEnabled.value) return 0
    const paid = splitPayments.value.reduce((s, p) => s + (p.amount || 0), 0)
    return Math.max(0, Math.round((grandTotal.value - paid) * 100) / 100)
  })

  const splitIsValid = computed(() => {
    if (!splitEnabled.value) return true
    const paid = splitPayments.value.reduce((s, p) => s + (p.amount || 0), 0)
    return Math.abs(paid - grandTotal.value) < 0.5 // within 50 cents
  })

  // ─── Line helpers ───
  function lineTotal(item) {
    const modExtra = (item.selectedModifiers || []).reduce((s, m) => s + (m.priceDelta || 0), 0)
    return item.basePrice + modExtra
  }

  function lineSummary(item) {
    const modNames = (item.selectedModifiers || []).map(m => m.name).join(', ')
    const parts = [item.name]
    if (modNames) parts.push(`[${modNames}]`)
    if (item.notes) parts.push(`(${item.notes})`)
    return parts.join(' ')
  }

  // ─── Actions ───
  function addItem({ menuItemId, name, basePrice, selectedModifiers = [], notes = '' }) {
    const key = dedupKey(menuItemId, selectedModifiers, notes)
    const existing = items.value.find(i => i._key === key)
    if (existing) {
      existing.qty++
      return
    }
    items.value.push({
      uid: uid(),
      _key: key,
      menuItemId,
      name,
      basePrice: parseFloat(basePrice) || 0,
      qty: 1,
      selectedModifiers: selectedModifiers.map(m => ({
        name: m.name,
        priceDelta: parseFloat(m.priceDelta) || 0,
        type: m.type || 'option'
      })),
      notes: notes.trim()
    })
  }

  function removeItem(uid) {
    const idx = items.value.findIndex(i => i.uid === uid)
    if (idx >= 0) items.value.splice(idx, 1)
  }

  function updateQty(uid, qty) {
    const item = items.value.find(i => i.uid === uid)
    if (!item) return
    if (qty <= 0) { removeItem(uid); return }
    item.qty = qty
  }

  function incrementQty(uid) {
    const item = items.value.find(i => i.uid === uid)
    if (item) item.qty++
  }

  function decrementQty(uid) {
    const item = items.value.find(i => i.uid === uid)
    if (!item) return
    if (item.qty <= 1) { removeItem(uid); return }
    item.qty--
  }

  function clearCart() {
    items.value = []
  }

  // ─── Checkout Getters ───
  const changeDue = computed(() => {
    if (paymentMethod.value !== 'cash' || splitEnabled.value) return 0
    return Math.max(0, tendered.value - grandTotal.value)
  })

  const amountDue = computed(() => {
    if (splitEnabled.value) return splitRemaining.value
    if (paymentMethod.value === 'cash') return Math.max(0, grandTotal.value - tendered.value)
    return grandTotal.value
  })

  const canProcess = computed(() => {
    if (isEmpty.value) return false
    if (splitEnabled.value) return splitIsValid.value
    if (paymentMethod.value === 'cash' && tendered.value < grandTotal.value) return false
    return true
  })

  const isCheckoutActive = computed(() =>
    checkoutStep.value === 'cart' || checkoutStep.value === 'payment'
  )

  // ─── Checkout Actions ───
  function setPaymentMethod(method) {
    paymentMethod.value = method
    if (method !== 'cash') tendered.value = 0
  }

  // ─── Phase 2: Tip Actions ───
  function setTipType(type) {
    tipType.value = type
    if (type === 'none') { tipAmount.value = 0; tipPercent.value = 10 }
  }

  function setTipPercent(pct) {
    tipPercent.value = pct
    tipType.value = 'percentage'
  }

  function setTipAmount(amt) {
    tipAmount.value = amt
    tipType.value = 'fixed'
  }

  function clearTip() {
    tipType.value = 'none'
    tipAmount.value = 0
    tipPercent.value = 10
  }

  // ─── Phase 2: Discount Actions ───
  function setDiscount(type, value, reason) {
    discountType.value = type
    discountValue.value = parseFloat(value) || 0
    discountReason.value = reason || ''
  }

  function clearDiscount() {
    discountType.value = 'none'
    discountValue.value = 0
    discountReason.value = ''
  }

  // ─── Phase 2: Split Bill Actions ───
  function toggleSplit() {
    splitEnabled.value = !splitEnabled.value
    if (!splitEnabled.value) {
      splitPayments.value = []
      tendered.value = 0
    } else {
      splitPayments.value = []
      tendered.value = 0
    }
  }

  function addSplitPayment(method) {
    const remaining = splitRemaining.value
    if (remaining <= 0) return
    splitPayments.value.push({ method, amount: Math.round(remaining * 100) / 100 })
  }

  function removeSplitPayment(index) {
    splitPayments.value.splice(index, 1)
  }

  function updateSplitPaymentAmount(index, amount) {
    if (splitPayments.value[index]) {
      splitPayments.value[index].amount = Math.max(0, parseFloat(amount) || 0)
    }
  }

  /**
   * Clear payment/checkout state.
   * @param {object} [opts]
   * @param {boolean} [opts.keepOrderContext] - preserve who/where the order is
   *   for (type, table, customer). Set when moving cart → checkout, so the
   *   table the waiter started from is not wiped.
   */
  function resetCheckout({ keepOrderContext = false } = {}) {
    checkoutStep.value = 'cart'
    tendered.value = 0
    paymentMethod.value = 'cash'
    if (!keepOrderContext) {
      orderType.value = 'dine-in'
      tableNum.value = ''
      customerName.value = ''
      // Notes belong to the order they were written for — never carry them over.
      notes.value = ''
    }
    lastOrderId.value = null
    lastOrderError.value = null
    // Phase 2 resets
    clearTip()
    clearDiscount()
    splitEnabled.value = false
    splitPayments.value = []
  }

  function resetFull() {
    clearCart()
    resetCheckout()
  }

  // ─── Serialization ───
  /** Legacy flat string */
  function flatItemsString() {
    return items.value.map(i => {
      const modStr = (i.selectedModifiers || []).map(m => m.name).join(', ')
      const noteStr = i.notes ? ` (${i.notes})` : ''
      const modPart = modStr ? ` [${modStr}]` : ''
      return `${i.qty}x${i.name}${modPart}${noteStr}`
    }).join(', ')
  }

  /** Structured array for analytics / kitchen parsing */
  function serializeOrderItems() {
    return items.value.map(i => ({
      menuItemId: i.menuItemId,
      name: i.name,
      basePrice: i.basePrice,
      qty: i.qty,
      lineTotal: Math.round(lineTotal(i) * i.qty * 100) / 100,
      modifiers: (i.selectedModifiers || []).map(m => ({
        name: m.name,
        priceDelta: m.priceDelta
      })),
      notes: i.notes || undefined
    }))
  }

  /** Build payment breakdown for payload */
  function buildPaymentBreakdown() {
    if (splitEnabled.value && splitPayments.value.length > 0) {
      return splitPayments.value.map(p => ({
        method: p.method,
        amount: Math.round(p.amount * 100) / 100
      }))
    }
    return [{
      method: paymentMethod.value,
      amount: Math.round(grandTotal.value * 100) / 100,
      tendered: paymentMethod.value === 'cash' ? tendered.value : undefined,
      change: paymentMethod.value === 'cash' ? changeDue.value : undefined
    }]
  }

  /** Full order payload */
  function buildOrderPayload(overrides = {}) {
    const base = {
      items: flatItemsString(),
      orderItems: serializeOrderItems(),
      subtotal: Math.round(subtotal.value * 100) / 100,
      total: Math.round(grandTotal.value * 100) / 100,
      status: 'new',
      payment: splitEnabled.value
        ? splitPayments.value.map(p => p.method).join('+')
        : paymentMethod.value,
      type: orderType.value,
      tableNum: tableNum.value || undefined,
      customer: customerName.value || 'Walk-in',
      // Order-level notes (allergies, prep instructions) must reach the kitchen.
      notes: notes.value?.trim() || undefined,
      // Phase 2: Tip
      tip: Math.round(calculatedTip.value * 100) / 100,
      tipType: tipType.value,
      // Phase 2: Discount
      discount: Math.round(calculatedDiscount.value * 100) / 100,
      discountType: discountType.value,
      discountReason: discountReason.value || undefined,
      // Phase 2: Payment breakdown
      paymentBreakdown: buildPaymentBreakdown()
    }
    return { ...base, ...overrides }
  }

  return {
    // Cart State
    items,
    notes,
    // Cart Getters
    subtotal,
    cartTotal,
    cartItemCount,
    isEmpty,
    // Cart Helpers
    lineTotal,
    lineSummary,
    // Cart Actions
    addItem,
    removeItem,
    updateQty,
    incrementQty,
    decrementQty,
    clearCart,
    // Checkout State
    paymentMethod,
    tendered,
    orderType,
    tableNum,
    customerName,
    checkoutStep,
    lastOrderId,
    lastOrderError,
    // Phase 2: Tip
    tipType,
    tipPercent,
    tipAmount,
    calculatedTip,
    setTipType,
    setTipPercent,
    setTipAmount,
    clearTip,
    // Phase 2: Discount
    discountType,
    discountValue,
    discountReason,
    calculatedDiscount,
    setDiscount,
    clearDiscount,
    // Phase 2: Split Bill
    splitEnabled,
    splitPayments,
    splitRemaining,
    splitIsValid,
    toggleSplit,
    addSplitPayment,
    removeSplitPayment,
    updateSplitPaymentAmount,
    // Phase 2: Grand Total
    grandTotal,
    // Checkout Getters
    changeDue,
    amountDue,
    canProcess,
    isCheckoutActive,
    // Checkout Actions
    setPaymentMethod,
    resetCheckout,
    resetFull,
    // Serialization
    flatItemsString,
    serializeOrderItems,
    buildPaymentBreakdown,
    buildOrderPayload
  }
})
