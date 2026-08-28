<template>
  <div>
    <!-- Page Header -->
    <div class="dash-header">
      <div>
        <h1 class="dash-greeting">{{ greeting }}, {{ auth.user?.firstName || 'there' }}</h1>
        <p class="dash-subtitle">{{ fullDate }} · {{ roleLabel }}</p>
      </div>
      <button class="btn btn-outline btn-sm dash-refresh" @click="loadDashboard" :disabled="loading" title="Refresh dashboard">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'dash-spin': loading }"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        Refresh
      </button>
    </div>

    <!-- Waiter Quick Actions -->
    <div v-if="auth.roleKey === 'head-waiter'" class="dash-quick-actions">
      <button class="dash-qa" @click="router.push('/app/tables')">
        <span class="dash-qa-icon" v-html="ICONS.tables"></span>
        <span class="dash-qa-label">Floor Plan</span>
      </button>
      <button class="dash-qa dash-qa-primary" @click="router.push('/app/menu-view')">
        <span class="dash-qa-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </span>
        <span class="dash-qa-label">New Order</span>
      </button>
      <button class="dash-qa" @click="router.push('/app/orders')">
        <span class="dash-qa-icon" v-html="ICONS.orders"></span>
        <span class="dash-qa-label">Orders</span>
      </button>
      <button class="dash-qa" @click="router.push('/app/reservations')">
        <span class="dash-qa-icon" v-html="ICONS.reservations"></span>
        <span class="dash-qa-label">Reservations</span>
      </button>
    </div>

    <!-- Cashier Quick Actions Bar + Live Till Float Card -->
    <div v-if="auth.roleKey === 'cashier'">
      <div class="dash-quick-actions" style="grid-template-columns:repeat(5,1fr)">
        <button class="dash-qa dash-qa-primary" @click="router.push('/app/menu-view')">
          <span class="dash-qa-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>
          <span class="dash-qa-label">Quick Sale</span>
        </button>
        <button class="dash-qa" @click="router.push('/app/cashdrawer')">
          <span class="dash-qa-icon" v-html="ICONS.cash"></span>
          <span class="dash-qa-label">Till Mgmt</span>
        </button>
        <button class="dash-qa" @click="router.push('/app/orders')">
          <span class="dash-qa-icon" v-html="ICONS.orders"></span>
          <span class="dash-qa-label">Open Checks</span>
        </button>
        <button class="dash-qa" @click="router.push('/app/cashdrawer')" style="position:relative">
          <span class="dash-qa-icon" v-html="ICONS.cashDrawer"></span>
          <span class="dash-qa-label">Paid In/Out</span>
          <span v-if="digitalPending.length" class="qa-badge">{{ digitalPending.length }}</span>
        </button>
        <button class="dash-qa" @click="fetchShiftAudit">
          <span class="dash-qa-icon" v-html="ICONS.audit"></span>
          <span class="dash-qa-label">Audit Log</span>
        </button>
      </div>

      <!-- Live Till Float Status Card -->
      <div v-if="tillStatus" class="till-float-card">
        <div class="till-float-left">
          <div class="till-status-dot" :class="tillStatus.open ? 'dot-open' : 'dot-closed'"></div>
          <div>
            <div class="till-status-label">{{ tillStatus.open ? 'Drawer Open' : 'No Active Drawer' }}</div>
            <div class="till-status-sub" v-if="tillStatus.open">Opened {{ tillStatus.openedAt }}</div>
          </div>
        </div>
        <div class="till-float-stats" v-if="tillStatus.open">
          <div class="till-stat">
            <span class="till-stat-label">Float</span>
            <span class="till-stat-val">ETB {{ tillStatus.opening }}</span>
          </div>
          <div class="till-stat">
            <span class="till-stat-label">Cash Sales</span>
            <span class="till-stat-val" style="color:var(--success)">ETB {{ tillStatus.cashSales }}</span>
          </div>
          <div class="till-stat">
            <span class="till-stat-label">Expected</span>
            <span class="till-stat-val" style="font-weight:700">ETB {{ tillStatus.expected }}</span>
          </div>
        </div>
        <button class="btn btn-sm btn-outline" @click="router.push('/app/cashdrawer')">{{ tillStatus.open ? 'Manage Till' : 'Open Drawer' }}</button>
      </div>
    </div>

    <!-- KPI Grid — skeleton while loading first fetch -->
    <div class="kpi-grid">
      <template v-if="loading && !kpis.length">
        <div v-for="i in 4" :key="i" class="kpi-card">
          <div class="kpi-bar teal"></div>
          <div class="skel-line skel-label"></div>
          <div class="skel-line skel-value"></div>
          <div class="skel-line skel-sub"></div>
        </div>
      </template>
      <template v-else>
        <div v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
          <div class="kpi-bar" :class="kpi.bar"></div>
          <div class="kpi-top-row">
            <div class="kpi-label">{{ kpi.label }}</div>
            <span class="kpi-icon" v-if="kpi.icon" v-html="kpi.icon"></span>
          </div>
          <div class="kpi-value" :style="kpi.color ? { color: kpi.color } : {}">{{ kpi.value }}</div>
          <div class="kpi-sub" v-if="kpi.sub" v-html="kpi.sub"></div>
        </div>
      </template>
    </div>

    <!-- Charts (Manager only) -->
    <div v-if="showCharts && auth.roleKey !== 'cashier'" class="chart-grid">
      <div class="chart-card">
        <h3>Revenue (7 days)</h3>
        <canvas ref="revenueChart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Expense Breakdown</h3>
        <canvas ref="expenseChart"></canvas>
      </div>
    </div>

    <!-- Cashier Payment Breakdown Donut -->
    <div v-if="auth.roleKey === 'cashier' && cashierPayBreakdown.length" class="chart-grid" style="grid-template-columns:1fr 1fr">
      <div class="chart-card">
        <h3>Payment Method Mix</h3>
        <canvas ref="payBreakdownChart" style="max-height:200px"></canvas>
      </div>
      <!-- Top-Selling Items Pad -->
      <div class="chart-card">
        <h3>Top Items — Fast Order</h3>
        <div class="top-items-grid">
          <button
            v-for="item in topItems"
            :key="item.id"
            class="top-item-btn"
            @click="quickAddItem(item)"
          >
            <span class="top-item-name">{{ item.name }}</span>
            <span class="top-item-price">ETB {{ parseFloat(item.price || item.base_price || 0).toFixed(0) }}</span>
          </button>
          <div v-if="!topItems.length" style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:.82rem;padding:20px">Top items loading…</div>
        </div>
      </div>
    </div>

    <!-- Recent Orders & Low Stock -->
    <div class="dash-grid">
      <div class="card" v-if="showRecentOrders">
        <div class="card-header">
          <h3>Recent Orders</h3>
          <span v-if="recentOrders.filter(o => o.status === 'new').length" class="badge badge-new">
            {{ recentOrders.filter(o => o.status === 'new').length }} new
          </span>
        </div>
        <div v-if="recentOrders.length">
          <div v-for="o in recentOrders.slice(0, 5)" :key="o.id" class="queue-item">
            <span>#{{ shortId(o.id) }} — <strong>{{ orderSummary(o) }}</strong></span>
            <span>
              <span class="badge" :class="'badge-' + o.status">{{ o.status }}</span>
              &nbsp;ETB {{ parseFloat(o.total || 0).toFixed(0) }}
            </span>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
          </div>
          <div>No orders today</div>
        </div>
      </div>
      <div class="card" v-if="showLowStock">
        <div class="card-header">
          <h3>Low Stock Alerts</h3>
          <span v-if="lowStockItems.length" class="badge badge-danger">{{ lowStockItems.length }}</span>
        </div>
        <div v-if="lowStockItems.length">
          <div v-for="i in lowStockItems.slice(0, 5)" :key="i.id" class="queue-item">
            <span>{{ i.name }} <span class="badge badge-low">{{ i.quantity }}/{{ i.minLevel }} {{ i.unit }}</span></span>
            <span class="badge badge-low">Reorder</span>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-state-icon" style="color:var(--success)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>All items stocked</div>
        </div>
      </div>
      <!-- Cleaner: the role's own work record. The Waste Log screen is where
           entries are made; this card answers "did I log the bin run?" without
           leaving the dashboard. Full width: it is the only card the role gets. -->
      <div class="card" v-if="auth.roleKey === 'cleaner'" style="grid-column:1/-1">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <h3>Waste Logged Today</h3>
          <button class="btn btn-sm btn-outline" @click="router.push('/app/waste')">Open Waste Log</button>
        </div>
        <div v-if="recentWaste.length">
          <div v-for="w in recentWaste" :key="w.id" class="queue-item">
            <span><strong>{{ w.item || w.name || 'Item' }}</strong> · {{ w.quantity ?? w.qty ?? '-' }} {{ w.unit || '' }} · <span style="text-transform:capitalize">{{ w.reason || '—' }}</span></span>
            <span>ETB {{ parseFloat(w.cost ?? w.est_cost ?? 0).toFixed(0) }}</span>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div>No waste logged yet today</div>
        </div>
      </div>
    </div>

    <!-- Cashier-Specific Real-Time Feeds & Audit Trail -->
    <div v-if="auth.roleKey === 'cashier' || auth.roleKey === 'manager'" class="dash-grid" style="margin-top:20px">
      <!-- Digital Transfer Verification Feed -->
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <h3>Pending Digital Payment Verifications</h3>
          <span class="badge badge-warning" v-if="digitalPending.length">{{ digitalPending.length }} pending</span>
          <span class="badge badge-fulfilled" v-else>All verified</span>
        </div>
        <div v-if="digitalPending.length">
          <div v-for="p in digitalPending.slice(0, 5)" :key="p.id" class="queue-item" style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>ETB {{ Math.round(p.amount || 0) }}</strong> · <span style="text-transform:uppercase;font-size:.8rem;font-weight:600">{{ p.method }}</span>
              <div style="font-size:.75rem;color:var(--text-muted)">Ref: {{ p.reference || 'N/A' }} · Order #{{ shortId(p.order_id || p.orderId || '') }}</div>
            </div>
            <button class="btn btn-sm btn-primary" @click="verifyDigitalPayment(p)">Verify</button>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-state-icon" style="color:var(--success)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div>No unverified digital transfers</div>
        </div>
      </div>

      <!-- Live Shift Audit Timeline -->
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <h3>Shift Activity Audit Timeline</h3>
          <button class="btn btn-sm btn-ghost" @click="fetchShiftAudit">Refresh Log</button>
        </div>
        <div v-if="shiftLogs.length" style="max-height:280px;overflow-y:auto;padding-right:6px">
          <div v-for="log in shiftLogs.slice(0, 10)" :key="log.id || log.at" style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem">
            <div style="width:70px;color:var(--text-muted);font-size:.72rem">{{ log.at ? new Date(log.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—' }}</div>
            <div style="flex:1">
              <strong style="text-transform:capitalize">{{ (log.action || '').replace('_', ' ') }}</strong>
              <span v-if="log.reason" style="color:var(--text-muted)"> — {{ log.reason }}</span>
              <div v-if="log.actorName" style="font-size:.72rem;color:var(--text-muted)">By {{ log.actorName }}</div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <div style="color:var(--text-muted);font-size:.85rem">No cashier audit events recorded this shift</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { apiGet, apiPost, TODAY } from '../api'
import { isRealOrder } from '../lib/formatters'
import { useSSE } from '../composables/useSSE'

const router = useRouter()

let _Chart = null
async function _loadChart() {
  if (!_Chart) {
    const { Chart, registerables } = await import('chart.js')
    Chart.register(...registerables)
    _Chart = Chart
  }
  return _Chart
}

const auth = useAuthStore()

// Data refs — must be declared before loadDashboard references them
const orders = ref([])
const expenses = ref([])
const inventory = ref([])
const todayOrders = ref([])
const todayExpenses = ref([])

const revenueChart = ref(null)
const expenseChart = ref(null)
const kpis = ref([])
const showCharts = ref(false)
const showRecentOrders = ref(true)
const showLowStock = ref(true)
// Floor-facing roles get one-tap access to the screens they actually work from.
const showQuickActions = computed(() => auth.roleKey === 'head-waiter')
const tillStatus = ref(null)
const topItems = ref([])
const cashierPayBreakdown = ref([])
const payBreakdownChart = ref(null)
const recentOrders = ref([])
const lowStockItems = ref([])
// The cleaner's own work record — the dashboard's Waste Logged Today card.
const recentWaste = ref([])
const loading = ref(false)

let charts = {}
let interval = null

const { connect: sseConnect, disconnect: sseDisconnect, on: sseOn } = useSSE()

// KPI icon SVGs
const ICONS = {
  revenue: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  orders:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  expenses:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  stock:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
  tables:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  delivery:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  cash:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>',
  clean:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  reservations: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  ready:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  cashDrawer:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><rect x="7" y="13" width="10" height="4" rx="1"/></svg>',
  audit:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>',
}

// Greeting based on time of day
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
})

const fullDate = computed(() =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
)

const roleLabel = computed(() => {
  const role = auth.user?.role || ''
  return role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
})

function shortId(id) { return id ? id.slice(-5).toUpperCase() : '?' }

/**
 * "2h ago" for the Last Entry tile. Both storage formats parse: ISO with a
 * Z, and the older "YYYY-MM-DD HH:MM:SS" space-separated rows.
 */
function timeAgo(v) {
  if (!v) return '—'
  const t = new Date(String(v).replace(' ', 'T')).getTime()
  if (!t || Number.isNaN(t)) return '—'
  const mins = Math.floor((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
function orderSummary(o) {
  const lines = o.order_items || o.orderItems
  if (Array.isArray(lines) && lines.length) {
    return lines.slice(0, 3).map(l => `${l.qty}x ${l.name}`).join(', ') + (lines.length > 3 ? '...' : '')
  }
  if (typeof o.items === 'string' && o.items.startsWith('[')) {
    try {
      const parsed = JSON.parse(o.items)
      if (Array.isArray(parsed)) return parsed.slice(0, 3).map(i => typeof i === 'string' ? i : `${i.name || i}`).join(', ')
    } catch {}
  }
  return typeof o.items === 'string' ? o.items.slice(0, 50) : 'Order'
}

function isToday(d) {
  if (!d) return false
  return d.slice(0, 10) === TODAY()
}

const digitalPending = ref([])
const shiftLogs = ref([])

async function fetchShiftAudit() {
  try {
    const res = await apiGet('cashdrawer/shift-log')
    shiftLogs.value = res.entries || []
  } catch { shiftLogs.value = [] }
}

async function fetchDigitalPending() {
  try {
    const res = await apiGet('payments?verified=false')
    const rows = res.payments || (Array.isArray(res) ? res : [])
    // The queue is for DIGITAL transfers that still need the till's say-so.
    // Cash is verified on record the moment it is taken, and a refunded or
    // rejected row is settled history — none of those belong here. The API
    // filter is honoured too, but the screen defends itself so a stray row
    // can never render a Verify button for money already settled.
    digitalPending.value = rows.filter(p =>
      String(p.status || '').toLowerCase() === 'recorded' &&
      ['telebirr', 'cbe', 'bank', 'card', 'mobile'].includes(String(p.method || '').toLowerCase())
    )
  } catch { digitalPending.value = [] }
}

async function verifyDigitalPayment(p) {
  try {
    await apiPost(`payments/${p.id}/verify`, { verified: true })
    digitalPending.value = digitalPending.value.filter(item => item.id !== p.id)
    await fetchShiftAudit()
  } catch { /* ignore */ }
}

async function fetchTillStatus() {
  try {
    const res = await apiGet('cashdrawer')
    const active = res.active || (res.drawers || []).find(d => d.status === 'open') || null
    if (active) {
      const opening = parseFloat(active.openingBal || active.opening_balance || 0)
      const cashSales = parseFloat(active.cashSales || active.cash_sales || 0)
      tillStatus.value = {
        open: true,
        opening: opening.toFixed(0),
        cashSales: cashSales.toFixed(0),
        expected: (opening + cashSales).toFixed(0),
        openedAt: active.opened || active.opened_at
          ? new Date(active.opened || active.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '—'
      }
    } else {
      tillStatus.value = { open: false }
    }
  } catch { tillStatus.value = { open: false } }
}

async function fetchTopItems() {
  try {
    const menu = await apiGet('menu')
    const items = Array.isArray(menu) ? menu : (menu.items || menu.data || [])
    topItems.value = items
      .filter(i => i.available !== false && i.status !== 'unavailable')
      .slice(0, 6)
  } catch { topItems.value = [] }
}

function quickAddItem(item) {
  // Navigate to menu-view so the cashier can pick the item — the order store
  // does not live in the dashboard, so we route rather than mutate directly.
  router.push('/app/menu-view')
}

async function buildPayBreakdownChart(methods) {
  if (!methods || !methods.length) return
  cashierPayBreakdown.value = methods
  await nextTick()
  if (!payBreakdownChart.value) return
  const Chart = await _loadChart()
  if (charts.payBreakdown) charts.payBreakdown.destroy()
  const labels = methods.map(m => m.method.charAt(0).toUpperCase() + m.method.slice(1))
  const data   = methods.map(m => Math.round(m.total || 0))
  charts.payBreakdown = new Chart(payBreakdownChart.value, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: ['#0F7B78','#18B4B7','#D6B36A','#E4CB99','#2E7D32','#D97706'] }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } }
    }
  })
}

