<template>
  <div>
    <div class="table-toolbar">
      <h3>Orders</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="filter" @change="loadOrders" class="select">
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button class="btn btn-primary" @click="openNewOrder">+ New Order</button>
        <base-button text="Refresh" variant="btn-outline" :on-click="loadOrders" loading-label="Refreshing..." success-label="Refreshed ✓" />
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
              <td data-label="Items">{{ o.items }}</td>
              <td data-label="Total">ETB {{ parseFloat(o.total||0).toFixed(0) }}</td>
              <td data-label="Payment">{{ o.payment || '—' }}</td>
              <td data-label="Type">{{ o.type || '—' }}</td>
              <td data-label="Table">{{ o.tableNum || '—' }}</td>
              <td data-label="Customer">{{ o.customer || '—' }}</td>
              <td data-label="Status"><span class="badge" :class="'badge-'+o.status">{{ o.status }}</span></td>
              <td data-label="Date">{{ o.created ? new Date(o.created).toLocaleString() : '—' }}</td>
              <td data-label="Actions">
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <base-button v-if="o.status==='new'" text="Start Prep" variant="btn-sm btn-primary" :on-click="() => updateStatus(o,'preparing')" loading-label="Starting..." success-label="Started ✓" />
                  <base-button v-if="o.status==='preparing'" text="Ready" variant="btn-sm btn-success" :on-click="() => updateStatus(o,'ready')" loading-label="Updating..." success-label="Ready ✓" />
                  <base-button v-if="o.status==='ready'" text="Complete" variant="btn-sm btn-primary" :on-click="() => updateStatus(o,'fulfilled')" loading-label="Completing..." success-label="Completed ✓" />
                  <button v-if="o.status==='fulfilled'" class="btn btn-sm btn-outline" @click="printReceipt(o)">Receipt</button>
                </div>
              </td>
            </tr>
            <tr v-if="!filteredOrders.length">
              <td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted)">No orders found</td>
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
      <div class="modal" style="width:700px;max-width:100%">
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
          <div class="form-group">
            <label>Table #</label>
            <input v-model="newOrder.tableNum" placeholder="e.g. 5" />
          </div>
        </div>
        <div class="form-group">
          <label>Customer Name</label>
          <input v-model="newOrder.customer" placeholder="Walk-in" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <label style="font-size:.75rem;font-weight:600;display:block;margin-bottom:8px">Menu Items</label>
            <div v-for="cat in menuCategories" :key="cat" style="margin-bottom:12px">
              <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:6px;font-weight:600">{{ cat }}</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                <button
                  v-for="item in menuByCategory[cat]"
                  :key="item.id"
                  class="btn btn-sm btn-outline"
                  @click="addToCart(item)"
                >{{ item.name }} · ETB {{ parseFloat(item.price||0).toFixed(0) }}</button>
              </div>
            </div>
          </div>
          <div>
            <label style="font-size:.75rem;font-weight:600;display:block;margin-bottom:8px">Cart</label>
            <div v-if="cart.length" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;background:var(--neutral-25)">
              <div v-for="(ci, idx) in cart" :key="idx" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:.82rem">
                <span>{{ ci.name }} × {{ ci.qty }}</span>
                <span style="display:flex;align-items:center;gap:6px">
                  <button class="btn btn-sm btn-outline" @click="ci.qty>1?ci.qty--:cart.splice(idx,1)" style="min-width:24px;padding:2px 6px">−</button>
                  <button class="btn btn-sm btn-outline" @click="ci.qty++" style="min-width:24px;padding:2px 6px">+</button>
                  <span style="font-family:var(--font-mono);width:50px;text-align:right">ETB {{ (ci.price * ci.qty).toFixed(0) }}</span>
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-weight:600;border-top:2px solid var(--border-strong);margin-top:6px">
                <span>Total</span>
                <span style="font-family:var(--font-mono)">ETB {{ cartTotal.toFixed(0) }}</span>
              </div>
            </div>
            <div v-else style="border:1px dashed var(--border);border-radius:var(--radius-sm);padding:24px;text-align:center;color:var(--text-muted);font-size:.82rem">Cart is empty<br>Click menu items to add</div>
          </div>
        </div>

        <div class="form-group" style="margin-top:16px">
          <label>Payment Method</label>
          <select v-model="newOrder.payment" class="select">
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile">Mobile Money</option>
          </select>
        </div>

        <div class="form-group" v-if="newOrder.payment==='cash'">
          <label>Amount Tendered</label>
          <input v-model.number="tendered" type="number" placeholder="0" />
          <div v-if="tendered && cartTotal" style="margin-top:4px;font-size:.82rem">
            Change: <strong style="font-family:var(--font-mono)">ETB {{ Math.max(0, (tendered - cartTotal)).toFixed(0) }}</strong>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button class="btn btn-primary" @click="processPayment" :disabled="!cart.length || payBtnState.isBusy()" :aria-busy="payBtnState.isBusy() ? 'true' : undefined">
            {{ payBtnState.isBusy() ? 'Processing Payment...' : payBtnState.isSuccess() ? 'Payment Successful ✓' : payBtnState.isError() ? 'Payment Failed' : 'Process Payment' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPut, apiPost } from '../api'
import { useToast } from '../composables/useToast'
import BaseButton from '../components/BaseButton.vue'
import { useButtonState } from '../composables/useButtonState'

const { toast } = useToast()
const orders = ref([])
const menuItems = ref([])
const filter = ref('')
const showModal = ref(false)
const payBtnState = useButtonState()
const tendered = ref(0)
const cart = ref([])

const newOrder = ref({
  type: 'dine-in',
  tableNum: '',
  customer: '',
  payment: 'cash'
})

const filteredOrders = computed(() => {
  if (!filter.value) return orders.value
  return orders.value.filter(o => o.status === filter.value)
})

const menuCategories = computed(() => {
  const cats = new Set(menuItems.value.map(i => i.category))
  return ['Espresso', 'Filter', 'Cold', 'Blended', 'Food', 'Drinks'].filter(c => cats.has(c))
})

const menuByCategory = computed(() => {
  const m = {}
  for (const item of menuItems.value) {
    if (!m[item.category]) m[item.category] = []
    m[item.category].push(item)
  }
  return m
})

const cartTotal = computed(() => cart.value.reduce((s, i) => s + i.price * i.qty, 0))

onMounted(async () => {
  await Promise.all([loadOrders(), loadMenu()])
})

async function loadOrders() {
  try { orders.value = await apiGet('orders') } catch {}
}

async function loadMenu() {
  try { menuItems.value = await apiGet('menu') } catch {}
}

function openNewOrder() {
  cart.value = []
  newOrder.value = { type: 'dine-in', tableNum: '', customer: '', payment: 'cash' }
  tendered.value = 0
  showModal.value = true
}

function addToCart(item) {
  const existing = cart.value.find(i => i.id === item.id)
  if (existing) { existing.qty++; return }
  cart.value.push({ id: item.id, name: item.name, price: parseFloat(item.price||0), qty: 1 })
}

async function processPayment() {
  if (!cart.value.length || payBtnState.isBusy()) return
  payBtnState.setLoading()
  try {
    const itemsStr = cart.value.map(i => `${i.qty}×${i.name}`).join(', ')
    const body = {
      items: itemsStr,
      total: cartTotal.value.toFixed(0),
      payment: newOrder.value.payment,
      type: newOrder.value.type,
      tableNum: newOrder.value.tableNum,
      customer: newOrder.value.customer || 'Walk-in',
      status: 'new'
    }
    const res = await apiPost('orders', body)
    if (res.ok || res.id) {
      payBtnState.setSuccess()
      toast(`Order #${res.id || ''} created`)
      showModal.value = false
      await loadOrders()
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

function printReceipt(order) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`
    <html><head><title>Receipt #${order.id}</title>
    <style>body{font-family:monospace;padding:20px;max-width:300px;margin:0 auto}
    h2{text-align:center}table{width:100%}th,td{text-align:left;padding:4px 0}
    .total{font-weight:700;border-top:2px solid #000;padding-top:8px}
    </style></head><body>
    <h2>FU FUT Café</h2>
    <p style="text-align:center">Receipt #${order.id}<br>${new Date().toLocaleString()}</p>
    <hr><p><strong>Items:</strong> ${order.items}</p>
    <hr><p><strong>Total:</strong> ETB ${parseFloat(order.total||0).toFixed(0)}</p>
    <p><strong>Payment:</strong> ${order.payment||'—'}</p>
    <hr><p style="text-align:center">Thank you!</p>
    </body></html>
  `)
  w.document.close()
  w.print()
}
</script>
