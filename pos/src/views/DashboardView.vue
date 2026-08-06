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

    <!-- Charts (Manager & Cashier only) -->
    <div v-if="showCharts" class="chart-grid">
      <div class="chart-card">
        <h3>Revenue (7 days)</h3>
        <canvas ref="revenueChart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Expense Breakdown</h3>
        <canvas ref="expenseChart"></canvas>
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
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useAuthStore } from '../stores/auth'
import { apiGet, TODAY } from '../api'

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
const recentOrders = ref([])
const lowStockItems = ref([])
const loading = ref(false)

let charts = {}
let interval = null

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

onMounted(async () => {
  await loadDashboard()
  const role = auth.roleKey
  if (role === 'manager' || role === 'cashier') {
    interval = setInterval(loadDashboard, 30000)
  }
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
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

    todayOrders.value = orders.value.filter(o => isToday(o.created))
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

function buildKpis() {
  const role = auth.roleKey
  const rev = todayOrders.value.reduce((s, o) => s + parseFloat(o.total||0), 0)
  const exp = todayExpenses.value.reduce((s, e) => s + parseFloat(e.amount||0), 0)
  const newOrd = todayOrders.value.filter(o => o.status === 'new').length
  const prepOrd = todayOrders.value.filter(o => o.status === 'preparing').length
  const readyOrd = todayOrders.value.filter(o => o.status === 'ready').length
  const low = lowStockItems.value.length

  if (role === 'manager') {
    showCharts.value = true
    kpis.value = [
      { label: 'Today Revenue',    value: `ETB ${rev.toFixed(0)}`, sub: `${todayOrders.value.length} orders today`, bar: 'teal',   icon: ICONS.revenue },
      { label: 'New Orders',       value: `${newOrd}`,             sub: `${newOrd} pending`,                        bar: 'blue',   icon: ICONS.orders  },
      { label: 'Today Expenses',   value: `ETB ${exp.toFixed(0)}`, sub: `${todayExpenses.value.length} entries`,    bar: 'yellow', icon: ICONS.expenses },
      { label: 'Low Stock Alerts', value: `${low}`,                sub: `${low} items need reorder`,               bar: low ? 'yellow' : 'teal', color: low ? 'var(--danger)' : '', icon: ICONS.stock }
    ]
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
    const cashOrd = todayOrders.value.filter(o => o.payment === 'cash')
    const cardOrd = todayOrders.value.filter(o => o.payment === 'card')
    kpis.value = [
      { label: 'Today Revenue', value: `ETB ${rev.toFixed(0)}`,                                                                            sub: `${todayOrders.value.length} orders`,                                          bar: 'teal',   icon: ICONS.revenue  },
      { label: 'Cash Orders',   value: `${cashOrd.length}`,                                                                                sub: `ETB ${cashOrd.reduce((s,o)=>s+parseFloat(o.total||0),0).toFixed(0)}`,        bar: 'blue',   icon: ICONS.cash     },
      { label: 'Card / Mobile', value: `${cardOrd.length}`,                                                                                sub: `ETB ${cardOrd.reduce((s,o)=>s+parseFloat(o.total||0),0).toFixed(0)}`,        bar: 'gold',   icon: ICONS.expenses },
      { label: 'Avg Order',     value: `ETB ${todayOrders.value.length ? (rev/todayOrders.value.length).toFixed(0) : 0}`,                 sub: 'Per transaction',                                                            bar: 'teal',   icon: ICONS.revenue  }
    ]
  } else if (role === 'head-waiter') {
    Promise.all([apiGet('tables'), apiGet('reservations')]).then(([tables, res]) => {
      const openTables = tables.filter(t => t.status !== 'available').length
      const todayRes = res.filter(r => r.date === TODAY() && r.status !== 'cancelled').length
      kpis.value = [
        { label: 'Active Tables',      value: `${openTables}`,                   sub: `${todayOrders.value.filter(o=>o.status!=='fulfilled'&&o.status!=='cancelled').length} active orders`, bar: 'teal',  icon: ICONS.tables  },
        { label: 'Today Reservations', value: `${todayRes}`,                     sub: `${res.filter(r=>r.date===TODAY()&&r.status==='new').length} new`,                                   bar: 'blue',  icon: ICONS.tables  },
        { label: 'Low Stock',          value: `${low}`,                          sub: 'Items to reorder',                                                                                   bar: low ? 'yellow' : 'teal', icon: ICONS.stock },
        { label: 'Orders Today',       value: `${todayOrders.value.length}`,     sub: `${newOrd} new`,                                                                                     bar: 'gold',  icon: ICONS.orders  }
      ]
    })
  } else if (role === 'delivery-staff') {
    showRecentOrders.value = false
    showLowStock.value = false
    apiGet('delivery').then(del => {
      const pending = del.filter(d => d.status === 'pending').length
      const transit = del.filter(d => d.status === 'in-transit').length
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
    apiGet('tables').then(tables => {
      const cleaning = tables.filter(t => t.status === 'cleaning').length
      const occupied = tables.filter(t => t.status === 'occupied').length
      kpis.value = [
        { label: 'Tables to Clean', value: `${cleaning}`, sub: 'Marked for cleaning', bar: 'teal', color: cleaning ? 'var(--warning)' : 'var(--success)', icon: ICONS.clean },
        { label: 'Occupied Tables', value: `${occupied}`, sub: 'Will need cleaning',   bar: 'blue', icon: ICONS.clean }
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
.dash-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;gap:12px}
.dash-greeting{font-size:1.2rem;font-weight:700;color:var(--text-heading);line-height:1.2}
.dash-subtitle{font-size:.78rem;color:var(--text-muted);margin-top:3px}
.dash-refresh{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}

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
</style>