onMounted(async () => {
  await loadDashboard()
  const role = auth.roleKey
  if (role === 'manager' || role === 'cashier') {
    interval = setInterval(loadDashboard, 30000)
  }
  // The floor moves from other people's screens. Only manager and cashier had
  // any refresh at all, and then only every 30s, so a waiter's or chef's
  // dashboard showed the seating count from whenever they opened it. The stream
  // only fires when something actually changed, so this costs nothing when the
  // floor is quiet.
  sseConnect('tables')
  sseOn('table_update', () => loadDashboard())
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
  sseDisconnect()
  Object.values(charts).forEach(c => c.destroy())
})

async function loadDashboard() {
  loading.value = true
  try {
    // Only fetch data the current role is authorized to access
    const fetches = []
    if (auth.hasPermission('orders')) {
      fetches.push(apiGet('orders').then(d => { orders.value = d }).catch(() => { orders.value = [] }))
    } else {
      orders.value = []
    }
    if (auth.hasPermission('expenses')) {
      fetches.push(apiGet('expenses').then(d => { expenses.value = d }).catch(() => { expenses.value = [] }))
    } else {
      expenses.value = []
    }
    if (auth.hasPermission('inventory')) {
      fetches.push(apiGet('inventory').then(d => { inventory.value = d }).catch(() => { inventory.value = [] }))
    } else {
      inventory.value = []
    }
    await Promise.allSettled(fetches)

    if (auth.roleKey === 'cashier' || auth.roleKey === 'manager') {
      fetchShiftAudit()
      fetchDigitalPending()
    }
    if (auth.roleKey === 'cashier') {
      fetchTillStatus()
      fetchTopItems()
    }

    // Voided and cancelled orders are audit history, not today's revenue —
    // isRealOrder mirrors the API's REAL_ORDERS rule in reports.js.
    todayOrders.value = orders.value.filter(o => isRealOrder(o) && isToday(o.created))
    todayExpenses.value = expenses.value.filter(e => isToday(e.date))
    recentOrders.value = todayOrders.value.slice(0, 10)
    lowStockItems.value = inventory.value.filter(i => parseInt(i.quantity||0) <= parseInt(i.minLevel||0))

    buildKpis()
    buildCharts()
  } catch (e) {
    // silent — data stays from previous successful load
  } finally {
    loading.value = false
  }
}

