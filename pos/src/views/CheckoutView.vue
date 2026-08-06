<template>
  <div class="checkout-shell">
    <!-- Step: Cart Review -->
    <template v-if="step === 'cart'">
      <div class="checkout-header">
        <h3>Review Order</h3>
        <span class="checkout-badge">{{ store.cartItemCount }} items</span>
      </div>

      <!-- Order details row -->
      <div class="checkout-details-row">
        <div class="form-group" style="margin:0;flex:1">
          <label>Type</label>
          <select v-model="store.orderType" class="select select-sm">
            <option value="dine-in">Dine In</option>
            <option value="takeaway">Takeaway</option>
            <option value="delivery">Delivery</option>
          </select>
        </div>
        <div v-if="store.orderType==='dine-in'" class="form-group" style="margin:0;flex:1">
          <label>Table #</label>
          <input v-model="store.tableNum" placeholder="e.g. 5" class="input input-sm" />
        </div>
        <div class="form-group" style="margin:0;flex:1">
          <label>Customer</label>
          <input v-model="store.customerName" placeholder="Walk-in" class="input input-sm" />
        </div>
      </div>

      <!-- Cart lines -->
      <div class="checkout-lines" v-if="store.items.length">
        <div v-for="entry in store.items" :key="entry.uid" class="checkout-line">
          <div class="cl-info">
            <div class="cl-name">{{ store.lineSummary(entry) }}</div>
            <div class="cl-unit">ETB {{ store.lineTotal(entry).toFixed(0) }} each</div>
          </div>
          <div class="cl-qty">
            <button class="qty-btn" @click="store.decrementQty(entry.uid)">−</button>
            <span class="qty-val">{{ entry.qty }}</span>
            <button class="qty-btn" @click="store.incrementQty(entry.uid)">+</button>
          </div>
          <div class="cl-total">ETB {{ (store.lineTotal(entry) * entry.qty).toFixed(0) }}</div>
          <button class="cl-remove" @click="store.removeItem(entry.uid)">✕</button>
        </div>
      </div>

      <div v-else class="empty-state" style="padding:48px 20px">
        <div class="empty-state-icon">🍯</div>
        <div>Your cart is empty</div>
        <button class="btn btn-primary" style="margin-top:16px" @click="$router.push('/app/menu-view')">Browse Menu</button>
      </div>

      <!-- Order-level notes -->
      <div v-if="store.items.length" class="checkout-notes">
        <input v-model="store.notes" type="text" class="input" placeholder="Order notes (e.g. no onions on everything)..." />
      </div>

      <!-- Cart footer -->
      <div v-if="store.items.length" class="checkout-cart-footer">
        <div class="ccf-total">
          <span>Total</span>
          <span class="ccf-amount">ETB {{ store.grandTotal.toFixed(0) }}</span>
        </div>
        <button class="btn btn-primary ctf-btn" @click="goToPayment">
          Continue to Payment
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </template>

    <!-- Step: Payment -->
    <template v-if="step === 'payment'">
      <div class="checkout-header">
        <button class="btn btn-sm btn-ghost" @click="step='cart'" style="margin-right:8px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <h3>Payment</h3>
        <span class="checkout-total-sm">ETB {{ store.grandTotal.toFixed(0) }}</span>
      </div>

      <!-- ─── Tip Section ─── -->
      <div class="section-card">
        <div class="sc-header" @click="tipExpanded = !tipExpanded">
          <div class="sc-title-row">
            <span class="sc-icon">💎</span>
            <span class="sc-title">Add Tip</span>
            <span v-if="store.calculatedTip > 0" class="sc-badge">ETB {{ store.calculatedTip.toFixed(0) }}</span>
          </div>
          <svg :class="{ rotated: tipExpanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sc-chevron" style="width:18px;height:18px"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div v-if="tipExpanded" class="sc-body">
          <!-- Tip type tabs -->
          <div class="tip-tabs">
            <button class="tip-tab" :class="{ active: store.tipType === 'none' }" @click="store.clearTip()">No Tip</button>
            <button class="tip-tab" :class="{ active: store.tipType === 'percentage' }" @click="store.tipType = 'percentage'">Percentage</button>
            <button class="tip-tab" :class="{ active: store.tipType === 'fixed' }" @click="store.tipType = 'fixed'">Fixed</button>
          </div>

          <!-- Percentage presets -->
          <div v-if="store.tipType === 'percentage'" class="tip-presets">
            <button
              v-for="pct in [10, 15, 20]"
              :key="pct"
              class="tip-preset-btn"
              :class="{ active: store.tipPercent === pct }"
              @click="store.setTipPercent(pct)"
            >{{ pct }}%</button>
          </div>

          <!-- Fixed amount -->
          <div v-if="store.tipType === 'fixed'" class="form-group" style="margin:8px 0 0">
            <label>Tip Amount (ETB)</label>
            <input
              v-model.number="store.tipAmount"
              type="number"
              class="input"
              placeholder="Enter amount..."
              min="0"
            />
          </div>

          <div v-if="store.calculatedTip > 0" class="tip-result">
            Tip: <strong>ETB {{ store.calculatedTip.toFixed(0) }}</strong>
          </div>
        </div>
      </div>

      <!-- ─── Discount Section (manager only) ─── -->
      <div v-if="auth.roleKey === 'manager'" class="section-card">
        <div class="sc-header" @click="discountExpanded = !discountExpanded">
          <div class="sc-title-row">
            <span class="sc-icon">🎁</span>
            <span class="sc-title">Discount</span>
            <span v-if="store.calculatedDiscount > 0" class="sc-badge sc-badge-green">-ETB {{ store.calculatedDiscount.toFixed(0) }}</span>
          </div>
          <svg :class="{ rotated: discountExpanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sc-chevron" style="width:18px;height:18px"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div v-if="discountExpanded" class="sc-body">
          <div v-if="store.discountType === 'none'" class="discount-none">
            <button class="btn btn-outline btn-sm" @click="store.discountType = 'percentage'">+ Apply Discount</button>
          </div>
          <div v-else>
            <div class="discount-type-row">
              <button class="tip-tab" :class="{ active: store.discountType === 'percentage' }" @click="store.discountType = 'percentage'">Percentage</button>
              <button class="tip-tab" :class="{ active: store.discountType === 'fixed' }" @click="store.discountType = 'fixed'">Fixed Amount</button>
              <button class="tip-tab" @click="store.clearDiscount()">Remove</button>
            </div>
            <div class="discount-inputs">
              <div class="form-group" style="margin:0">
                <label>{{ store.discountType === 'percentage' ? 'Discount %' : 'Amount (ETB)' }}</label>
                <input
                  v-model.number="store.discountValue"
                  type="number"
                  class="input input-sm"
                  :placeholder="store.discountType === 'percentage' ? 'e.g. 10' : 'e.g. 50'"
                  min="0"
                  :max="store.discountType === 'percentage' ? 100 : store.subtotal"
                />
              </div>
              <div class="form-group" style="margin:0">
                <label>Reason (optional)</label>
                <input
                  v-model="store.discountReason"
                  type="text"
                  class="input input-sm"
                  placeholder="e.g. Loyalty, Staff meal..."
                />
              </div>
            </div>
            <div v-if="store.calculatedDiscount > 0" class="tip-result tip-result-discount">
              Discount: <strong>-ETB {{ store.calculatedDiscount.toFixed(0) }}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- ─── Payment Method ─── -->
      <div class="section-card" v-if="!store.splitEnabled">
        <div class="sc-header">
          <div class="sc-title-row">
            <span class="sc-icon">💳</span>
            <span class="sc-title">Payment Method</span>
          </div>
        </div>
        <div class="sc-body" style="padding-top:12px">
          <div class="payment-methods">
            <button
              v-for="pm in paymentOptions"
              :key="pm.value"
              class="pm-card"
              :class="{ active: store.paymentMethod === pm.value }"
              @click="store.setPaymentMethod(pm.value)"
            >
              <span class="pm-icon" v-html="pm.icon"></span>
              <span class="pm-label">{{ pm.label }}</span>
              <span class="pm-check" v-if="store.paymentMethod === pm.value">✓</span>
            </button>
          </div>

          <!-- Cash payment panel -->
          <div v-if="store.paymentMethod === 'cash'" class="cash-panel">
            <div class="cash-panel-header">
              <span>Amount Due</span>
              <span class="cash-due">ETB {{ store.grandTotal.toFixed(0) }}</span>
            </div>
            <div class="quick-tender">
              <button
                v-for="amt in quickAmounts"
                :key="amt"
                class="qt-btn"
                :class="{ active: store.tendered === amt }"
                @click="store.tendered = amt"
              >ETB {{ amt.toLocaleString() }}</button>
            </div>
            <button class="qt-btn qt-exact" @click="store.tendered = Math.ceil(store.grandTotal)">
              Exact (ETB {{ Math.ceil(store.grandTotal).toLocaleString() }})
            </button>
            <div class="form-group" style="margin-top:16px">
              <label>Custom Amount</label>
              <input v-model.number="store.tendered" type="number" class="input" placeholder="Enter amount tendered..." min="0" />
            </div>
            <div v-if="store.tendered >= store.grandTotal" class="change-display">
              <div class="change-label">Change Due</div>
              <div class="change-amount">ETB {{ store.changeDue.toFixed(0) }}</div>
            </div>
            <div v-else-if="store.tendered > 0" class="change-display change-short">
              <div class="change-label">Still Need</div>
              <div class="change-amount">ETB {{ (store.grandTotal - store.tendered).toFixed(0) }}</div>
            </div>
          </div>

          <!-- Card / Mobile panel -->
          <div v-else class="card-panel">
            <div class="card-panel-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--primary)"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>
            <p class="card-panel-text">Tap <strong>Process Payment</strong> to simulate {{ store.paymentMethod === 'card' ? 'card' : 'mobile money' }} payment.</p>
          </div>
        </div>
      </div>

      <!-- ─── Split Bill ─── -->
      <div class="section-card">
        <div class="sc-header" @click="store.toggleSplit()">
          <div class="sc-title-row">
            <span class="sc-icon">📋</span>
            <span class="sc-title">Split Bill</span>
            <span v-if="store.splitEnabled" class="sc-badge">Active</span>
          </div>
          <label class="toggle-switch" @click.stop>
            <input type="checkbox" :checked="store.splitEnabled" @change="store.toggleSplit()" />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div v-if="store.splitEnabled" class="sc-body">
          <div class="split-info">
            <div class="split-total">Total to cover: <strong>ETB {{ store.grandTotal.toFixed(0) }}</strong></div>
            <div class="split-remaining" :class="{ paid: store.splitRemaining <= 0 }">
              {{ store.splitRemaining > 0 ? 'Remaining: ETB ' + store.splitRemaining.toFixed(0) : 'Fully covered' }}
            </div>
          </div>

          <!-- Existing split payments -->
          <div v-for="(sp, idx) in store.splitPayments" :key="idx" class="split-payment-row">
            <select v-model="sp.method" class="select select-sm" style="flex:1;min-width:100px">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mobile">Mobile Money</option>
            </select>
            <div class="split-amount-input">
              <span class="split-currency">ETB</span>
              <input
                :value="sp.amount"
                @input="store.updateSplitPaymentAmount(idx, $event.target.value)"
                type="number"
                class="input input-sm"
                placeholder="0"
                min="0"
              />
            </div>
            <button class="split-remove-btn" @click="store.removeSplitPayment(idx)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Add split payment -->
          <div v-if="store.splitRemaining > 0.5" class="split-add-row">
            <button
              v-for="pm in splitPaymentOptions"
              :key="pm.value"
              class="btn btn-sm btn-outline"
              @click="store.addSplitPayment(pm.value)"
              :disabled="store.splitRemaining <= 0.5"
            >
              + {{ pm.label }}
            </button>
          </div>

          <!-- Validation message -->
          <div v-if="store.splitPayments.length > 0 && !store.splitIsValid" class="split-validation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Payments must total ETB {{ store.grandTotal.toFixed(0) }}</span>
          </div>
        </div>
      </div>

      <!-- ─── Order Summary ─── -->
      <div class="payment-summary">
        <div class="ps-title">Order Summary</div>
        <div v-for="entry in store.items" :key="entry.uid" class="ps-line">
          <span>{{ entry.qty }}x {{ entry.name }}</span>
          <span>ETB {{ (store.lineTotal(entry) * entry.qty).toFixed(0) }}</span>
        </div>
        <div class="ps-divider"></div>
        <div class="ps-line">
          <span>Subtotal</span>
          <span>ETB {{ store.subtotal.toFixed(0) }}</span>
        </div>
        <div v-if="store.calculatedDiscount > 0" class="ps-line ps-discount">
          <span>Discount{{ store.discountReason ? ' (' + store.discountReason + ')' : '' }}</span>
          <span>-ETB {{ store.calculatedDiscount.toFixed(0) }}</span>
        </div>
        <div v-if="store.calculatedTip > 0" class="ps-line">
          <span>Tip</span>
          <span>ETB {{ store.calculatedTip.toFixed(0) }}</span>
        </div>
        <div class="ps-total">
          <span>Grand Total</span>
          <span>ETB {{ store.grandTotal.toFixed(0) }}</span>
        </div>
      </div>

      <!-- Process button -->
      <div class="checkout-cart-footer">
        <button
          class="btn ctf-btn"
          :class="store.canProcess ? 'btn-primary' : 'btn-secondary'"
          :disabled="!store.canProcess || processing"
          @click="processPayment"
        >
          <span v-if="processing" class="btn-spinner" aria-hidden="true"></span>
          {{ processing ? 'Processing...' : 'Process Payment' }}
        </button>
      </div>
    </template>

    <!-- Step: Success -->
    <template v-if="step === 'success'">
      <div class="success-screen">
        <div class="success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <h2 class="success-title">Order Confirmed!</h2>
        <p class="success-id">Order #{{ store.lastOrderId }}</p>
        <p class="success-total">
          ETB {{ lastPayload.total }}
          <span v-if="lastPayload.paymentBreakdown?.length > 1"> (split)</span>
          <span v-if="lastPayload.tip > 0"> + ETB {{ lastPayload.tip }} tip</span>
        </p>

        <div class="success-actions">
          <button class="btn btn-primary" @click="printReceipt">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print Receipt
          </button>
          <button class="btn btn-secondary" @click="newOrder">New Order</button>
          <button class="btn btn-outline" @click="$router.push('/app/dashboard')">Back to Dashboard</button>
        </div>
      </div>
    </template>

    <!-- Modifier Selection Sheet (reused) -->
    <ModifierSelectionSheet
      :visible="showModifierSheet"
      :menu-item="modifierTarget"
      @confirm="onModifierConfirm"
      @cancel="showModifierSheet = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { useRouter } from 'vue-router'
