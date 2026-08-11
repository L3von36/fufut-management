<template>
  <div>
    <div class="table-toolbar">
      <h3>Orders</h3>
      <div style="display:flex;gap:10px">
        <select v-model="statusFilter" class="select select-sm" style="width:auto">
          <option value="">All Status</option><option>new</option><option>preparing</option><option>ready</option><option>fulfilled</option><option>cancelled</option>
        </select>
        <input v-model="search" placeholder="Search order ID..." class="input input-sm" style="width:160px" />
        <button class="btn btn-primary" @click="loadOrders">Refresh</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ filtered.length }}</div><div class="lbl">Orders</div></div>
      <div class="summary-card">
        <div class="num">ETB {{ totalRevenue.toFixed(0) }}</div>
        <div class="lbl">
          Net Sales
          <span v-if="excludedCount" :title="excludedCount + ' cancelled or voided order(s) excluded'">
            ({{ excludedCount }} excluded)
          </span>
          <span v-else>excl. tips</span>
        </div>
      </div>
      <div class="summary-card"><div class="num">{{ avgOrder.toFixed(0) }}</div><div class="lbl">Avg Order</div></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll table-sticky-first">
        <table>
          <thead><tr><th>Order ID</th><th>Table</th><th>Items</th><th>Total (ETB)</th><th>Status</th><th>Payment</th><th>Time</th></tr></thead>
          <tbody>
            <tr v-for="o in pageRows" :key="o.id">
              <td style="font-family:var(--font-mono);font-size:.78rem">{{ o.id }}</td>
              <td>{{ o.tableId || '-' }}</td>
              <!-- title so a truncated order is readable on hover rather than
                   just cut off with no way to see the rest -->
              <td class="truncate" :title="o.items">{{ o.items }}</td>
              <td style="font-weight:600;font-family:var(--font-mono)">{{ parseFloat(o.total||0).toFixed(0) }}</td>
              <td><span class="badge" :class="statusBadgeClass(o.status)">{{ statusLabel(o.status) }}</span></td>
              <!-- Cash is a payment method, not a pending state. It was amber,
                   which reads as "not settled yet" against a green card badge. -->
              <td><span class="badge badge-neutral">{{ o.payment || '—' }}</span></td>
              <td style="font-size:.78rem">{{ localTime(o.created, true) || '-' }}</td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="7" class="table-empty">
                <div class="table-empty-title">No orders</div>
                <div class="table-empty-hint">{{ statusFilter || search ? 'Try clearing the filters.' : 'Orders will appear here as they are taken.' }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!--
        Every order was rendered into the DOM at once. That is fine at 39 rows
        and is a frozen tab at ten thousand — and this table has no upper bound,
        because it grows by every order the restaurant ever takes.
      -->
      <div v-if="filtered.length > PAGE_SIZE" class="pagination">
        <button class="btn btn-sm btn-secondary" :disabled="page === 1" @click="page--">Previous</button>
        <span>{{ rangeLabel }} of {{ filtered.length }}</span>
        <button class="btn btn-sm btn-secondary" :disabled="page >= pageCount" @click="page++">Next</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { apiGet } from '../api'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
import { localTime } from '../lib/datetime'

const orders = ref([])
const statusFilter = ref('')
const search = ref('')

const filtered = computed(() => orders.value.filter(o => {
  if (statusFilter.value && o.status !== statusFilter.value) return false
  if (search.value && !o.id?.toLowerCase().includes(search.value.toLowerCase())) return false
  return true
}))
/**
 * Revenue counts orders that actually traded.
 *
 * This summed every filtered row including cancelled and voided ones, so the
 * headline inflated by the value of everything that fell through — and filtering
 * the table to "cancelled" produced a revenue figure made entirely of sales that
 * never happened.
 *
 * Tips are subtracted for the same reason they are everywhere else: `total` is
 * what the guest handed over and includes money that belongs to staff.
 */
const trading = computed(() =>
  filtered.value.filter(o => o.status !== 'cancelled' && !o.voided_at)
)
const totalRevenue = computed(() =>
  trading.value.reduce((s, o) => s + parseFloat(o.total || 0) - parseFloat(o.tip || 0), 0)
)
const avgOrder = computed(() => trading.value.length ? totalRevenue.value / trading.value.length : 0)
const excludedCount = computed(() => filtered.value.length - trading.value.length)

// ─── Pagination ───
const PAGE_SIZE = 50
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const pageRows = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const rangeLabel = computed(() => {
  const first = (page.value - 1) * PAGE_SIZE + 1
  return `${first}–${Math.min(page.value * PAGE_SIZE, filtered.value.length)}`
})

// Filtering to fewer pages while on a later one would otherwise leave the user
// staring at an empty table with no obvious cause.
watch(filtered, () => { if (page.value > pageCount.value) page.value = 1 })

onMounted(loadOrders)
async function loadOrders() { try { orders.value = await apiGet('orders') } catch (e) { console.error(e) } }
</script>