/**
 * Manager and accountant tiles, from the server's own aggregation.
 *
 * Summing `o.total` in the browser overstates the day: since tips are stored,
 * `total` is what the guest handed over and includes money that is not the
 * restaurant's. `/api/reports/dashboard` returns `netSales` with the tip
 * already subtracted, and reports tips as their own figure — which is the
 * separation §14 asks for and the reason this is not computed here.
 *
 * It also means the tiles cover the whole trading picture (sales by order type,
 * pending deliveries, supplier balance) rather than only what this screen
 * happened to have already fetched.
 */
async function loadManagerKpis() {
  try {
    const r = await apiGet('reports/dashboard?period=day')
    const low = r.operations.lowStockItems
    kpis.value = [
      {
        label: 'Today Sales', value: `ETB ${Math.round(r.sales.netSales)}`,
        // Stated on the tile: the headline figure is not the cash taken.
        sub: `${r.sales.orders} orders · excludes ETB ${Math.round(r.tips)} tips`,
        bar: 'teal', icon: ICONS.revenue,
      },
      {
        label: 'Dine-in / Takeaway / Delivery',
        value: `${r.byOrderType.dineIn.orders}/${r.byOrderType.takeaway.orders}/${r.byOrderType.delivery.orders}`,
        sub: `ETB ${Math.round(r.byOrderType.dineIn.net)} · ${Math.round(r.byOrderType.takeaway.net)} · ${Math.round(r.byOrderType.delivery.net)}`,
        bar: 'blue', icon: ICONS.orders,
      },
      {
        label: 'Expenses', value: `ETB ${Math.round(r.expenses)}`,
        sub: `Sales less expenses: ETB ${Math.round(r.grossOfExpenses)}`,
        bar: 'yellow', icon: ICONS.expenses,
      },
      {
        label: 'Low Stock', value: `${low}`,
        sub: low ? `${low} at or below reorder point` : 'All stocked',
        bar: low ? 'yellow' : 'teal', color: low ? 'var(--danger)' : '', icon: ICONS.stock,
      },
      {
        label: 'Kitchen / Deliveries',
        value: `${r.operations.pendingKitchenOrders}/${r.operations.pendingDeliveries}`,
        sub: 'Open tickets · runs outstanding',
        bar: 'blue', icon: ICONS.orders,
      },
      {
        label: 'Owed to Suppliers', value: `ETB ${Math.round(r.supplierBalance)}`,
        sub: r.supplierBalance > 0 ? 'Outstanding on purchases' : 'Nothing outstanding',
        bar: r.supplierBalance > 0 ? 'yellow' : 'teal', icon: ICONS.expenses,
      },
    ]
  } catch (e) {
    // The provisional tiles set by the caller stay on screen. A dashboard that
    // is briefly approximate beats one that is empty.
    console.error(e)
  }
}