import { apiPost } from '../api'
import { useOrderStore } from '../stores/order'
import { useToast } from '../composables/useToast'
import { useAuthStore } from '../stores/auth'
import ModifierSelectionSheet from '../components/ModifierSelectionSheet.vue'

const router = useRouter()
const toast = inject('toast')
const store = useOrderStore()
const auth = useAuthStore()
const processing = ref(false)
const showModifierSheet = ref(false)
const modifierTarget = ref({})
const tipExpanded = ref(false)
const discountExpanded = ref(false)
const lastPayload = ref({})

const step = computed(() => store.checkoutStep)

const paymentOptions = [
  {
    value: 'cash',
    label: 'Cash',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>'
  },
  {
    value: 'card',
    label: 'Card',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>'
  },
  {
    value: 'mobile',
    label: 'Mobile Money',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>'
  }
]

const splitPaymentOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'mobile', label: 'Mobile Money' }
]

// Quick tender amounts based on grand total
const quickAmounts = computed(() => {
  const total = store.grandTotal
  const amounts = []
  const notes = [10, 50, 100, 200, 500, 1000]
  for (const n of notes) {
    if (n >= total && !amounts.includes(n)) amounts.push(n)
  }
  if (amounts.length < 3) {
    for (const n of notes) {
      if (n > total && !amounts.includes(n)) amounts.push(n)
      if (amounts.length >= 4) break
    }
  }
  return amounts.slice(0, 4)
})

