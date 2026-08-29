<template>
  <div class="perf">
    <!-- Page header -->
    <div class="perf-header">
      <div>
        <h2 class="perf-title">My Activity</h2>
        <p class="perf-sub">{{ actorName }} · {{ roleLabel }} · {{ totalEntries }} audit entries in range</p>
      </div>
      <div class="perf-header-actions">
        <button class="btn btn-outline btn-sm" @click="loadAll" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               :class="{ 'perf-spin': loading }">
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Range filter -->
    <div class="perf-range-bar">
      <div class="perf-range-tabs" role="tablist" aria-label="Date range">
        <button v-for="opt in RANGE_OPTIONS" :key="opt.key"
                role="tab"
                :aria-selected="range === opt.key"
                class="perf-range-tab"
                :class="{ active: range === opt.key }"
                @click="selectRange(opt.key)">
          {{ opt.label }}
        </button>
      </div>
      <div class="perf-range-custom" v-if="range === 'custom'">
        <label>From <input type="date" v-model="customFrom" class="input input-sm" /></label>
        <label>To <input type="date" v-model="customTo" class="input input-sm" /></label>
        <button class="btn btn-secondary btn-sm" @click="applyCustom">Apply</button>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading && !kpis.length" class="kpi-grid">
      <div v-for="i in 4" :key="i" class="kpi-card">
        <div class="kpi-bar teal"></div>
        <div class="skel-line skel-label"></div>
        <div class="skel-line skel-value"></div>
        <div class="skel-line skel-sub"></div>
      </div>
    </div>

    <!-- Role-specific KPI tiles -->
    <div v-else class="kpi-grid">
      <div v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
        <div class="kpi-bar" :class="kpi.bar || 'teal'"></div>
        <div class="kpi-top-row">
          <div class="kpi-label">{{ kpi.label }}</div>
          <span class="kpi-icon" v-if="kpi.icon" v-html="kpi.icon"></span>
        </div>
        <div class="kpi-value" :style="kpi.color ? { color: kpi.color } : {}">{{ kpi.value }}</div>
        <div class="kpi-sub" v-if="kpi.sub" v-html="kpi.sub"></div>
      </div>
      <div v-if="!kpis.length" class="kpi-card kpi-empty">
        <div class="kpi-label">No activity in this range</div>
        <div class="kpi-sub">Pick a different range, or do something — every order, delivery, payment and adjustment lands here automatically.</div>
      </div>
    </div>

    <!-- Breakdown by entity / action -->
    <div class="perf-breakdown-grid" v-if="!loading && (entityBreakdown.length || actionBreakdown.length)">
      <div class="card">
        <h3 class="perf-card-title">By Area</h3>
        <ul class="perf-bar-list">
          <li v-for="e in entityBreakdown" :key="e.key">
            <div class="perf-bar-row">
              <span class="perf-bar-label">{{ e.label }}</span>
              <span class="perf-bar-count">{{ e.count }}</span>
            </div>
            <div class="perf-bar-track"><div class="perf-bar-fill" :style="{ width: e.pct + '%', background: e.color }"></div></div>
          </li>
        </ul>
      </div>
      <div class="card">
        <h3 class="perf-card-title">By Action</h3>
        <ul class="perf-bar-list">
          <li v-for="a in actionBreakdown" :key="a.key">
            <div class="perf-bar-row">
              <span class="perf-bar-label">{{ a.label }}</span>
              <span class="perf-bar-count">{{ a.count }}</span>
            </div>
            <div class="perf-bar-track"><div class="perf-bar-fill" :style="{ width: a.pct + '%', background: a.color }"></div></div>
          </li>
        </ul>
      </div>
    </div>

    <!-- Inline filter -->
    <div class="card perf-filter-card" v-if="!loading">
      <div class="perf-filter-row">
        <label class="perf-filter-field">
          <span>Area</span>
          <select v-model="filters.entity" class="input input-sm" @change="applyFilters">
            <option value="">All</option>
            <option v-for="e in entityOptions" :key="e" :value="e">{{ entityLabel(e) }}</option>
          </select>
        </label>
        <label class="perf-filter-field">
          <span>Action</span>
          <select v-model="filters.action" class="input input-sm" @change="applyFilters">
            <option value="">All</option>
            <option v-for="a in actionOptions" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>
        <label class="perf-filter-field perf-filter-search">
          <span>Search</span>
          <input v-model="filters.q" class="input input-sm" placeholder="Search summary, reason, id…" @input="applyFilters" />
        </label>
      </div>
    </div>

    <!-- Activity log table -->
    <div class="table-wrap" v-if="!loading">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>When</th><th>What</th><th>Area</th><th>Action</th><th>Summary</th><th>Reason</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in filteredEntries" :key="e.id">
              <td data-label="When">{{ formatTime(e.at) }}</td>
              <td data-label="What" style="font-family:var(--font-mono)">{{ e.entity_id || '—' }}</td>
              <td data-label="Area"><span class="badge badge-pending">{{ entityLabel(e.entity) }}</span></td>
              <td data-label="Action"><span class="badge" :class="actionBadge(e.action)">{{ e.action }}</span></td>
              <td data-label="Summary">{{ changeSummary(e) }}</td>
              <td data-label="Reason">{{ e.reason || '—' }}</td>
            </tr>
            <tr v-if="!filteredEntries.length">
              <td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">
                No entries match these filters
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>{{ filteredEntries.length }} of {{ totalEntries }} {{ filteredEntries.length !== totalEntries ? 'matching' : 'entries' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, TODAY } from '../api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const entries = ref([])
const totalEntries = computed(() => entries.value.length)

// ----- Range filter -----
const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
]
const range = ref('today')
const customFrom = ref(TODAY())
const customTo = ref(TODAY())