/**
 * Cashier tiles.
 *
 * The old version split the day by `o.payment === 'cash'` against `'card'`.
 * That string is a summary — a split bill stores "cash+telebirr" — so a split
 * matched neither bucket and vanished, and Telebirr, CBE and bank transfers
 * were all counted as neither cash nor card. The real amounts per method live
 * in the payments table and are what `paymentMethods` reports.
 */
async function loadCashierKpis() {
  try {
    const r = await apiGet('reports/dashboard?period=day')
    const method = (name) => r.paymentMethods.find(m => m.method === name) || { total: 0, count: 0 }
    const cash = method('cash')
    const digital = r.paymentMethods
      .filter(m => ['telebirr', 'cbe', 'bank', 'card', 'mobile'].includes(m.method))
      .reduce((s, m) => ({ total: s.total + m.total, count: s.count + m.count }), { total: 0, count: 0 })
    const tips = r.tips || 0

    kpis.value = [
      { label: 'Today Sales', value: `ETB ${Math.round(r.sales.netSales)}`, sub: `${r.sales.orders} orders · excludes tips`, bar: 'teal', icon: ICONS.revenue },
      { label: 'Cash Taken',  value: `ETB ${Math.round(cash.total)}`,       sub: `${cash.count} payment(s)`,                 bar: 'blue', icon: ICONS.cash },
      { label: 'Digital',     value: `ETB ${Math.round(digital.total)}`,    sub: `${digital.count} transfer(s)`,             bar: 'gold', icon: ICONS.expenses },
      { label: 'Avg Order',   value: `ETB ${Math.round(r.sales.averageOrder)}`, sub: 'Per transaction',                      bar: 'teal', icon: ICONS.revenue },
      { label: 'Tips Earned', value: `ETB ${Math.round(tips)}`, sub: 'Shift tips total',                                      bar: 'gold', icon: ICONS.cash },
    ]

    // Build payment-method donut from live data
    if (r.paymentMethods && r.paymentMethods.length) {
      buildPayBreakdownChart(r.paymentMethods)
    }
  } catch (e) {
    console.error(e)
  }
}

