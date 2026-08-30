<template>
  <div class="dr" v-if="data">
    <div class="dr-toolbar no-print">
      <button class="btn btn-outline btn-sm" @click="router.back()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <div class="dr-range-tabs">
        <button v-for="opt in RANGE_OPTIONS" :key="opt.key" class="dr-range-tab" :class="{ active: range === opt.key }" @click="selectRange(opt.key)">{{ opt.label }}</button>
      </div>
      <button class="btn btn-primary btn-sm" @click="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
        Print
      </button>
    </div>

    <!-- Report header -->
    <div class="dr-header">
      <h1>Employee Performance Report</h1>
      <div class="dr-header-sub">
        <span>{{ data.staff.firstName }} {{ data.staff.lastName }}</span>
        <span class="dr-role-badge" :style="{ background: roleColor(data.staff.role) + '22', color: roleColor(data.staff.role) }">{{ roleLabel(data.staff.role) }}</span>
        <span>{{ rangeLabel }}</span>
      </div>
    </div>

    <!-- Attendance -->
    <div class="dr-section">
      <h2>Attendance</h2>
      <div class="dr-att-summary">
        <span><strong>{{ data.attendance.totalHours }}h</strong> total</span>
        <span>{{ data.attendance.shifts }} shift{{ data.attendance.shifts === 1 ? '' : 's' }}</span>
      </div>
      <table class="dr-table" v-if="data.attendance.entries.length">
        <thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Late</th></tr></thead>
        <tbody>
          <tr v-for="(e, i) in data.attendance.entries" :key="i">
            <td>{{ e.date }}</td><td>{{ e.clockIn || '—' }}</td><td>{{ e.clockOut || '—' }}</td><td>{{ e.hours || 0 }}h</td>
            <td :class="{ 'dr-late': e.lateMinutes > 0 }">{{ e.lateMinutes > 0 ? e.lateMinutes + 'm' : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Summary cards -->
    <div class="dr-section">
      <h2>Summary</h2>
      <div class="dr-kpi-grid">
        <div class="dr-kpi"><span class="dr-kpi-val">{{ data.summary.ordersTaken }}</span><span class="dr-kpi-lbl">Orders Taken</span></div>
        <div class="dr-kpi"><span class="dr-kpi-val">{{ data.summary.itemsServed }}</span><span class="dr-kpi-lbl">Items Served</span></div>
        <div class="dr-kpi" v-if="data.summary.totalSales"><span class="dr-kpi-val">ETB {{ data.summary.totalSales.toLocaleString() }}</span><span class="dr-kpi-lbl">Total Sales</span></div>
        <div class="dr-kpi" v-if="data.summary.totalTips"><span class="dr-kpi-val">ETB {{ data.summary.totalTips.toLocaleString() }}</span><span class="dr-kpi-lbl">Tips</span></div>
        <div class="dr-kpi" v-if="data.summary.avgServiceMin"><span class="dr-kpi-val">{{ data.summary.avgServiceMin }}m</span><span class="dr-kpi-lbl">Avg Service Time</span></div>
        <div class="dr-kpi" v-if="data.summary.avgPrepMin"><span class="dr-kpi-val">{{ data.summary.avgPrepMin }}m</span><span class="dr-kpi-lbl">Avg Prep Time</span></div>
        <div class="dr-kpi"><span class="dr-kpi-val">{{ data.summary.cancelledOrders }}</span><span class="dr-kpi-lbl">Cancelled</span></div>
        <div class="dr-kpi" v-if="data.summary.paymentsProcessed"><span class="dr-kpi-val">{{ data.summary.paymentsProcessed }}</span><span class="dr-kpi-lbl">Payments Processed</span></div>
        <div class="dr-kpi" v-if="data.summary.refunds"><span class="dr-kpi-val">{{ data.summary.refunds }}</span><span class="dr-kpi-lbl">Refunds</span></div>
        <div class="dr-kpi" v-if="data.summary.dineInOrders"><span class="dr-kpi-val">{{ data.summary.dineInOrders }}</span><span class="dr-kpi-lbl">Dine-in</span></div>
        <div class="dr-kpi" v-if="data.summary.takeawayOrders"><span class="dr-kpi-val">{{ data.summary.takeawayOrders }}</span><span class="dr-kpi-lbl">Takeaway</span></div>
      </div>
    </div>

    <!-- Category breakdown (waiter/chef) -->
    <div class="dr-section" v-if="data.categoryBreakdown && data.categoryBreakdown.length">
      <h2>Items by Category</h2>
      <div class="dr-cat-grid">
        <div v-for="c in data.categoryBreakdown" :key="c.category" class="dr-cat-card">
          <span class="dr-cat-icon">{{ catEmoji(c.category) }}</span>
          <span class="dr-cat-count">{{ c.count }}</span>
          <span class="dr-cat-name">{{ c.category }}</span>
        </div>
      </div>
    </div>

    <!-- Top items (waiter) -->
    <div class="dr-section" v-if="data.topItems && data.topItems.length">
      <h2>Top Items Served</h2>
      <table class="dr-table">
        <thead><tr><th>Item</th><th>Quantity</th></tr></thead>
        <tbody>
          <tr v-for="(item, i) in data.topItems" :key="i">
            <td>{{ item.name }}</td><td>{{ item.count }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Payment method breakdown (cashier) -->
    <div class="dr-section" v-if="data.paymentBreakdown && data.paymentBreakdown.length">
      <h2>Payment Methods</h2>
      <table class="dr-table">
        <thead><tr><th>Method</th><th>Count</th><th>Total</th></tr></thead>
        <tbody>
          <tr v-for="p in data.paymentBreakdown" :key="p.method">
            <td class="dr-cap">{{ p.method }}</td><td>{{ p.count }}</td><td>ETB {{ p.total.toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Delivery stats (driver) -->
    <div class="dr-section" v-if="data.deliveryStats">
      <h2>Delivery Performance</h2>
      <div class="dr-kpi-grid">
        <div class="dr-kpi"><span class="dr-kpi-val">{{ data.deliveryStats.assigned }}</span><span class="dr-kpi-lbl">Assigned</span></div>
        <div class="dr-kpi"><span class="dr-kpi-val">{{ data.deliveryStats.completed }}</span><span class="dr-kpi-lbl">Completed</span></div>
        <div class="dr-kpi" v-if="data.deliveryStats.failed"><span class="dr-kpi-val">{{ data.deliveryStats.failed }}</span><span class="dr-kpi-lbl">Failed</span></div>
        <div class="dr-kpi" v-if="data.deliveryStats.avgDeliveryMin"><span class="dr-kpi-val">{{ data.deliveryStats.avgDeliveryMin }}m</span><span class="dr-kpi-lbl">Avg Delivery Time</span></div>
        <div class="dr-kpi" v-if="data.deliveryStats.cashCollected"><span class="dr-kpi-val">ETB {{ data.deliveryStats.cashCollected.toLocaleString() }}</span><span class="dr-kpi-lbl">Cash Collected</span></div>
        <div class="dr-kpi" v-if="data.deliveryStats.feesCollected"><span class="dr-kpi-val">ETB {{ data.deliveryStats.feesCollected.toLocaleString() }}</span><span class="dr-kpi-lbl">Delivery Fees</span></div>
      </div>
    </div>

    <!-- Waste (cleaner/chef) -->
    <div class="dr-section" v-if="data.waste && data.waste.count > 0">
      <h2>Waste Logged</h2>
      <div class="dr-kpi-grid">
        <div class="dr-kpi"><span class="dr-kpi-val">{{ data.waste.count }}</span><span class="dr-kpi-lbl">Entries</span></div>
        <div class="dr-kpi" v-if="data.waste.totalCost"><span class="dr-kpi-val">ETB {{ data.waste.totalCost.toLocaleString() }}</span><span class="dr-kpi-lbl">Cost</span></div>
      </div>
    </div>
  </div>
  <div v-else class="dr-loading">Loading performance report…</div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { apiGet, TODAY } from '../api'

const router = useRouter()
const route = useRoute()
const data = ref(null)
const window = globalThis

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
]
const range = ref('today')

const rangeLabel = computed(() => {
  if (!data.value) return ''
  return `${data.value.from} → ${data.value.to}`
})

function startOfWeek(d = new Date()) { const day = d.getDay() || 7; const mon = new Date(d); mon.setDate(d.getDate() - (day - 1)); mon.setHours(0,0,0,0); return mon }
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function iso(d) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}` }

function currentRange() {
  const now = new Date()
  if (range.value === 'today') return { from: iso(now), to: iso(now) }
  if (range.value === 'yesterday') { const y = new Date(now); y.setDate(y.getDate()-1); return { from: iso(y), to: iso(y) } }
  if (range.value === 'week') return { from: iso(startOfWeek(now)), to: iso(now) }
  if (range.value === 'month') return { from: iso(startOfMonth(now)), to: iso(now) }
  return { from: iso(now), to: iso(now) }
}

function selectRange(key) { range.value = key; load() }

const ROLE_COLORS = { manager: '#0F7B78', 'head-chef': '#DC2626', 'assistant-chef': '#F59E0B', 'head-waiter': '#2563EB', cashier: '#0EA5E9', 'delivery-staff': '#6366F1', cleaner: '#10B981', accountant: '#9333EA' }
function roleColor(r) { return ROLE_COLORS[r] || '#64748B' }
function roleLabel(r) { return r ? r.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : '' }

function catEmoji(cat) {
  const c = String(cat || '').toLowerCase()
  if (c.includes('coffee')) return '☕'
  if (c.includes('tea')) return '🍵'
  if (c.includes('drink') || c.includes('beverage') || c.includes('juice')) return '🥤'
  if (c.includes('dessert') || c.includes('cake') || c.includes('pastry')) return '🍰'
  if (c.includes('food') || c.includes('main') || c.includes('breakfast')) return '🍔'
  return '🍽️'
}

async function load() {
  const id = route.params.id
  if (!id) return
  try {
    const { from, to } = currentRange()
    const res = await apiGet(`employees/${id}/performance?from=${from}&to=${to}`)
    if (res && res.ok) data.value = res
  } catch (e) { console.error('Performance load failed', e) }
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<style scoped>
.dr { max-width: 800px; margin: 0 auto; }
.dr-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.dr-range-tabs { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.dr-range-tab { background: none; border: none; padding: 5px 10px; font-size: .78rem; cursor: pointer; border-radius: 6px; color: var(--text-muted); }
.dr-range-tab.active { background: var(--primary); color: #fff; }

.dr-header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid var(--text-heading); }
.dr-header h1 { font-size: 1.4rem; margin: 0 0 6px; }
.dr-header-sub { display: flex; justify-content: center; gap: 10px; font-size: .85rem; color: var(--text-muted); flex-wrap: wrap; align-items: center; }
.dr-role-badge { padding: 2px 8px; border-radius: 99px; font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }

.dr-section { margin-bottom: 24px; }
.dr-section h2 { font-size: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 12px; }
.dr-att-summary { display: flex; gap: 16px; font-size: .85rem; color: var(--text-muted); margin-bottom: 8px; }
.dr-att-summary strong { color: var(--text-heading); }
.dr-late { color: #DC2626; font-weight: 600; }

.dr-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
.dr-kpi { text-align: center; padding: 12px; border: 1px solid var(--border); border-radius: 8px; }
.dr-kpi-val { display: block; font-size: 1.2rem; font-weight: 700; color: var(--text-heading); }
.dr-kpi-lbl { display: block; font-size: .68rem; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: .04em; }

.dr-cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
.dr-cat-card { text-align: center; padding: 10px; border: 1px solid var(--border); border-radius: 8px; }
.dr-cat-icon { display: block; font-size: 1.5rem; margin-bottom: 4px; }
.dr-cat-count { display: block; font-size: 1.1rem; font-weight: 700; color: var(--text-heading); }
.dr-cat-name { display: block; font-size: .68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }

.dr-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.dr-table th { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: .72rem; text-transform: uppercase; }
.dr-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); }
.dr-cap { text-transform: capitalize; }

.dr-loading { text-align: center; padding: 40px; color: var(--text-muted); }
@media print { .no-print { display: none !important; } .dr { max-width: none; } }
</style>