function startOfWeek(d = new Date()) {
  const day = d.getDay() || 7  // Mon=1..Sun=7
  const mon = new Date(d)
  mon.setDate(d.getDate() - (day - 1))
  mon.setHours(0, 0, 0, 0)
  return mon
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1)
}
function iso(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function endOfDayIso(d) {
  return `${iso(d)}T23:59:59`
}

function currentRange() {
  const now = new Date()
  if (range.value === 'today') return { from: iso(now), to: endOfDayIso(now) }
  if (range.value === 'week')  return { from: iso(startOfWeek(now)), to: endOfDayIso(now) }
  if (range.value === 'month') return { from: iso(startOfMonth(now)), to: endOfDayIso(now) }
  if (range.value === 'year')  return { from: iso(startOfYear(now)), to: endOfDayIso(now) }
  if (range.value === 'custom') {
    const from = customFrom.value || iso(now)
    const to = customTo.value || iso(now)
    return { from, to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59` : to }
  }
  return { from: iso(now), to: endOfDayIso(now) }
}

function selectRange(key) {
  range.value = key
  if (key !== 'custom') loadAll()
}
function applyCustom() { loadAll() }

// ----- Filters within range -----
const filters = ref({ entity: '', action: '', q: '' })

const ENTITY_LABELS = {
  orders: 'Orders',
  payments: 'Payments',
  inventory: 'Inventory',
  menu: 'Menu',
  staff: 'Staff',
  timeclock: 'Time Clock',
  shifts: 'Shifts',
  cashdrawer: 'Cash Drawer',
  expenses: 'Expenses',
  purchases: 'Purchases',
  recipes: 'Recipes',
  delivery: 'Delivery',
  tips: 'Tips',
  leave_requests: 'Leave',
  overtime: 'Overtime',
  staff_adjustments: 'Adjustments',
}
function entityLabel(e) { return ENTITY_LABELS[e] || (e ? e[0].toUpperCase() + e.slice(1) : '—') }

const entityOptions = computed(() => {
  // Auto-populate from data, plus a curated superset
  const seen = new Set(entries.value.map(e => e.entity).filter(Boolean))
  const curated = Object.keys(ENTITY_LABELS)
  return Array.from(new Set([...seen, ...curated])).sort()
})
const actionOptions = computed(() => {
  const seen = new Set(entries.value.map(e => e.action).filter(Boolean))
  return Array.from(seen).sort()
})

function actionBadge(action) {
  switch (action) {
    case 'create': return 'badge-new'
    case 'update': case 'advance': case 'batch-assign': return 'badge-pending'
    case 'void': case 'refund': case 'cancel': case 'cancelled': return 'badge-danger'
    case 'adjust': case 'verify': return 'badge-pending'
    default: return ''
  }
}

function changeSummary(e) {
  const a = e.after
  const b = e.before
  if (!a && !b) return '—'
  if (!a) return 'deleted'
  if (typeof a === 'object') {
    const parts = Object.keys(a).slice(0, 3).map(k => {
      const av = a[k]
      const bv = b && b[k] !== undefined ? b[k] : null
      const disp = (v) => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : String(v)
      if (bv !== null && String(bv) !== String(av)) return `${k}: ${disp(bv)} → ${disp(av)}`
      return `${k}: ${disp(av)}`
    })
    return parts.join(', ') || '—'
  }
  return String(a).slice(0, 80)
}

function formatTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return isNaN(d) ? isoStr : d.toLocaleString()
}

const filteredEntries = computed(() => {
  let list = entries.value
  if (filters.value.entity) list = list.filter(e => e.entity === filters.value.entity)
  if (filters.value.action) list = list.filter(e => e.action === filters.value.action)
  if (filters.value.q) {
    const q = filters.value.q.toLowerCase()
    list = list.filter(e => {
      const hay = [e.entity, e.action, e.entity_id, e.reason, changeSummary(e)]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }
  return list
})

function applyFilters() { /* reactive; no fetch needed */ }

// ----- KPI builders per role -----
const ENTITY_COLORS = {
  orders: '#0F7B78', payments: '#18B4B7', inventory: '#D6B36A', menu: '#E4CB99',
  staff: '#2E7D32', timeclock: '#D97706', shifts: '#9333EA', cashdrawer: '#0EA5E9',
  expenses: '#DC2626', purchases: '#F59E0B', recipes: '#10B981', delivery: '#6366F1',
  tips: '#EC4899', leave_requests: '#64748B', overtime: '#A855F7', staff_adjustments: '#EF4444',
}

const actorName = computed(() => {
  if (!auth.user) return 'You'
  return `${auth.user.firstName} ${auth.user.lastName || ''}`.trim()
})
const roleLabel = computed(() => {
  if (!auth.roleKey) return ''
  return auth.roleKey.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
})

const entityBreakdown = computed(() => {
  const map = {}
  for (const e of entries.value) {
    const k = e.entity || 'other'
    if (!map[k]) map[k] = { key: k, label: entityLabel(k), count: 0, color: ENTITY_COLORS[k] || '#94a3b8' }
    map[k].count++
  }
  const list = Object.values(map).sort((a, b) => b.count - a.count).slice(0, 6)
  const max = list.length ? list[0].count : 1
  list.forEach(e => { e.pct = Math.max(4, Math.round((e.count / max) * 100)) })
  return list
})

const actionBreakdown = computed(() => {
  const map = {}
  for (const e of entries.value) {
    const k = e.action || 'other'
    if (!map[k]) map[k] = { key: k, label: k, count: 0, color: ENTITY_COLORS.orders }
    map[k].count++
  }
  const list = Object.values(map).sort((a, b) => b.count - a.count).slice(0, 6)
  const max = list.length ? list[0].count : 1
  list.forEach(a => { a.pct = Math.max(4, Math.round((a.count / max) * 100)) })
  return list
})

/**
 * Per-role KPIs derived from the audit log slice for the signed-in user.
 *
 * The audit log records every change to orders, payments, inventory, staff,
 * shifts, cash drawer, expenses, purchases, recipes, delivery, tips, leave,
 * overtime and staff_adjustments — with actor_id set to whoever did it. So a
 * single `/api/audit?actor_id=<me>&from=<…>&to=<…>` call returns enough to
 * compute every per-role "what did I do today" metric, without a new endpoint
 * per role.
 *
 * What each role gets:
 *  - Manager:        orders taken, payments verified, expenses booked, staff
 *                    edits, cash drawer ops, deliveries settled — the audit
 *                    trail is the manager's whole day.
 *  - Head Chef:      dishes sent (order status → ready/served), inventory
 *                    adjustments, recipes edited, stock-control writes, waste
 *                    logged. Plus a "tickets still in prep" rolling count.
 *  - Assistant Chef: dishes sent (status → ready), inventory reads (the API
 *                    does not let them write), recipes viewed.
 *  - Head Waiter:    tables seated / released, orders taken, tips recorded,
 *                    reservations created.
 *  - Cashier:        payments verified, cash drawer ops, tips recorded,
 *                    refunds issued, settlements.
 *  - Delivery Staff: deliveries assigned, picked up, delivered, payments
 *                    recorded, tips recorded — the job-list as a counter.
 *  - Cleaner:        waste entries logged, inventory reads.
 *  - Accountant:     expenses booked, reports viewed, payroll runs (none yet
 *                    since accountant has read-only on most things).
 */
const kpis = ref([])

function countBy(predicate) {
  return entries.value.filter(predicate).length
}

function buildKpis() {
  const role = auth.roleKey
  const out = []

  if (role === 'manager') {
    out.push(
      { label: 'Orders Touched', value: countBy(e => e.entity === 'orders'), sub: 'created · updated · voided', bar: 'teal' },
      { label: 'Payments Verified', value: countBy(e => e.entity === 'payments'), sub: 'verify · refund · adjust', bar: 'blue' },
      { label: 'Expenses Booked', value: countBy(e => e.entity === 'expenses'), sub: 'created · adjusted', bar: 'red' },
      { label: 'Staff Edits', value: countBy(e => e.entity === 'staff'), sub: 'creates · updates · resets', bar: 'green' },
      { label: 'Cash Drawer Ops', value: countBy(e => e.entity === 'cashdrawer'), sub: 'opens · paid in/out · closes', bar: 'amber' },
      { label: 'Deliveries Settled', value: countBy(e => e.entity === 'delivery'), sub: 'assigned · advanced · settled', bar: 'indigo' },
    )
  } else if (role === 'head-chef' || role === 'assistant-chef') {
    // Dishes sent = order status updates where after.status is ready/served.
    const dishesSent = countBy(e =>
      e.entity === 'orders' && e.action === 'update' &&
      e.after && (e.after.status === 'ready' || e.after.status === 'served'))
    const ticketsStarted = countBy(e =>
      e.entity === 'orders' && e.action === 'update' &&
      e.after && e.after.status === 'preparing')
    out.push(
      { label: 'Dishes Sent', value: dishesSent, sub: 'tickets moved to ready/served', bar: 'teal' },
      { label: 'Tickets Started', value: ticketsStarted, sub: 'orders moved into preparing', bar: 'amber' },
      { label: 'Inventory Adjustments', value: countBy(e => e.entity === 'inventory'), sub: 'stock counts · corrections', bar: 'yellow' },
      { label: 'Waste Logged', value: countBy(e => e.entity === 'waste' || e.entity === 'inventory' && e.action === 'waste'), sub: 'spoilage recorded', bar: 'red' },
    )
    if (role === 'head-chef') {
      out.push(
        { label: 'Recipes Edited', value: countBy(e => e.entity === 'recipes'), sub: 'BOM changes', bar: 'green' },
        { label: 'Stock Control Writes', value: countBy(e => e.entity === 'purchases' || e.action === 'adjust'), sub: 'suppliers · purchases', bar: 'blue' },
      )
    } else {
      out.push(
        { label: 'Recipes Viewed', value: countBy(e => e.entity === 'recipes' && e.action === 'read'), sub: '(audited if enabled)', bar: 'green' },
        { label: 'Time Clock Punches', value: countBy(e => e.entity === 'timeclock'), sub: 'clock in · out', bar: 'indigo' },
      )
    }
  } else if (role === 'head-waiter') {
    out.push(
      { label: 'Tables Seated', value: countBy(e => e.entity === 'tables' && e.action === 'update' && e.after && e.after.status === 'occupied'), sub: 'guests seated', bar: 'teal' },
      { label: 'Tables Released', value: countBy(e => e.entity === 'tables' && e.action === 'update' && e.after && e.after.status === 'available'), sub: 'cleared after service', bar: 'green' },
      { label: 'Orders Taken', value: countBy(e => e.entity === 'orders' && e.action === 'create'), sub: 'new checks opened', bar: 'amber' },
      { label: 'Tips Recorded', value: countBy(e => e.entity === 'tips'), sub: 'cash · card', bar: 'pink' },
      { label: 'Reservations', value: countBy(e => e.entity === 'reservations' || e.action === 'create' && e.entity === 'reservations'), sub: 'booked · updated', bar: 'indigo' },
    )
  } else if (role === 'cashier') {
    out.push(
      { label: 'Payments Verified', value: countBy(e => e.entity === 'payments' && (e.action === 'verify' || e.action === 'create')), sub: 'telebirr · cbe · cash', bar: 'teal' },
      { label: 'Cash Drawer Ops', value: countBy(e => e.entity === 'cashdrawer'), sub: 'opens · paid in/out · closes', bar: 'amber' },
      { label: 'Refunds Issued', value: countBy(e => e.entity === 'payments' && e.action === 'refund'), sub: 'voided · refunded', bar: 'red' },
      { label: 'Tips Recorded', value: countBy(e => e.entity === 'tips'), sub: 'tips taken', bar: 'pink' },
      { label: 'Orders Settled', value: countBy(e => e.entity === 'orders' && e.action === 'update' && e.after && /paid|settled|completed/.test(e.after.status || '')), sub: 'checks closed', bar: 'green' },
    )
  } else if (role === 'delivery-staff') {
    const taken     = countBy(e => e.entity === 'delivery' && e.action === 'update' && e.after && e.after.status === 'assigned')
    const picked    = countBy(e => e.entity === 'delivery' && e.action === 'update' && e.after && e.after.status === 'picked_up')
    const delivered = countBy(e => e.entity === 'delivery' && e.action === 'update' && e.after && e.after.status === 'delivered')
    out.push(
      { label: 'Jobs Taken', value: taken, sub: 'assigned to me', bar: 'amber' },
      { label: 'Picked Up', value: picked, sub: 'left the store', bar: 'blue' },
      { label: 'Delivered', value: delivered, sub: 'completed deliveries', bar: 'green' },
      { label: 'Payments Recorded', value: countBy(e => e.entity === 'payments' && e.action === 'create'), sub: 'cash · transfer on doorstep', bar: 'teal' },
      { label: 'Tips Recorded', value: countBy(e => e.entity === 'tips'), sub: 'tips left by guests', bar: 'pink' },
    )
  } else if (role === 'cleaner') {
    out.push(
      { label: 'Waste Logged', value: countBy(e => e.entity === 'waste' || (e.entity === 'inventory' && e.action === 'waste')), sub: 'spoilage · breakage', bar: 'red' },
      { label: 'Tables Cleared', value: countBy(e => e.entity === 'tables' && e.action === 'update' && e.after && e.after.status === 'available'), sub: 'reset after service', bar: 'green' },
      { label: 'Time Clock Punches', value: countBy(e => e.entity === 'timeclock'), sub: 'clock in · out', bar: 'indigo' },
    )
  } else if (role === 'accountant') {
    out.push(
      { label: 'Expenses Booked', value: countBy(e => e.entity === 'expenses' && e.action === 'create'), sub: 'bills · supplier invoices', bar: 'red' },
      { label: 'Expenses Adjusted', value: countBy(e => e.entity === 'expenses' && e.action === 'update'), sub: 'corrections · reclasses', bar: 'amber' },
      { label: 'Reports Viewed', value: countBy(e => e.entity === 'reports' || e.action === 'read'), sub: '(audited if enabled)', bar: 'blue' },
      { label: 'Time Clock Punches', value: countBy(e => e.entity === 'timeclock'), sub: 'clock in · out', bar: 'indigo' },
    )
  }

  kpis.value = out
}

// ----- Load -----
async function loadAll() {
  loading.value = true
  try {
    const { from, to } = currentRange()
    const me = auth.user?.id || ''
    if (!me) {
      entries.value = []
    } else {
      const params = new URLSearchParams()
      params.set('actor_id', me)
      params.set('from', from)
      params.set('to', to)
      params.set('limit', '500')
      const res = await apiGet(`audit?${params.toString()}`)
      entries.value = (res && res.entries) || []
    }
    buildKpis()
  } catch (e) {
    console.error('Performance audit load failed', e)
    entries.value = []
    kpis.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped>
.perf { padding: 0; }
.perf-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
.perf-title { font-size: 1.2rem; font-weight: 700; color: var(--text-heading); margin: 0; }
.perf-sub { font-size: .8rem; color: var(--text-muted); margin: 4px 0 0; }
.perf-header-actions { display:flex; gap:8px; }

.perf-range-bar { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
.perf-range-tabs { display:inline-flex; gap:4px; background: var(--surface); border:1px solid var(--border); border-radius: var(--radius-sm); padding:4px; width: fit-content; flex-wrap: wrap; }
.perf-range-tab { background: transparent; border: none; padding: 6px 14px; font-size: .8rem; font-weight: 500; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-xs); transition: all .15s; min-height: 32px; }
.perf-range-tab:hover { color: var(--text-heading); background: var(--bg); }
.perf-range-tab.active { background: var(--primary); color: #fff; }
.perf-range-custom { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.perf-range-custom label { display:flex; flex-direction:column; gap:3px; font-size:.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing:.04em; }

.perf-breakdown-grid { display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:14px; }
.perf-card-title { font-size:.9rem; font-weight:600; color: var(--text-heading); margin:0 0 10px; }
.perf-bar-list { list-style:none; padding:0; margin:0; }
.perf-bar-list li { margin-bottom: 10px; }
.perf-bar-row { display:flex; justify-content:space-between; align-items:baseline; font-size:.78rem; margin-bottom:3px; }
.perf-bar-label { color: var(--text-heading); font-weight: 500; }
.perf-bar-count { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.perf-bar-track { height: 6px; background: var(--neutral-50); border-radius: 3px; overflow:hidden; }
.perf-bar-fill { height: 100%; border-radius: 3px; transition: width .35s var(--ease); }

.perf-filter-card { padding: 12px 14px; margin-bottom:14px; }
.perf-filter-row { display:grid; grid-template-columns: 1fr 1fr 2fr; gap:10px; }
.perf-filter-field { display:flex; flex-direction:column; gap:3px; font-size:.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing:.04em; }
.perf-filter-field input, .perf-filter-field select { text-transform: none; letter-spacing: 0; }

.perf-spin { animation: perf-spin 1s linear infinite; }
@keyframes perf-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

.kpi-empty { padding: 20px; text-align:center; }
.kpi-empty .kpi-label { font-size:.95rem; margin-bottom:6px; }

@media (max-width: 768px) {
  .perf-header { flex-direction: column; align-items: stretch; }
  .perf-header-actions { justify-content: flex-end; }
  .perf-range-tabs { width: 100%; }
  .perf-range-tab { flex: 1 1 auto; min-height: 36px; padding: 6px 8px; font-size: .76rem; }
  .perf-range-custom { flex-direction: column; align-items: stretch; }
  .perf-range-custom label { width: 100%; }
  .perf-breakdown-grid { grid-template-columns: 1fr; }
  .perf-filter-row { grid-template-columns: 1fr; }
  .perf-filter-card { padding: 10px; }
}
</style>