function goToPayment() {
  if (store.isEmpty) return
  store.checkoutStep = 'payment'
}

async function processPayment() {
  if (!store.canProcess || processing.value) return
  processing.value = true
  store.checkoutStep = 'processing'

  try {
    const payload = store.buildOrderPayload()
    lastPayload.value = payload
    const res = await apiPost('orders', payload)
    if (res.ok || res.id) {
      store.lastOrderId = res.id || res.orderId || '—'
      store.checkoutStep = 'success'
      toast('Order placed successfully!', 'success')
    } else {
      throw new Error('Order failed')
    }
  } catch (e) {
    store.lastOrderError = e.message
    store.checkoutStep = 'payment'
    toast('Payment failed — please try again', 'error')
  } finally {
    processing.value = false
  }
}

function newOrder() {
  store.resetFull()
  router.push('/app/menu-view')
}

function printReceipt() {
  const p = lastPayload.value
  const w = window.open('', '_blank')
  if (!w) return
  const id = store.lastOrderId || '—'
  const date = new Date().toLocaleString()
  const lines = store.items.map(i =>
    `${i.qty}x ${i.name}${(i.selectedModifiers||[]).length ? ' ['+i.selectedModifiers.map(m=>m.name).join(', ')+']' : ''}  ETB ${(store.lineTotal(i)*i.qty).toFixed(0)}`
  ).join('<br>')
  
  // Discount line
  let discountLine = ''
  if (p.discount > 0) {
    discountLine = `<div class="line" style="color:#c00"><span>Discount${p.discountReason ? ' ('+p.discountReason+')' : ''}</span><span>-ETB ${p.discount.toFixed(0)}</span></div>`
  }
  
  // Tip line
  let tipLine = ''
  if (p.tip > 0) {
    tipLine = `<div class="line"><span>Tip</span><span>ETB ${p.tip.toFixed(0)}</span></div>`
  }
  
  // Payment breakdown
  let paymentLines = ''
  if (p.paymentBreakdown && p.paymentBreakdown.length > 0) {
    for (const pb of p.paymentBreakdown) {
      paymentLines += `<div class="line"><span>${pb.method.charAt(0).toUpperCase()+pb.method.slice(1)}</span><span>ETB ${pb.amount.toFixed(0)}</span></div>`
      if (pb.tendered !== undefined) {
        paymentLines += `<div class="line" style="font-size:11px;color:#666"><span>Tendered</span><span>ETB ${pb.tendered.toFixed(0)}</span></div>`
        paymentLines += `<div class="line" style="font-size:11px;color:#666"><span>Change</span><span>ETB ${pb.change.toFixed(0)}</span></div>`
      }
    }
  } else {
    paymentLines = `<div class="line"><span>Payment</span><span>${p.payment || ''}</span></div>`
  }

  w.document.write(`<html><head><title>Receipt #${id}</title>
    <style>body{font-family:monospace;padding:20px;max-width:320px;margin:0 auto;font-size:13px}
    h2{text-align:center;margin-bottom:4px}.center{text-align:center}
    hr{border:none;border-top:1px dashed #000;margin:10px 0}
    .line{display:flex;justify-content:space-between;padding:2px 0}
    .total{font-weight:700;border-top:2px solid #000;padding-top:8px;display:flex;justify-content:space-between}
    </style></head><body>
    <h2>FU FUT Caf\u00e9</h2>
    <p class="center">Receipt #${id}<br>${date}</p>
    <hr>
    <p>Type: ${p.type || ''} ${p.tableNum ? '· Table '+p.tableNum : ''}<br>
    Customer: ${p.customer || 'Walk-in'}</p>
    <hr>
    ${lines}
    <hr>
    <div class="line"><span>Subtotal</span><span>ETB ${(p.subtotal || 0).toFixed(0)}</span></div>
    ${discountLine}
    ${tipLine}
    <div class="total"><span>GRAND TOTAL</span><span>ETB ${p.total}</span></div>
    <hr>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;color:#666">Payment</div>
    ${paymentLines}
    <hr>
    <p class="center" style="margin-top:12px">Thank you for visiting!<br>FU FUT COFFEE</p>
    </body></html>`)
  w.document.close()
  w.print()
}

