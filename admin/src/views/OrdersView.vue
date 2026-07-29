<template>
  <div>
    <div class="table-toolbar">
      <h3>Orders</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <select v-model="filter" class="select select-sm">
          <option value="">All Statuses</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
        <span class="badge badge-muted">{{ filtered.length }} order(s)</span>
        <button class="btn btn-outline btn-sm" @click="loadData">⟳ Refresh</button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in filtered" :key="o.id">
              <td><code class="order-id">{{ o.id }}</code></td>
              <td>
                <span v-if="o.name || o.phone" class="cust-cell">
                  <strong v-if="o.name">{{ o.name }}</strong>
                  <span v-if="o.phone" class="text-muted">{{ o.phone }}</span>
                </span>
                <span v-else class="text-muted">Walk-in / Web</span>
              </td>
              <td>{{ formatItems(o.items) }}</td>
              <td><strong>ETB {{ Number(o.total).toFixed(0) }}</strong></td>
              <td class="text-muted">{{ formatDate(o.created) }}</td>
              <td>
                <select class="status-select" :class="'status-' + (o.status||'new')" v-model="o.status" @change="updateStatus(o)">
                  <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                </select>
              </td>
              <td>
                <button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click="handleDelete(o)">Delete</button>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="7" class="empty-state" style="padding:48px;text-align:center;color:var(--text-muted)">
                <div style="font-size:2rem;margin-bottom:8px">📋</div>
                No orders found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>{{ filtered.length }} order(s)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPut, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
const { toast } = useToast()

const items = ref([])
const filter = ref('')
const statuses = ['new', 'pending', 'confirmed', 'ready', 'completed', 'cancelled']

const filtered = computed(() => {
  const list = !filter.value ? items.value : items.value.filter(o => o.status === filter.value)
  // Newest first so fresh web orders are always at the top.
  return [...list].sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0))
})

onMounted(loadData)

async function loadData() {
  try {
    const data = await apiGet('orders')
    items.value = Array.isArray(data) ? data : []
  } catch {
    toast('Failed to load orders', 'error')
  }
}

// Orders can arrive as a plain string ("Latte, Croissant") from older records
// or as an array of line items from the website cart.
function formatItems(items) {
  if (!items) return '\u2014'
  if (typeof items === 'string') return items
  if (Array.isArray(items)) {
    return items
      .map(i => (typeof i === 'string' ? i : `${i.name || 'Item'}${i.qty > 1 ? ' \u00d7' + i.qty : ''}`))
      .join(', ')
  }
  return String(items)
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function updateStatus(o) {
  try {
    await apiPut('orders/' + o.id, { status: o.status })
    toast('Status updated to ' + o.status)
  } catch {
    toast('Failed to update status', 'error')
  }
}

async function handleDelete(o) {
  if (!confirm('Delete order ' + o.id + '?')) return
  try {
    await apiDelete('orders/' + o.id)
    toast('Order deleted')
    await loadData()
  } catch {
    toast('Failed to delete', 'error')
  }
}
</script>

<style scoped>
.cust-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  font-size: .85rem;
}
.order-id {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: .78rem;
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--text-muted);
}
.status-select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: .78rem;
  font-weight: 600;
  cursor: pointer;
  text-transform: capitalize;
  background: var(--bg);
}
.status-new { color: #2563eb; border-color: #93c5fd; background: #eff6ff; }
.status-pending { color: #d97706; border-color: #fcd34d; background: #fffbeb; }
.status-confirmed { color: #7c3aed; border-color: #c4b5fd; background: #f5f3ff; }
.status-ready { color: #0891b2; border-color: #67e8f9; background: #ecfeff; }
.status-completed { color: #16a34a; border-color: #86efac; background: #f0fdf4; }
.status-cancelled { color: #dc2626; border-color: #fca5a5; background: #fef2f2; }
.text-muted { color: var(--text-muted); font-size: .82rem; }
</style>
