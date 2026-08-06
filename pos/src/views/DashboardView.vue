<template>
  <div>
    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
        <div class="kpi-bar" :class="kpi.bar"></div>
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-value" :style="kpi.color ? {color: kpi.color} : {}">{{ kpi.value }}</div>
        <div class="kpi-sub" v-if="kpi.sub" v-html="kpi.sub"></div>
      </div>
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
        <div class="card-header"><h3>Recent Orders</h3></div>
        <div v-if="recentOrders.length">
          <div v-for="o in recentOrders.slice(0,5)" :key="o.id" class="queue-item">
            <span>#{{ shortId(o.id) }} — <strong>{{ orderSummary(o) }}</strong></span>
            <span><span class="badge" :class="'badge-'+o.status">{{ o.status }}</span> ETB {{ parseFloat(o.total||0).toFixed(0) }}</span>
          </div>
        </div>
        <div v-else class="empty-state"><div class="empty-state-icon">📋</div><div>No orders today</div></div>
      </div>
      <div class="card" v-if="showLowStock">
        <div class="card-header"><h3>Low Stock Alerts</h3></div>
        <div v-if="lowStockItems.length">
          <div v-for="i in lowStockItems.slice(0,5)" :key="i.id" class="queue-item">
            <span>{{ i.name }} <span class="badge badge-low">{{ i.quantity }}/{{ i.minLevel }} {{ i.unit }}</span></span>
            <span class="badge badge-low">Reorder</span>
          </div>
        </div>
        <div v-else class="empty-state"><div class="empty-state-icon">✅</div><div>All items stocked</div></div>
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

const revenueChart = ref(null)
const expenseChart = ref(null)
const kpis = ref([])
const showCharts = ref(false)
const showRecentOrders = ref(true)
const showLowStock = ref(true)
const recentOrders = ref([])
const lowStockItems = ref([])

let charts = {}
let interval = null

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
    console.error('Dashboard:', e)
  }
}

const todayOrders = ref([])
const todayExpenses = ref([])

