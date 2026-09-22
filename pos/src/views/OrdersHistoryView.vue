<template>
  <div>
    <div class="ov-toolbar">
      <div class="ov-toolbar-left">
        <span class="ov-toolbar-title">Order History</span>
        <span class="ov-toolbar-count">{{ filteredOrders.length }} shown</span>
      </div>
      <div class="ov-toolbar-actions">
        <div class="ov-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="search" type="text" placeholder="Search id, items, customer, table..." class="ov-search-input" />
          <button v-if="search" class="ov-search-clear" @click="search=''" aria-label="Clear search">&times;</button>
        </div>
        <select v-model="statusFilter" class="select">
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="served">Served</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button class="btn btn-ghost btn-sm" @click="load(false)" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
    </div>

    <!-- ─── Day window ─── -->
    <div class="oh-range">
      <div class="oh-chips">
        <button
          v-for="p in presets" :key="p.key"
          class="oh-chip" :class="{ active: preset === p.key }"
          type="button" @click="applyPreset(p.key)"
        >{{ p.label }}</button>
      </div>
      <div class="oh-custom">
        <label>From <input type="date" v-model="customFrom" class="input oh-date" @change="preset = 'custom'" /></label>
        <label>To <input type="date" v-model="customTo" class="input oh-date" @change="preset = 'custom'" /></label>
        <button class="btn btn-sm btn-secondary" :disabled="loading" @click="load(false)">Apply</button>
      </div>
    </div>

    <div class="oh-summary">
      <span><strong>{{ filteredOrders.length }}</strong> order{{ filteredOrders.length !== 1 ? 's' : '' }} in view</span>
      <span class="oh-dot">&middot;</span>
      <span>Page total <strong>ETB {{ pageTotal.toFixed(0) }}</strong></span>
      <span class="oh-hint">(cancelled/voided excluded from the total)</span>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table class="ov-compact">
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
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in filteredOrders" :key="o.id">
              <td data-label="ID">#{{ o.id }}</td>
              <td data-label="Items">{{ formatOrderItems(o.items) }}</td>
              <td data-label="Total">
                <span style="font-family:var(--font-mono);font-weight:600">ETB {{ parseFloat(o.total||0).toFixed(0) }}</span>
                <div v-if="o.discount > 0 && o.subtotal && parseFloat(o.subtotal) !== parseFloat(o.total)" style="font-size:.72rem;color:var(--text-muted);text-decoration:line-through">
                  ETB {{ parseFloat(o.subtotal).toFixed(0) }}
                </div>
              </td>
              <td data-label="Payment">
                <span class="payment-tag">{{ o.payment_method || o.payment || '—' }}</span>
                <div v-if="o.payment_status" style="font-size:.7rem;color:var(--text-muted)">{{ o.payment_status }}</div>
              </td>
              <td data-label="Type">{{ o.order_type || o.type || '—' }}</td>
              <td data-label="Table">{{ o.table_number || o.tableNum || '—' }}</td>
              <td data-label="Customer">{{ o.customer || o.name || '—' }}</td>
              <td data-label="Status"><span class="badge" :class="'badge-'+o.status">{{ o.status }}</span></td>
              <td data-label="Date">{{ formatStamp(o.created) }}</td>
            </tr>
            <tr v-if="!loading && !filteredOrders.length">
              <td colspan="9">
                <div class="ov-empty">
                  <div class="ov-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                  <div class="ov-empty-text">{{ search || statusFilter ? 'No orders match your filters' : 'No orders in this window' }}</div>
                  <div class="ov-empty-hint">Pick another day or range above — history keeps every ticket the live screens have moved on from.</div>
                </div>
              </td>
            </tr>
            <tr v-if="loading && !orders.length">
              <td colspan="9"><div class="ov-empty"><div class="ov-empty-text">Loading history…</div></div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination oh-pagination">
        <span>{{ orders.length }} loaded · window {{ from }} → {{ to }}</span>
        <button v-if="hasMore" class="btn btn-sm btn-outline" :disabled="loading" @click="load(true)">
          {{ loading ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, TODAY, isTodayStamp } from '../api'
import { formatOrderItems, isRealOrder } from '../lib/formatters'

/**
 * Order History — the past tense of the Orders screen.
 *
 * The operational screens (Orders, Pipeline, Open Checks) read the live
 * service day; this page reads any day window with server-side filtering
 * (GET /api/orders?from=&to=&limit=&offset=) and a pager. It is read-only on
 * purpose: yesterday's tickets are records, not work in progress — status
 * changes belong to today's board where they can be acted on.
 */

const PAGE = 100

const presets = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
]

const preset = ref('yesterday')
const customFrom = ref('')
const customTo = ref('')
const orders = ref([])
const loading = ref(false)
const search = ref('')
const statusFilter = ref('')
const hasMore = ref(false)

function dayKey(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

const from = computed(() => {
  if (preset.value === 'today') return TODAY()
  if (preset.value === 'yesterday') return dayKey(daysAgo(1))
  if (preset.value === '7d') return dayKey(daysAgo(7))
  if (preset.value === '30d') return dayKey(daysAgo(30))
  return customFrom.value || dayKey(daysAgo(30))
})

const to = computed(() => {
  if (preset.value === 'today') return TODAY()
  if (preset.value === 'yesterday') return dayKey(daysAgo(1))
  // 7d/30d windows end yesterday: today is Orders' job.
  if (preset.value === '7d' || preset.value === '30d') return dayKey(daysAgo(1))
  return customTo.value || dayKey(daysAgo(1))
})

function applyPreset(key) {
  preset.value = key
  load(false)
}

function formatStamp(s) {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

const filteredOrders = computed(() => {
  let result = orders.value
  if (statusFilter.value) result = result.filter(o => o.status === statusFilter.value)
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

/** Money line for the window rows on screen — REAL_ORDERS semantics, the
 *  same rule reports use: voided_at or a cancelled/voided status is not
 *  revenue. */
const pageTotal = computed(() =>
  filteredOrders.value.reduce((sum, o) => (isRealOrder(o) ? sum + (Number(o.total) || 0) : sum), 0)
)

async function load(append) {
  loading.value = true
  try {
    const offset = append ? orders.value.length : 0
    const rows = await apiGet(`orders?from=${from.value}&to=${to.value}&limit=${PAGE}&offset=${offset}`)
    const list = Array.isArray(rows) ? rows : []
    orders.value = append ? orders.value.concat(list) : list
    hasMore.value = list.length === PAGE
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => load(false))
</script>

<style scoped>
/* Day window bar */
.oh-range {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; flex-wrap: wrap; margin-bottom: 12px;
}
.oh-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.oh-chip {
  padding: 7px 14px; border-radius: 99px; cursor: pointer;
  font-size: .78rem; font-weight: 600;
  background: var(--surface); color: var(--text-body);
  border: 1px solid var(--border);
}
.oh-chip.active {
  background: var(--primary, #0B5551); color: #fff;
  border-color: var(--primary, #0B5551);
}
.oh-custom { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.oh-custom label { display: inline-flex; align-items: center; gap: 6px; font-size: .76rem; color: var(--text-muted); }
.oh-date { padding: 6px 10px; font-size: .78rem; width: auto; }

.oh-summary {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: .8rem; color: var(--text-body); margin-bottom: 12px;
}
.oh-summary strong { font-family: var(--font-mono, monospace); }
.oh-dot { color: var(--text-muted); }
.oh-hint { font-size: .7rem; color: var(--text-muted); }

.oh-pagination { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }

@media (max-width: 640px) {
  .oh-range { flex-direction: column; align-items: stretch; }
}
</style>