function buildKpis() {
  const role = auth.roleKey
  const rev = todayOrders.value.reduce((s, o) => s + parseFloat(o.total||0), 0)
  const exp = todayExpenses.value.reduce((s, e) => s + parseFloat(e.amount||0), 0)
  const newOrd = todayOrders.value.filter(o => o.status === 'new').length
  const prepOrd = todayOrders.value.filter(o => o.status === 'preparing').length
  const readyOrd = todayOrders.value.filter(o => o.status === 'ready').length
  const low = lowStockItems.value.length

  if (role === 'manager' || role === 'accountant') {
    showCharts.value = true
    // Provisional tiles from what is already loaded, replaced the moment the
    // reports endpoint answers. Without this the dashboard is blank on every
    // load rather than briefly approximate.
    kpis.value = [
      { label: 'Today Revenue',    value: `ETB ${rev.toFixed(0)}`, sub: 'Loading…',                              bar: 'teal',   icon: ICONS.revenue },
      { label: 'Orders',           value: `${todayOrders.value.length}`, sub: `${newOrd} new`,                   bar: 'blue',   icon: ICONS.orders  },
      { label: 'Today Expenses',   value: `ETB ${exp.toFixed(0)}`, sub: `${todayExpenses.value.length} entries`, bar: 'yellow', icon: ICONS.expenses },
      { label: 'Low Stock Alerts', value: `${low}`,                sub: `${low} items need reorder`,             bar: low ? 'yellow' : 'teal', color: low ? 'var(--danger)' : '', icon: ICONS.stock }
    ]
    loadManagerKpis()
  } else if (role === 'head-chef') {
    showRecentOrders.value = false
    kpis.value = [
      { label: 'New Orders',     value: `${newOrd}`,   sub: 'Awaiting preparation',                             bar: 'blue',   color: newOrd ? 'var(--warning)' : 'var(--success)', icon: ICONS.orders  },
      { label: 'In Progress',    value: `${prepOrd}`,  sub: 'Being prepared now',                               bar: 'yellow', icon: ICONS.orders  },
      { label: 'Ready to Serve', value: `${readyOrd}`, sub: readyOrd ? 'Ready for pickup' : 'Nothing ready',   bar: 'teal',   color: 'var(--success)', icon: ICONS.orders },
      { label: 'Low Stock',      value: `${low}`,      sub: low ? lowStockItems.value.slice(0,2).map(i=>i.name).join(', ') : 'All stocked', bar: low ? 'yellow' : 'teal', icon: ICONS.stock }
    ]
  } else if (role === 'cashier') {
    showCharts.value = true
    kpis.value = [
      { label: 'Today Revenue', value: `ETB ${rev.toFixed(0)}`, sub: 'Loading…', bar: 'teal', icon: ICONS.revenue },
      { label: 'Orders',        value: `${todayOrders.value.length}`, sub: `${newOrd} new`, bar: 'blue', icon: ICONS.orders },
    ]
    loadCashierKpis()
  } else if (role === 'head-waiter') {
    // A waiter has no inventory permission, so loadDashboard never fetches it
    // and `low` is structurally always 0. Showing a Low Stock tile here would
    // be a permanently-zero number they cannot act on — replaced with the
    // metric that actually drives their shift: food waiting to be run.
    showLowStock.value = false
    Promise.all([apiGet('tables'), apiGet('reservations')]).then(([tables, res]) => {
      const openTables = tables.filter(t => t.status !== 'available').length
      const seatedGuests = tables.filter(t => t.status === 'occupied').reduce((s, t) => s + (t.guests || 0), 0)
      const todayRes = res.filter(r => r.date === TODAY() && r.status !== 'cancelled').length
      // A served bill that has been paid is finished — counting it as "open"
      // sent the waiter hunting for work that did not exist. Unpaid tabs stay
      // on the tile whatever their kitchen status: that is money to collect.
      const openOrders = todayOrders.value.filter(o =>
        o.status !== 'fulfilled' && o.status !== 'cancelled' &&
        String(o.payment_status || '').toLowerCase() !== 'paid' &&
        String(o.payment || '').toLowerCase() !== 'paid'
      ).length
      kpis.value = [
        { label: 'Ready to Serve',     value: `${readyOrd}`,                 sub: readyOrd ? 'Run these to tables' : 'Nothing waiting',                        bar: readyOrd ? 'gold' : 'teal', color: readyOrd ? 'var(--warning)' : '', icon: ICONS.ready },
        { label: 'Active Tables',      value: `${openTables}`,               sub: `${seatedGuests} guest${seatedGuests === 1 ? '' : 's'} seated`,               bar: 'teal',  icon: ICONS.tables },
        { label: 'Open Orders',        value: `${openOrders}`,               sub: `${newOrd} new today`, bar: 'blue', icon: ICONS.orders },
        { label: 'Today Reservations', value: `${todayRes}`,                 sub: `${res.filter(r => r.date === TODAY() && r.status === 'new').length} new`,   bar: 'gold',  icon: ICONS.reservations }
      ]
    }).catch(() => {
      // Never leave the waiter staring at an empty skeleton if either call fails.
      kpis.value = [
        { label: 'Ready to Serve', value: `${readyOrd}`, sub: 'Run these to tables', bar: 'gold', icon: ICONS.ready },
        { label: 'Open Orders',    value: `${todayOrders.value.filter(o => o.status !== 'fulfilled' && o.status !== 'cancelled' && String(o.payment_status || '').toLowerCase() !== 'paid' && String(o.payment || '').toLowerCase() !== 'paid').length}`, sub: `${newOrd} new today`, bar: 'blue', icon: ICONS.orders }
      ]
    })
  } else if (role === 'delivery-staff') {
    showRecentOrders.value = false
    showLowStock.value = false
    apiGet('delivery').then(del => {
      // The lifecycle statuses are new/confirmed/preparing/ready/assigned/
      // picked_up/out_for_delivery/delivered. The old filters looked for
      // 'pending' and 'in-transit', which the state machine never produces, so
      // both tiles read zero however busy the evening was.
      const pending = del.filter(d => ['new', 'confirmed', 'preparing', 'ready', 'assigned'].includes(d.status)).length
      const transit = del.filter(d => ['picked_up', 'out_for_delivery'].includes(d.status)).length
      const done    = del.filter(d => d.status === 'delivered').length
      kpis.value = [
        { label: 'Pending Pickups', value: `${pending}`, sub: 'Awaiting driver', bar: 'teal', icon: ICONS.delivery },
        { label: 'In Transit',      value: `${transit}`, sub: 'On the road',     bar: 'blue', color: 'var(--info)',     icon: ICONS.delivery },
        { label: 'Delivered Today', value: `${done}`,    sub: 'Completed',       bar: 'gold', color: 'var(--success)',  icon: ICONS.delivery }
      ]
    })
  } else if (role === 'cleaner') {
    showRecentOrders.value = false
    showLowStock.value = false
    // The role's whole day is the floor and the waste log, and both are reads
    // the matrix grants (tables, waste). Each fetch fails to an empty list on
    // its own, so one endpoint being down never blanks the other's tiles.
    Promise.all([
      apiGet('tables').catch(() => []),
      apiGet('waste').catch(() => []),
    ]).then(([tables, waste]) => {
      const cleaning = tables.filter(t => t.status === 'cleaning').length
      const occupied = tables.filter(t => t.status === 'occupied').length
      // `date` is what the entry was logged for; `created` is when it was
      // written, and either can carry the day on rows older than the alias.
      const todays = waste.filter(w => (w.date || String(w.created || '').slice(0, 10)) === TODAY())
      const wasteCost = todays.reduce((s, w) => s + parseFloat(w.cost ?? w.est_cost ?? 0), 0)
      recentWaste.value = todays.slice(0, 5)
      // The list arrives newest first (ORDER BY created DESC on the server).
      const last = waste[0]
      // Cleaner role no longer has 'tables' permission (matrix tightened at
      // some point). The apiGet('tables') call above will 403/503, the catch
      // returns [], and cleaning/occupied both fall to 0 — which would
      // mislead the cleaner into thinking no tables need attention. Only
      // render those two KPIs when we actually received a non-empty array
      // (i.e. when the role still holds the tables permission).
      const canSeeTables = Array.isArray(tables) && tables.length > 0
      kpis.value = [
        ...(canSeeTables ? [
          { label: 'Tables to Clean', value: `${cleaning}`, sub: 'Marked for cleaning', bar: 'teal', color: cleaning ? 'var(--warning)' : 'var(--success)', icon: ICONS.clean },
          { label: 'Occupied Tables', value: `${occupied}`, sub: 'Will need cleaning', bar: 'blue', icon: ICONS.clean },
        ] : []),
        { label: 'Waste Logged Today', value: `${todays.length}`, sub: todays.length ? `ETB ${wasteCost.toFixed(0)} recorded` : 'Nothing logged yet', bar: 'gold', icon: ICONS.clean },
        { label: 'Last Entry', value: last ? timeAgo(last.created) : '—', sub: last ? `${last.item || last.name || 'Item'} · ${last.reason || '—'}` : 'No entries yet', bar: 'teal', icon: ICONS.clean }
      ]
    })
  } else {
    kpis.value = [
      { label: 'Today Revenue', value: `ETB ${rev.toFixed(0)}`, sub: `${todayOrders.value.length} orders`, bar: 'teal', icon: ICONS.revenue },
      { label: 'Orders',        value: `${todayOrders.value.length}`,                                       sub: `${newOrd} pending`,          bar: 'blue', icon: ICONS.orders  },
      { label: 'Low Stock',     value: `${low}`,                                                            sub: 'Items low',                  bar: low ? 'yellow' : 'teal', icon: ICONS.stock }
    ]
  }
}