// Modifier handling
function onModifierConfirm(selection) {
  showModifierSheet.value = false
  store.addItem(selection)
}

onMounted(() => {
  if (store.isEmpty && !store.isCheckoutActive) {
    // Don't redirect - let them see the empty state
  }
})
</script>

<style scoped>
.checkout-shell {
  max-width: 680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* Header */
.checkout-header {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  gap: 12px;
}
.checkout-header h3 {
  font-size: 1.15rem;
  color: var(--text-heading);
  font-weight: 700;
  flex: 1;
}
.checkout-badge {
  background: var(--primary);
  color: #fff;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: .72rem;
  font-weight: 600;
}
.checkout-total-sm {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--primary);
}

/* Details row */
.checkout-details-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

/* Cart lines */
.checkout-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.checkout-line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color var(--duration-fast);
}
.checkout-line:hover {
  border-color: var(--primary);
}
.cl-info { flex: 1; min-width: 0; }
.cl-name {
  font-size: .88rem;
  font-weight: 600;
  color: var(--text-heading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cl-unit {
  font-size: .72rem;
  color: var(--text-muted);
  margin-top: 2px;
}
.cl-qty {
  display: flex;
  align-items: center;
  gap: 6px;
}
.qty-btn {
  width: 32px; height: 32px; border-radius: 50%;
  border: 1.5px solid var(--border); background: var(--surface);
  color: var(--text-heading); font-size: 1rem; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all var(--duration-fast);
}
.qty-btn:hover {
  background: var(--primary); color: #fff; border-color: var(--primary);
}
.qty-val {
  font-size: .95rem; font-weight: 700;
  font-family: var(--font-mono);
  min-width: 24px; text-align: center;
}
.cl-total {
  font-family: var(--font-mono);
  font-weight: 600; font-size: .9rem;
  min-width: 70px; text-align: right;
}
.cl-remove {
  width: 28px; height: 28px; border-radius: 50%;
  border: none; background: transparent; color: var(--text-muted);
  cursor: pointer; display: flex; align-items: center;
  justify-content: center; font-size: .78rem;
  transition: all var(--duration-fast);
}
.cl-remove:hover {
  background: var(--red-50); color: var(--danger);
}

/* Notes */
.checkout-notes { margin-bottom: 16px; }

/* Cart footer */
.checkout-cart-footer {
  margin-top: auto;
  padding-top: 20px;
  border-top: 2px solid var(--border);
}
.ccf-total {
  display: flex; justify-content: space-between;
  align-items: center; margin-bottom: 16px;
  font-size: .95rem; color: var(--text-body);
}
.ccf-amount {
  font-size: 1.5rem; font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-heading);
}
.ctf-btn {
  width: 100%; justify-content: center;
  padding: 16px; font-size: 1rem; gap: 8px;
  min-height: 52px;
}

/* ─── Section Cards (collapsible) ─── */
.section-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  margin-bottom: 12px;
  overflow: hidden;
}
.sc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
}
.sc-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sc-icon { font-size: 1rem; }
.sc-title {
  font-size: .88rem;
  font-weight: 600;
  color: var(--text-heading);
}
.sc-badge {
  font-size: .68rem;
  font-weight: 600;
  background: var(--teal-50);
  color: var(--primary);
  padding: 2px 8px;
  border-radius: 99px;
}
.sc-badge-green {
  background: var(--green-50);
  color: var(--success);
}
.sc-chevron {
  transition: transform var(--duration-fast);
  color: var(--text-muted);
}
.sc-chevron.rotated { transform: rotate(180deg); }
.sc-body {
  padding: 0 16px 16px;
}