function buildKpis() {
  const role = auth.roleKey
  const rev = todayOrders.value.reduce((s, o) => s + parseFloat(o.total||0), 0)
  const exp = todayExpenses.value.reduce((s, e) => s + parseFloat(e.amount||0), 0)
  const newOrd = todayOrders.value.filter(o => o.status === 'new').length
  const prepOrd = todayOrders.value.filter(o => o.status === 'preparing').length
  const readyOrd = todayOrders.value.filter(o => o.status === 'ready').length
  const low = lowStockItems.value.length
  const idx = kpis.value.length // key hack

  if (role === 'manager') {
    showCharts.value = true
    kpis.value = [
      { label: 'Today Revenue', value: `ETB ${rev.toFixed(0)}`, sub: `${todayOrders.value.length} orders today`, bar: 'teal' },
      { label: 'New Orders', value: `${newOrd}`, sub: `${todayOrders.value.filter(o=>o.status==='new').length} pending`, bar: 'blue' },
      { label: 'Today Expenses', value: `ETB ${exp.toFixed(0)}`, sub: `${todayExpenses.value.length} entries`, bar: 'yellow' },
      { label: 'Low Stock Alerts', value: `${low}`, sub: `${low} items need reorder`, bar: low ? 'yellow' : 'teal', color: low ? 'var(--danger)' : '' }
    ]
  } else if (role === 'head-chef') {
    showRecentOrders.value = false
    kpis.value = [
      { label: 'New Orders', value: `${newOrd}`, sub: 'Awaiting preparation', bar: 'blue', color: newOrd ? 'var(--warning)' : 'var(--success)' },
      { label: 'In Progress', value: `${prepOrd}`, sub: 'Being prepared now', bar: 'yellow' },
      { label: 'Ready to Serve', value: `${readyOrd}`, sub: readyOrd ? 'Ready for pickup' : 'Nothing ready', bar: 'teal', color: 'var(--success)' },
      { label: 'Low Stock', value: `${low}`, sub: low ? lowStockItems.value.slice(0,2).map(i=>i.name).join(', ') : 'All stocked', bar: low ? 'yellow' : 'teal' }
    ]
  } else if (role === 'cashier') {
    showCharts.value = true
    const cashOrd = todayOrders.value.filter(o => o.payment === 'cash')
    const cardOrd = todayOrders.value.filter(o => o.payment === 'card')
    kpis.value = [
      { label: 'Today Revenue', value: `ETB ${rev.toFixed(0)}`, sub: `${todayOrders.value.length} orders`, bar: 'teal' },
      { label: 'Cash Orders', value: `${cashOrd.length}`, sub: `ETB ${cashOrd.reduce((s,o)=>s+parseFloat(o.total||0),0).toFixed(0)}`, bar: 'blue' },
      { label: 'Card/Mobile', value: `${cardOrd.length}`, sub: `ETB ${cardOrd.reduce((s,o)=>s+parseFloat(o.total||0),0).toFixed(0)}`, bar: 'gold' },
      { label: 'Avg Order', value: `ETB ${todayOrders.value.length ? (rev/todayOrders.value.length).toFixed(0) : 0}`, sub: 'Per transaction', bar: 'teal' }
    ]
  } else if (role === 'head-waiter') {
    Promise.all([apiGet('tables'), apiGet('reservations')]).then(([tables, res]) => {
      const openTables = tables.filter(t => t.status !== 'available').length
      const todayRes = res.filter(r => r.date === TODAY() && r.status !== 'cancelled').length
      kpis.value = [
        { label: 'Active Tables', value: `${openTables}`, sub: `${todayOrders.value.filter(o=>o.status!=='fulfilled'&&o.status!=='cancelled').length} active orders`, bar: 'teal' },
        { label: 'Today Reservations', value: `${todayRes}`, sub: `${res.filter(r=>r.date===TODAY()&&r.status==='new').length} new`, bar: 'blue' },
        { label: 'Low Stock', value: `${low}`, sub: 'Items to reorder', bar: low ? 'yellow' : 'teal' },
        { label: 'Orders Today', value: `${todayOrders.value.length}`, sub: `${newOrd} new`, bar: 'gold' }
      ]
    })
  } else if (role === 'delivery-staff') {
    showRecentOrders.value = false
    showLowStock.value = false
    apiGet('delivery').then(del => {
      const pending = del.filter(d => d.status === 'pending').length
      const transit = del.filter(d => d.status === 'in-transit').length
      const done = del.filter(d => d.status === 'delivered').length
      kpis.value = [
        { label: 'Pending Pickups', value: `${pending}`, sub: 'Awaiting driver', bar: 'teal' },
        { label: 'In Transit', value: `${transit}`, sub: 'On the road', bar: 'blue', color: 'var(--info)' },
        { label: 'Delivered Today', value: `${done}`, sub: 'Completed', bar: 'gold', color: 'var(--success)' }
      ]
    })
  } else if (role === 'cleaner') {
    showRecentOrders.value = false
    showLowStock.value = false
    apiGet('tables').then(tables => {
      const cleaning = tables.filter(t => t.status === 'cleaning').length
      const occupied = tables.filter(t => t.status === 'occupied').length
      kpis.value = [
        { label: 'Tables to Clean', value: `${cleaning}`, sub: 'Marked for cleaning', bar: 'teal', color: cleaning ? 'var(--warning)' : 'var(--success)' },
        { label: 'Occupied Tables', value: `${occupied}`, sub: 'Will need cleaning', bar: 'blue' }
      ]
    })
  } else {
    kpis.value = [
      { label: 'Today Revenue', value: `ETB ${rev.toFixed(0)}`, sub: `${todayOrders.value.length} orders`, bar: 'teal' },
      { label: 'Orders', value: `${todayOrders.value.length}`, sub: `${newOrd} pending`, bar: 'blue' },
      { label: 'Low Stock', value: `${low}`, sub: 'Items low', bar: low ? 'yellow' : 'teal' }
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
.queue-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem}
.queue-item:last-child{border-bottom:none}
</style>