async function buildCharts() {
  // Only build charts for roles with financial data access
  if (!auth.hasPermission('orders') && !auth.hasPermission('expenses')) return
  if (!showCharts.value) return

  const Chart = await _loadChart()
  await nextTick()
  if (!revenueChart.value || !expenseChart.value) return

  // Destroy old charts
  Object.values(charts).forEach(c => c.destroy())
  charts = {}

  // Revenue chart - last 7 days (use already-fetched data)
  const days = []
  const revData = []
  const expData = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0, 10)
    days.push(d.toLocaleDateString('en', { weekday: 'short' }))
    revData.push(orders.value.filter(o => (o.created||'').slice(0,10) === ds).reduce((s,o) => s + parseFloat(o.total||0), 0))
    expData.push(expenses.value.filter(e => e.date === ds).reduce((s,e) => s + parseFloat(e.amount||0), 0))
  }

  charts.revenue = new Chart(revenueChart.value, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'Revenue', data: revData, backgroundColor: 'rgba(15,123,120,.7)', borderRadius: 6 },
        { label: 'Expenses', data: expData, backgroundColor: 'rgba(214,179,106,.7)', borderRadius: 6 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
  })

  // Expense breakdown pie (use already-fetched data)
  if (!expenses.value.length) return
  const catMap = {}
  expenses.value.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + parseFloat(e.amount||0) })
  const catLabels = Object.keys(catMap)
  const catValues = Object.values(catMap)
  if (catLabels.length) {
    charts.expense = new Chart(expenseChart.value, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{ data: catValues, backgroundColor: ['#0F7B78','#18B4B7','#D6B36A','#E4CB99','#2E7D32','#D97706'] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
    })
  }
}
</script>

