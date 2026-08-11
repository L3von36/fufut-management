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

    <!--
      Pagination matters here: the table grows by every order the restaurant
      ever takes, and rendering all of them was fine at 39 rows and a frozen tab
      at ten thousand.
    -->
    <base-table
      :columns="columns"
      :rows="filtered"
      sticky-first
      paginated
      caption="Orders, most recent first"
      empty-title="No orders"
      :empty-hint="statusFilter || search ? 'Try clearing the filters.' : 'Orders will appear here as they are taken.'"
    >
      <template #cell-id="{ row }">
        <span style="font-family:var(--font-mono);font-size:.78rem">{{ row.id }}</span>
      </template>
      <!-- title so a truncated order is readable on hover rather than cut off
           with no way to see the rest -->
      <template #cell-items="{ row }">
        <span class="truncate" :title="row.items">{{ row.items }}</span>
      </template>
      <template #cell-total="{ row }">
        <span style="font-weight:600;font-family:var(--font-mono)">{{ parseFloat(row.total||0).toFixed(0) }}</span>
      </template>
      <template #cell-status="{ row }">
        <span class="badge" :class="statusBadgeClass(row.status)">{{ statusLabel(row.status) }}</span>
      </template>
      <!-- Cash is a payment method, not a pending state. It was amber, which
           reads as "not settled yet" against a green card badge. -->
      <template #cell-payment="{ row }">
        <span class="badge badge-neutral">{{ row.payment || '—' }}</span>
      </template>
      <template #cell-created="{ row }">
        <span style="font-size:.78rem">{{ localTime(row.created, true) || '-' }}</span>
      </template>
    </base-table>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet } from '../api'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
import { localTime } from '../lib/datetime'
import BaseTable from '../components/BaseTable.vue'

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

// Column order and headings; every cell body is overridden by a slot above.
// Pagination and the page-reset-on-filter behaviour moved into BaseTable.
const columns = [
  { key: 'id', label: 'Order ID' },
  { key: 'tableId', label: 'Table' },
  { key: 'items', label: 'Items' },
  { key: 'total', label: 'Total (ETB)' },
  { key: 'status', label: 'Status' },
  { key: 'payment', label: 'Payment' },
  { key: 'created', label: 'Time' },
]

onMounted(loadOrders)
async function loadOrders() { try { orders.value = await apiGet('orders') } catch (e) { console.error(e) } }
</script>
