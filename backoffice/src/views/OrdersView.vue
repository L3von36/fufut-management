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
      <div class="table-scroll">
        <table>
          <thead><tr><th>Order ID</th><th>Table</th><th>Items</th><th>Total (ETB)</th><th>Status</th><th>Payment</th><th>Time</th></tr></thead>
          <tbody>
            <tr v-for="o in filtered" :key="o.id">
              <td style="font-family:var(--font-mono);font-size:.78rem">{{ o.id }}</td>
              <td>{{ o.tableId || '-' }}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ o.items }}</td>
              <td style="font-weight:600;font-family:var(--font-mono)">{{ parseFloat(o.total||0).toFixed(0) }}</td>
              <td><span class="badge" :class="'badge-'+o.status">{{ o.status }}</span></td>
              <td><span class="badge" :class="o.payment === 'cash' ? 'badge-pending' : 'badge-success'">{{ o.payment || '-' }}</span></td>
              <td style="font-size:.78rem">{{ localTime(o.created, true) || '-' }}</td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No orders</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet } from '../api'
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

onMounted(loadOrders)
async function loadOrders() { try { orders.value = await apiGet('orders') } catch (e) { console.error(e) } }
</script>