/* ─── Toggle Switch ─── */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; inset: 0;
  background: var(--neutral-200);
  border-radius: 99px;
  cursor: pointer;
  transition: all var(--duration-fast);
}
.toggle-slider::before {
  content: '';
  position: absolute;
 width: 16px; height: 16px;
  left: 3px; bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: all var(--duration-fast);
}
.toggle-switch input:checked + .toggle-slider {
  background: var(--primary);
}
.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
}

/* ─── Tip Section ─── */
.tip-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.tip-tab {
  padding: 6px 14px;
  border-radius: 99px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-body);
  font-size: .78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast);
}
.tip-tab:hover { border-color: var(--primary); color: var(--primary); }
.tip-tab.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.tip-presets {
  display: flex;
  gap: 8px;
}
.tip-preset-btn {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-heading);
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast);
}
.tip-preset-btn:hover { border-color: var(--primary); background: var(--teal-50); }
.tip-preset-btn.active {
  border-color: var(--primary);
  background: var(--primary);
  color: #fff;
}
.tip-result {
  margin-top: 10px;
  padding: 8px 12px;
  background: var(--teal-50);
  border-radius: var(--radius-sm);
  font-size: .82rem;
  color: var(--text-body);
  text-align: center;
}
.tip-result-discount {
  background: var(--green-50);
}

