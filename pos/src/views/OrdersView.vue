<template>
  <div>
    <div class="ov-toolbar">
      <div class="ov-toolbar-left">
        <span class="ov-toolbar-title">Orders</span>
        <span class="ov-toolbar-count">{{ filteredOrders.length }} result{{ filteredOrders.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="ov-toolbar-actions">
        <div class="ov-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="search" type="text" placeholder="Search orders..." class="ov-search-input" />
          <button v-if="search" class="ov-search-clear" @click="search=''" aria-label="Clear search">&times;</button>
        </div>
        <select v-model="filter" @change="loadOrders" class="select">
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <!-- BUG-2 (waiter mobile audit pass 2): settling a check sets the
               order to 'served', which the filter never offered — a waiter
               looking for "the table I just closed" by status found nothing. -->
          <option value="served">Served</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button v-if="auth.hasPermission('checkout')" class="btn btn-primary" @click="openNewOrder">+ New Order</button>
        <button class="btn btn-ghost btn-sm" @click="loadOrders" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Items</th>
              <th>Total</th>
              <th>Tip</th>
              <th>Discount</th>
              <th>Payment</th>
              <th>Type</th>
              <th>Table</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in filteredOrders" :key="o.id">
              <td data-label="ID">#{{ o.id }}</td>
              <td data-label="Items">{{ formatOrderItems(o.items) }}</td>
              <td data-label="Total">
                <span style="font-family:var(--font-mono);font-weight:600">ETB {{ parseFloat(o.total||0).toFixed(0) }}</span>
                <!-- Strike-through reads as "was discounted from". A total that
                     only differs from the subtotal because of a TIP is not a
                     discount — showing the food price crossed out there made
                     settled tickets look repriced. -->
                <div v-if="o.discount > 0 && o.subtotal && parseFloat(o.subtotal) !== parseFloat(o.total)" style="font-size:.72rem;color:var(--text-muted);text-decoration:line-through">
                  ETB {{ parseFloat(o.subtotal).toFixed(0) }}
                </div>
              </td>
              <td data-label="Tip">
                <span v-if="o.tip > 0" class="tag tag-tip">+ETB {{ parseFloat(o.tip).toFixed(0) }}</span>
                <span v-else style="color:var(--text-muted)">—</span>
              </td>
              <td data-label="Discount">
                <span v-if="o.discount > 0" class="tag tag-discount">-ETB {{ parseFloat(o.discount).toFixed(0) }}</span>
                <span v-else style="color:var(--text-muted)">—</span>
              </td>
              <td data-label="Payment">
                <span class="payment-tag">{{ o.payment_method || o.payment || '—' }}</span>
                <div v-if="o.payment_breakdown && Array.isArray(o.payment_breakdown) && o.payment_breakdown.length > 1" class="split-indicator">
                  Split ({{ o.payment_breakdown.length }} ways)
                </div>
              </td>
              <td data-label="Type">{{ o.order_type || o.type || '—' }}</td>
              <td data-label="Table">{{ o.table_number || o.tableNum || '—' }}</td>
              <td data-label="Customer">{{ o.customer || o.name || '—' }}</td>
              <td data-label="Status"><span class="badge" :class="'badge-'+o.status">{{ o.status }}</span></td>
              <td data-label="Date">{{ o.created ? new Date(o.created).toLocaleString() : '—' }}</td>
              <td data-label="Actions">
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <base-button v-if="o.status==='new' && (auth.roleKey==='head-chef' || auth.roleKey==='assistant-chef')" text="Start Prep" variant="btn-sm btn-primary" :on-click="() => updateStatus(o,'preparing')" loading-label="Starting..." success-label="Started" />
                  <base-button v-if="o.status==='preparing' && (auth.roleKey==='head-chef' || auth.roleKey==='assistant-chef')" text="Ready" variant="btn-sm btn-success" :on-click="() => updateStatus(o,'ready')" loading-label="Updating..." success-label="Ready" />
                  <base-button v-if="o.status==='ready'" text="Complete" variant="btn-sm btn-primary" :on-click="() => updateStatus(o,'fulfilled')" loading-label="Completing..." success-label="Completed" />
                  <button v-if="o.status==='fulfilled'" class="btn btn-sm btn-outline" @click="printReceipt(o)">Receipt</button>
                </div>
              </td>
            </tr>
            <tr v-if="!filteredOrders.length">
              <td colspan="12">
                <div class="ov-empty">
                  <div class="ov-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                  </div>
                  <div class="ov-empty-text">{{ search ? 'No orders match your search' : 'No orders yet' }}</div>
                  <div class="ov-empty-hint">{{ search ? 'Try a different keyword or clear the search.' : 'Create a new order to get started.' }}</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>{{ filteredOrders.length }} order(s)</span>
      </div>
    </div>

    <!-- New Order Modal -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal" style="width:720px;max-width:100%">
        <h3>New Order</h3>
        <p class="modal-sub">Create a new order</p>

        <div class="form-row">
          <div class="form-group">
            <label>Order Type</label>
            <select v-model="newOrder.type" class="select">
              <option value="dine-in">Dine In</option>
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <div class="form-group" v-if="newOrder.type === 'dine-in'">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <label style="margin:0">Table Selection</label>
              <div style="display:flex;gap:6px;align-items:center">
                <button type="button" class="btn btn-xs btn-outline" style="font-size:.72rem;padding:2px 7px" @click="showAllTables = !showAllTables">
                  {{ showAllTables ? 'Showing All' : 'Show All' }}
                </button>
                <button
                  v-if="newOrder.tableNum && isSelectedTableOccupied"
                  type="button"
                  class="btn btn-xs btn-warning"
                  style="font-size:.72rem;padding:2px 7px"
                  @click="freeUpTable(newOrder.tableNum)"
                >
                  Free Up #{{ newOrder.tableNum }}
                </button>
              </div>
            </div>
            <select v-model="newOrder.tableNum" class="select">
              <option value="">-- Select Available Table --</option>
              <option v-for="t in availableTables" :key="t.id" :value="t.number">
                Table {{ t.number }} &middot; {{ t.name || (t.section ? t.section + ' Section' : 'Main') }} ({{ t.capacity || 4 }} seats) {{ t.status !== 'available' ? '[' + t.status.toUpperCase() + ']' : '' }}
              </option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Customer Name</label>
          <input v-model="newOrder.customer" placeholder="Walk-in" />
        </div>

        <div class="order-builder-grid">
          <!-- Menu Items Column -->
          <div>
            <label class="order-builder-label">Menu Items</label>
            <div class="order-menu-scroll">
              <div v-for="cat in menuCategories" :key="cat" class="order-cat-group">
                <div class="order-cat-title">{{ cat }}</div>
                <div class="order-menu-buttons">
                  <button
                    v-for="item in menuByCategory[cat]"
                    :key="item.id"
                    class="btn btn-sm btn-outline"
                    :class="{ 'btn-primary': itemHasModifiers(item) }"
                    @click="handleAddItem(item)"
                  >{{ item.name }} &middot; ETB {{ parseFloat(item.price||0).toFixed(0) }}<span v-if="itemHasModifiers(item)" class="mod-indicator">⚙</span></button>
                </div>
              </div>
            </div>
          </div>

          <!-- Cart Column -->
          <div>
            <label class="order-builder-label">Cart ({{ orderStore.cartItemCount }} items)</label>
            <div v-if="orderStore.items.length" class="order-cart-panel">
              <div v-for="entry in orderStore.items" :key="entry.uid" class="order-cart-line">
                <div class="order-cart-line-info">
                  <span class="order-cart-name">{{ orderStore.lineSummary(entry) }}</span>
                  <span class="order-cart-mods" v-if="entry.selectedModifiers?.length">
                    {{ entry.selectedModifiers.map(m => formatModName(m.name)).join(', ') }}
                  </span>
                </div>
                <div class="order-cart-line-right">
                  <div class="order-cart-qty">
                    <button class="btn btn-sm btn-outline" style="min-width:26px;padding:2px 6px" @click="orderStore.decrementQty(entry.uid)">−</button>
                    <span class="order-cart-qty-val">{{ entry.qty }}</span>
                    <button class="btn btn-sm btn-outline" style="min-width:26px;padding:2px 6px" @click="orderStore.incrementQty(entry.uid)">+</button>
                  </div>
                  <span class="order-cart-price">ETB {{ (orderStore.lineTotal(entry) * entry.qty).toFixed(0) }}</span>
                </div>
              </div>
              <div class="order-cart-total">
                <span>Total</span>
                <span style="font-family:var(--font-mono)">ETB {{ orderStore.grandTotal.toFixed(0) }}</span>
              </div>
            </div>
            <div v-else class="order-cart-empty">Cart is empty<br>Click menu items to add</div>
          </div>
        </div>

        <div class="form-group" style="margin-top:16px">
          <label>Payment Method</label>
          <select v-model="newOrder.payment" class="select">
            <!-- The same six methods the checkout offers: a counter sale paid
                 by Telebirr is an everyday thing, and the quick-sale form used
                 to offer no way to record it. -->
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile">Mobile Money</option>
            <option value="telebirr">Telebirr</option>
            <option value="cbe">CBE Birr</option>
            <option value="bank">Bank Transfer</option>
          </select>
        </div>

        <div class="form-group" v-if="newOrder.payment==='cash'">
          <label>Amount Tendered</label>
          <input v-model.number="tendered" type="number" placeholder="0" />
          <div v-if="tendered && orderStore.grandTotal" style="margin-top:4px;font-size:.82rem">
            Change: <strong style="font-family:var(--font-mono)">ETB {{ Math.max(0, (tendered - orderStore.grandTotal)).toFixed(0) }}</strong>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button class="btn btn-primary" @click="processPayment" :disabled="orderStore.isEmpty || payBtnState.isBusy()" :aria-busy="payBtnState.isBusy() ? 'true' : undefined">
            {{ payBtnState.isBusy() ? 'Processing Payment...' : payBtnState.isSuccess() ? 'Payment Successful' : 'Process Payment' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modifier Selection Sheet -->
    <ModifierSelectionSheet
      :visible="showModifierSheet"
      :menu-item="modifierTarget"
      @confirm="onModifierConfirm"
      @cancel="showModifierSheet = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted , inject} from 'vue'
import { apiGet, apiPut, apiPost } from '../api'
import { useOrderStore } from '../stores/order'
import { useButtonState } from '../composables/useButtonState'
import { useAuthStore } from '../stores/auth'
import { formatOrderItems } from '../lib/formatters'
import BaseButton from '../components/BaseButton.vue'
import ModifierSelectionSheet from '../components/ModifierSelectionSheet.vue'

const toast = inject('toast')
const auth = useAuthStore()
const orderStore = useOrderStore()
const orders = ref([])
const menuItems = ref([])
const filter = ref('')
const search = ref('')
const showModal = ref(false)
const payBtnState = useButtonState()
const tendered = ref(0)
const tables = ref([])
const showAllTables = ref(false)

const availableTables = computed(() => {
  if (showAllTables.value) return tables.value
  return tables.value.filter(t => t.status === 'available')
})

const isSelectedTableOccupied = computed(() => {
  if (!newOrder.value.tableNum) return false
  const match = tables.value.find(t => String(t.number) === String(newOrder.value.tableNum))
  return match && match.status !== 'available'
})

const newOrder = ref({
  type: 'dine-in',
  tableNum: '',
  customer: '',
  payment: 'cash'
})

const filteredOrders = computed(() => {
  let result = orders.value
  if (filter.value) result = result.filter(o => o.status === filter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(o =>
      (o.id && o.id.toLowerCase().includes(q)) ||
      (o.items && o.items.toLowerCase().includes(q)) ||
      (o.customer && o.customer.toLowerCase().includes(q)) ||
      (o.name && o.name.toLowerCase().includes(q)) ||
      ((o.table_number || o.tableNum || '').toString().includes(q))
    )
  }
  return result
})

const menuCategories = computed(() => {
  const cats = new Set(menuItems.value.map(i => i.category))
  return Array.from(cats)
})

const menuByCategory = computed(() => {
  const m = {}
  for (const item of menuItems.value) {
    if (!m[item.category]) m[item.category] = []
    m[item.category].push(item)
  }
  return m
})

// --- Modifier helpers ---
function getModifierList(item) {
  const raw = item.modifiers
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

function itemHasModifiers(item) {
  return getModifierList(item).length > 0
}

function formatModName(mod) {
  return String(mod).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// --- Item click ---
function handleAddItem(item) {
  if (itemHasModifiers(item)) {
    modifierTarget.value = item
    showModifierSheet.value = true
  } else {
    orderStore.addItem({
      menuItemId: item.id,
      name: item.name,
      basePrice: parseFloat(item.price || 0)
    })
  }
}

function onModifierConfirm(selection) {
  showModifierSheet.value = false
  orderStore.addItem(selection)
}

// --- Lifecycle ---
onMounted(async () => {
  await Promise.all([loadOrders(), loadMenu(), loadTables()])
})

async function loadTables() {
  try { tables.value = (await apiGet('tables')) || [] } catch (e) { console.error(e) }
}

async function freeUpTable(tableNum) {
  const match = tables.value.find(t => String(t.number) === String(tableNum))
  if (!match) return
  try {
    const updated = { ...match, status: 'available', guests: 0, server: '', seated_at: '' }
    await apiPut('tables/' + match.id, updated)
    match.status = 'available'
    match.guests = 0
    match.server = ''
    match.seated_at = ''
    toast(`Table ${match.number} is now Available`, 'success')
  } catch (e) {
    toast('Failed to free up table', 'error')
  }
}

async function loadOrders() {
  try { orders.value = await apiGet('orders') } catch (e) { console.error(e) }
}

async function loadMenu() {
  try { menuItems.value = await apiGet('menu') } catch (e) { console.error(e) }
}

function openNewOrder() {
  orderStore.clearCart()
  newOrder.value = { type: 'dine-in', tableNum: '', customer: '', payment: 'cash' }
  tendered.value = 0
  showModal.value = true
  loadTables()
}

async function processPayment() {
  if (orderStore.isEmpty || payBtnState.isBusy()) return
  // Same orphan-check guard as the checkout review step: a dine-in ticket
  // bound to no table belongs to nobody and cannot be found again without
  // trawling Open Checks.
  if (newOrder.value.type === 'dine-in' && !newOrder.value.tableNum) {
    toast('Pick a table for a dine-in order, or switch to Takeaway', 'error')
    return
  }
  payBtnState.setLoading()
  try {
    const payload = orderStore.buildOrderPayload({
      payment: newOrder.value.payment,
      type: newOrder.value.type,
      tableNum: newOrder.value.tableNum,
      customer: newOrder.value.customer || 'Walk-in',
      status: 'new'
    })
    const res = await apiPost('orders', payload)
    if (res.ok || res.id) {
      // The sale is finished, so the cart must be too. Leaving paid lines in
      // the store meant the next order — a quick sale, a table tab, anything
      // built afterwards — silently inherited them and could bill a guest for
      // food somebody else already paid for. resetFull also drops the
      // persisted copy, so the ghost items do not survive a reload either.
      orderStore.resetFull()
      // Auto-mark table occupied in database & state
      if (newOrder.value.type === 'dine-in' && newOrder.value.tableNum) {
        const match = tables.value.find(t => String(t.number) === String(newOrder.value.tableNum))
        if (match && match.status !== 'occupied') {
          try {
            await apiPut('tables/' + match.id, {
              ...match,
              status: 'occupied',
              seated_at: new Date().toISOString(),
              newSeating: true,
            })
          } catch (e) {
            // The order exists either way; what must not happen silently is the
            // floor plan still showing this table as free.
            toast(e.message || `Order created, but table ${newOrder.value.tableNum} could not be held`, 'error')
          }
        }
      }
      payBtnState.setSuccess()
      toast(`Order #${res.id || ''} created`)
      showModal.value = false
      await loadOrders()
      await loadTables()
    }
  } catch (e) {
    payBtnState.setError('Payment failed')
    toast('Payment failed', 'error')
  }
}

async function updateStatus(order, status) {
  order.status = status
  try {
    await apiPut('orders/' + order.id, order)
    toast(`Order ${status}`)
    await loadOrders()
  } catch { toast('Failed to update', 'error') }
}

function escapeHtml(str) {
  const s = String(str ?? '')
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function printReceipt(order) {
  const w = window.open('', '_blank')
  if (!w) return
  const safeId = escapeHtml(order.id)
  const safeItems = escapeHtml(order.items)
  const safePayment = escapeHtml(order.payment_method || order.payment || '')
  const safeTotal = escapeHtml(parseFloat(order.total||0).toFixed(0))
  const safeSubtotal = escapeHtml(parseFloat(order.subtotal||order.total||0).toFixed(0))
  
  let discountLine = ''
  if (order.discount > 0) {
    const reason = order.discount_reason ? ' (' + escapeHtml(order.discount_reason) + ')' : ''
    discountLine = `<div class="line" style="color:#c00"><span>Discount${reason}</span><span>-ETB ${parseFloat(order.discount).toFixed(0)}</span></div>`
  }
  
  let tipLine = ''
  if (order.tip > 0) {
    tipLine = `<div class="line"><span>Tip</span><span>ETB ${parseFloat(order.tip).toFixed(0)}</span></div>`
  }
  
  let paymentLines = ''
  if (order.payment_breakdown && Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0) {
    for (const pb of order.payment_breakdown) {
      paymentLines += `<div class="line"><span>${escapeHtml(pb.method)}</span><span>ETB ${(pb.amount||0).toFixed(0)}</span></div>`
      if (pb.tendered !== undefined) {
        paymentLines += `<div class="line" style="font-size:11px;color:#666"><span>Tendered</span><span>ETB ${pb.tendered.toFixed(0)}</span></div>`
        paymentLines += `<div class="line" style="font-size:11px;color:#666"><span>Change</span><span>ETB ${pb.change.toFixed(0)}</span></div>`
      }
    }
  } else {
    paymentLines = `<div class="line"><span>Payment</span><span>${safePayment}</span></div>`
  }

  w.document.write(`<html><head><title>Receipt #${safeId}</title>
    <style>body{font-family:monospace;padding:20px;max-width:320px;margin:0 auto}
    h2{text-align:center}table{width:100%}th,td{text-align:left;padding:4px 0}
    .line{display:flex;justify-content:space-between;padding:2px 0}
    .total{font-weight:700;border-top:2px solid #000;padding-top:8px;display:flex;justify-content:space-between}
    </style></head><body>
    <h2>FU FUT Caf&eacute;</h2>
    <p style="text-align:center">Receipt #${safeId}<br>${new Date().toLocaleString()}</p>
    <hr><p><strong>Items:</strong> ${safeItems}</p>
    <hr>
    <div class="line"><span>Subtotal</span><span>ETB ${safeSubtotal}</span></div>
    ${discountLine}
    ${tipLine}
    <div class="total"><span>GRAND TOTAL</span><span>ETB ${safeTotal}</span></div>
    <hr>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;color:#666">Payment</div>
    ${paymentLines}
    <hr><p style="text-align:center">Thank you!</p>
    </body></html>`)
  w.document.close()
  w.print()
}
</script>

<style scoped>
/* Order builder grid */
.order-builder-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 4px;
}
.order-builder-label {
  font-size: .75rem;
  font-weight: 600;
  display: block;
  margin-bottom: 8px;
}

/* Menu column scrollable */
.order-menu-scroll {
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
}
.order-cat-group { margin-bottom: 12px; }
.order-cat-title {
  font-size: .72rem;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-muted);
  margin-bottom: 6px;
  font-weight: 600;
}
.order-menu-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.mod-indicator {
  margin-left: 4px;
  opacity: .6;
  font-size: .7rem;
}

/* Cart panel inside modal */
.order-cart-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px;
  background: var(--neutral-25);
  max-height: 300px;
  overflow-y: auto;
}
.order-cart-line {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: .82rem;
  gap: 8px;
}
.order-cart-line:last-of-type { border-bottom: none; }
.order-cart-line-info { flex: 1; min-width: 0; }
.order-cart-name {
  font-weight: 500;
  color: var(--text-heading);
}
.order-cart-mods {
  font-size: .7rem;
  color: var(--text-muted);
  display: block;
  margin-top: 2px;
}
.order-cart-line-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.order-cart-qty {
  display: flex;
  align-items: center;
  gap: 4px;
}
.order-cart-qty-val {
  font-weight: 700;
  font-family: var(--font-mono);
  min-width: 20px;
  text-align: center;
}
.order-cart-price {
  font-family: var(--font-mono);
  width: 55px;
  text-align: right;
  font-weight: 600;
}
.order-cart-total {
  display: flex;
  justify-content: space-between;
  padding: 10px 0 0;
  font-weight: 600;
  border-top: 2px solid var(--border-strong);
  margin-top: 6px;
}
.order-cart-empty {
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: .82rem;
}

/* Phase 2: Tags for tip/discount/payment */
.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: .72rem;
  font-weight: 600;
  font-family: var(--font-mono);
}
.tag-tip {
  background: var(--teal-50);
  color: var(--primary);
}
.tag-discount {
  background: var(--green-50);
  color: var(--success);
}
.payment-tag {
  font-size: .78rem;
  font-weight: 500;
}
.split-indicator {
  font-size: .72rem;
  color: var(--primary);
  margin-top: 2px;
}

/* Orders toolbar */
.ov-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}
.ov-toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.ov-toolbar-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-heading);
}
.ov-toolbar-count {
  font-size: .78rem;
  color: var(--text-muted);
  font-weight: 400;
}
.ov-toolbar-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

/* Search box */
.ov-search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  transition: border-color var(--duration-fast) var(--ease);
 min-width: 200px;
}
.ov-search:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(15,123,120,.1);
}
.ov-search-input {
  border: none;
  background: transparent;
  padding: 7px 0;
  font-size: .82rem;
  color: var(--text-heading);
  width: 100%;
  outline: none;
  font-family: inherit;
}
.ov-search-input::placeholder {
  color: var(--neutral-400);
}
.ov-search-clear {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0 2px;
  line-height: 1;
}
.ov-search-clear:hover {
  color: var(--text-heading);
}

/* Empty state */
.ov-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  text-align: center;
}
.ov-empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--neutral-50);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--neutral-400);
  margin-bottom: 12px;
}
.ov-empty-text {
  font-size: .88rem;
  font-weight: 600;
  color: var(--text-heading);
}
.ov-empty-hint {
  font-size: .78rem;
  color: var(--text-muted);
  margin-top: 4px;
}

@media (max-width: 768px) {
  .order-builder-grid {
    grid-template-columns: 1fr;
  }
  .ov-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .ov-toolbar-left {
    margin-bottom: 4px;
  }
  .ov-toolbar-actions {
    flex-wrap: wrap;
  }
}
</style>