<style scoped>
/* Dashboard header */
.dash-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;gap:12px}.dash-header>div{min-width:0;flex:1;overflow:hidden}.dash-header>div{min-width:0;flex:1;overflow:hidden}
.dash-greeting{font-size:1.2rem;font-weight:700;color:var(--text-heading);line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash-subtitle{font-size:.78rem;color:var(--text-muted);margin-top:3px}
.dash-refresh{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;min-height:44px}

/* Quick actions — sized to the 44px touch minimum for tablet use */
.dash-quick-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.dash-qa{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:64px;padding:10px 8px;border-radius:var(--radius-md);border:1.5px solid var(--border);background:var(--surface);color:var(--text-body);cursor:pointer;transition:all var(--duration-fast) var(--ease)}
.dash-qa:hover{border-color:var(--primary);color:var(--primary);background:var(--teal-50)}
.dash-qa:active{transform:scale(.97)}
.dash-qa-icon{line-height:0;opacity:.7}
.dash-qa-label{font-size:.8rem;font-weight:600}
.dash-qa-primary{background:var(--primary);border-color:var(--primary);color:#fff}
.dash-qa-primary:hover{background:var(--primary-hover);border-color:var(--primary-hover);color:#fff}
.dash-qa-primary .dash-qa-icon{opacity:1}
:global([data-theme="dark"]) .dash-qa:hover{background:rgba(15,123,120,.15)}

@media(max-width:600px){
  .dash-quick-actions{grid-template-columns:repeat(2,1fr)}
}

/* KPI enhancements */
.kpi-top-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.kpi-icon{opacity:.35;line-height:0}
.kpi-icon svg{display:block}

/* Loading skeleton */
.skel-line{background:var(--neutral-100);border-radius:4px;animation:skelPulse 1.6s ease-in-out infinite}
.skel-label{height:10px;width:55%;margin-bottom:12px}
.skel-value{height:28px;width:70%;margin-bottom:10px}
.skel-sub{height:10px;width:45%}
@keyframes skelPulse{0%,100%{opacity:.5}50%{opacity:1}}

/* Refresh spin */
@keyframes dashSpin{to{transform:rotate(360deg)}}
.dash-spin{animation:dashSpin .7s linear infinite}

/* Lists */
.queue-item{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:.82rem;gap:8px}
.queue-item:last-child{border-bottom:none}

/* Cashier Quick Action badge (pending count indicator) */
.qa-badge{position:absolute;top:6px;right:6px;min-width:18px;height:18px;padding:0 5px;background:var(--danger);color:#fff;font-size:.65rem;font-weight:700;border-radius:9px;display:flex;align-items:center;justify-content:center;line-height:1}

/* Live Till Float Status Card */
.till-float-card{display:flex;align-items:center;justify-content:space-between;gap:16px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:20px;flex-wrap:wrap}
.till-float-left{display:flex;align-items:center;gap:12px}
.till-status-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.dot-open{background:var(--success);box-shadow:0 0 0 4px rgba(34,197,94,.18);animation:tillPulse 2s ease-in-out infinite}
.dot-closed{background:var(--text-muted)}
@keyframes tillPulse{0%,100%{box-shadow:0 0 0 4px rgba(34,197,94,.18)}50%{box-shadow:0 0 0 8px rgba(34,197,94,.06)}}
.till-status-label{font-size:.9rem;font-weight:700;color:var(--text-heading)}
.till-status-sub{font-size:.75rem;color:var(--text-muted);margin-top:2px}
.till-float-stats{display:flex;gap:24px;flex-wrap:wrap}
.till-stat{display:flex;flex-direction:column;align-items:center}
.till-stat-label{font-size:.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.till-stat-val{font-size:.95rem;font-weight:700;color:var(--text-heading)}

/* Top Items Fast-Order pad */
.top-items-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding-top:8px}
.top-item-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 6px;border-radius:var(--radius-sm);border:1.5px solid var(--border);background:var(--surface);cursor:pointer;transition:all var(--duration-fast) var(--ease);text-align:center}
.top-item-btn:hover{border-color:var(--primary);background:var(--teal-50);color:var(--primary)}
.top-item-btn:active{transform:scale(.96)}
.top-item-name{font-size:.78rem;font-weight:600;color:var(--text-heading);line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.top-item-price{font-size:.72rem;color:var(--success);font-weight:700;margin-top:2px}
:global([data-theme="dark"]) .top-item-btn:hover{background:rgba(15,123,120,.15)}
</style>