/* ─── Discount Section ─── */
.discount-none {
  padding: 8px 0;
}
.discount-type-row {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.discount-inputs {
  display: flex;
  gap: 12px;
}

/* ─── Payment Methods ─── */
.payment-methods {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.pm-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  border-radius: var(--radius-md);
  border: 2px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  transition: all var(--duration-base) var(--ease);
  position: relative;
}
.pm-card:hover {
  border-color: var(--primary);
  background: var(--teal-50);
}
.pm-card.active {
  border-color: var(--primary);
  background: var(--teal-50);
  box-shadow: 0 0 0 3px rgba(15, 123, 120, .15);
}
.pm-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
.pm-label {
  font-weight: 600;
  font-size: .88rem;
  color: var(--text-heading);
}
.pm-check {
  position: absolute;
  top: 8px; right: 10px;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--primary); color: #fff;
  font-size: .7rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}

/* ─── Cash Panel ─── */
.cash-panel {
  background: var(--neutral-50);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px;
  margin-top: 4px;
}
.cash-panel-header {
  display: flex; justify-content: space-between;
  align-items: center; margin-bottom: 12px;
  font-size: .85rem; color: var(--text-muted);
}
.cash-due {
  font-size: 1.3rem; font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-heading);
}
.quick-tender {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.qt-btn {
  padding: 12px 8px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-heading);
  font-family: var(--font-mono);
  font-size: .88rem; font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast);
  min-height: 42px;
}
.qt-btn:hover {
  border-color: var(--primary);
  background: var(--teal-50);
}
.qt-btn.active {
  border-color: var(--primary);
  background: var(--primary);
  color: #fff;
}
.qt-exact {
  grid-column: 1 / -1;
  background: var(--teal-50);
  border-color: var(--teal-200);
  color: var(--primary);
}
.change-display {
  text-align: center;
  padding: 16px;
  margin-top: 12px;
  background: var(--green-50);
  border-radius: var(--radius-sm);
  border: 1px solid #BBF7D0;
}
.change-short {
  background: var(--gold-50);
  border-color: #FDE68A;
}
.change-label {
  font-size: .78rem;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.change-amount {
  font-size: 1.8rem; font-weight: 700;
  font-family: var(--font-mono);
  color: var(--success);
}
.change-short .change-amount {
  color: var(--warning);
}

/* ─── Card / Mobile Panel ─── */
.card-panel {
  text-align: center;
  padding: 24px 20px;
  background: var(--neutral-50);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-top: 4px;
}
.card-panel-icon { margin-bottom: 12px; }
.card-panel-text {
  color: var(--text-muted); font-size: .9rem;
}

/* ─── Split Bill ─── */
.split-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: .82rem;
}
.split-total { color: var(--text-body); }
.split-remaining {
  color: var(--warning);
  font-weight: 600;
}
.split-remaining.paid {
  color: var(--success);
}
.split-payment-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.split-amount-input {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  background: var(--surface);
}
.split-amount-input:focus-within {
  border-color: var(--primary);
}
.split-currency {
  font-size: .75rem;
  font-weight: 600;
  color: var(--text-muted);
}
.split-amount-input input {
  border: none !important;
  outline: none !important;
  background: transparent !important;
  padding: 0 !important;
  width: 100%;
  font-family: var(--font-mono);
  font-size: .88rem;
}
.split-remove-btn {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--duration-fast);
  flex-shrink: 0;
}
.split-remove-btn:hover {
  background: var(--red-50);
  color: var(--danger);
  border-color: var(--danger);
}
.split-add-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.split-add-row .btn { flex: 1; }
.split-validation {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--gold-50);
  border-radius: var(--radius-sm);
  border: 1px solid #FDE68A;
  font-size: .78rem;
  color: var(--warning);
  font-weight: 500;
}

/* ─── Payment Summary ─── */
.payment-summary {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
}
.ps-title {
  font-size: .72rem;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 10px;
}
.ps-line {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: .82rem;
  color: var(--text-body);
}
.ps-discount {
  color: var(--success);
  font-weight: 500;
}
.ps-divider {
  border-top: 1px solid var(--border);
  margin: 6px 0;
}
.ps-total {
  display: flex;
  justify-content: space-between;
  padding: 10px 0 0;
  border-top: 2px solid var(--border);
  margin-top: 8px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-heading);
}

/* ─── Success Screen ─── */
.success-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}
.success-icon {
  width: 80px; height: 80px;
  border-radius: 50%;
  background: var(--green-50);
  border: 3px solid var(--success);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 20px;
  animation: success-pop .4s var(--ease-out);
}
.success-icon svg {
  width: 40px; height: 40px;
  color: var(--success);
}
@keyframes success-pop {
  0% { transform: scale(0); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
.success-title {
  font-size: 1.4rem; font-weight: 700;
  color: var(--text-heading);
  margin-bottom: 4px;
}
.success-id {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  color: var(--primary);
  font-weight: 600;
  margin-bottom: 4px;
}
.success-total {
  color: var(--text-muted);
  font-size: .9rem;
  margin-bottom: 28px;
}
.success-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 280px;
}
.success-actions .btn {
  justify-content: center;
  padding: 14px;
  font-size: .95rem;
}

/* ─── Responsive ─── */
@media (max-width: 768px) {
  .checkout-details-row {
    flex-direction: column;
    gap: 10px;
  }
  .payment-methods {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .pm-card { padding: 14px 8px; }
  .quick-tender {
    grid-template-columns: repeat(2, 1fr);
  }
  .discount-inputs {
    flex-direction: column;
    gap: 10px;
  }
}

@media (max-width: 480px) {
  .checkout-line {
    flex-wrap: wrap;
    gap: 8px;
  }
  .cl-total { min-width: auto; }
  .split-payment-row {
    flex-wrap: wrap;
  }
}
</style>
