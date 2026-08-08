<template>
  <div>
    <!-- Date Range Selector -->
    <div class="table-toolbar">
      <h3>Analytics</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select v-model="preset" class="select select-sm" style="width:auto;min-width:130px" @change="applyPreset">
          <option value="today">Today</option>
          <option value="7d">Last 7 Days</option>
          <option value="14d">Last 14 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </select>
        <input v-if="preset==='custom'" type="date" v-model="dateFrom" class="input input-sm" style="width:auto" />
        <span v-if="preset==='custom'" style="color:var(--text-muted)">to</span>
        <input v-if="preset==='custom'" type="date" v-model="dateTo" class="input input-sm" style="width:auto" />
        <button v-if="preset==='custom'" class="btn btn-primary btn-sm" @click="loadData">Apply</button>
        <button class="btn btn-outline btn-sm" @click="exportReport">Export JSON</button>
      </div>
    </div>

    <!-- Primary KPIs -->
    <!-- No inline grid-template-columns: it outranks the responsive rules in
         styles.css and pinned this to 4 columns (80px tiles) on a phone.
         .kpi-grid already defaults to 4-up on desktop. -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-bar teal"></div>
        <div class="kpi-label">Total Revenue</div>
        <div class="kpi-value">ETB {{ fmt(totalRevenue) }}</div>
        <div class="kpi-sub" v-if="periodOrders">{{ periodOrders }} orders in period</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar blue"></div>
        <div class="kpi-label">Average Order Value</div>
        <div class="kpi-value">ETB {{ fmt(avgOrderValue) }}</div>
        <div class="kpi-sub" v-html="aovTrend"></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar gold"></div>
        <div class="kpi-label">Gross Margin</div>
        <div class="kpi-value">{{ grossMarginPct }}%</div>
        <div class="kpi-sub">ETB {{ fmt(totalProfit) }} estimated profit</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar" :class="fulfillmentRate >= 90 ? 'teal' : 'yellow'"></div>
        <div class="kpi-label">Fulfillment Rate</div>
        <div class="kpi-value">{{ fulfillmentRate }}%</div>
        <div class="kpi-sub">{{ fulfilledCount }} of {{ periodOrders }} orders completed</div>
      </div>
    </div>

    <!-- Secondary KPIs -->
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card">
        <div class="kpi-bar teal"></div>
        <div class="kpi-label">Peak Hour</div>
        <div class="kpi-value" style="font-size:1.3rem">{{ peakHour || 'N/A' }}</div>
        <div class="kpi-sub">{{ peakHourOrders }} orders at peak</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar blue"></div>
        <div class="kpi-label">Avg Items / Order</div>
        <div class="kpi-value">{{ avgItemsPerOrder }}</div>
        <div class="kpi-sub">across {{ periodOrders }} orders</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar gold"></div>
        <div class="kpi-label">Cancellation Rate</div>
        <div class="kpi-value">{{ cancellationRate }}%</div>
        <div class="kpi-sub">{{ cancelledCount }} cancelled orders</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar" :class="revenueGrowth >= 0 ? 'teal' : 'yellow'"></div>
        <div class="kpi-label">Revenue vs Prior</div>
        <div class="kpi-value" :style="{ color: revenueGrowth >= 0 ? 'var(--success)' : 'var(--danger)' }">
          {{ revenueGrowth >= 0 ? '+' : '' }}{{ revenueGrowth }}%
        </div>
        <div class="kpi-sub" v-html="revenueGrowthLabel"></div>
      </div>
    </div>

    <!-- Charts Row 1 -->
    <div class="chart-grid">
      <div class="chart-card">
        <h3>Revenue Trend</h3>
        <canvas ref="revenueTrendChart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Order Volume</h3>
        <canvas ref="orderVolumeChart"></canvas>
      </div>
    </div>

    <!-- Charts Row 2 -->
    <div class="chart-grid" style="margin-top:16px">
      <div class="chart-card">
        <h3>Sales by Category</h3>
        <canvas ref="categoryChart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Hourly Sales Pattern</h3>
        <canvas ref="hourlyChart"></canvas>
      </div>
    </div>

    <!-- Charts Row 3 -->
    <div class="chart-grid" style="grid-template-columns:1fr;margin-top:16px">
      <div class="chart-card">
        <h3>Order Status Distribution</h3>
        <canvas ref="statusChart"></canvas>
      </div>
    </div>

    <!-- Category Performance Table -->
    <div class="table-wrap" style="margin-top:20px">
      <div class="table-toolbar" style="padding:16px 16px 0">
        <h3>Category Performance</h3>
        <span style="font-size:.75rem;color:var(--text-muted)">{{ dateFrom }} to {{ dateTo }}</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Orders</th>
              <th>Revenue (ETB)</th>
              <th>Avg Order (ETB)</th>
              <th>Share</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cat in categoryPerformance" :key="cat.name">
              <td data-label="Category" style="font-weight:600">{{ cat.name }}</td>
              <td data-label="Orders">{{ cat.orders }}</td>
              <td data-label="Revenue" style="font-weight:600;font-family:var(--font-mono)">{{ fmt(cat.revenue) }}</td>
              <td data-label="Avg Order" style="font-family:var(--font-mono)">{{ fmt(cat.avgOrder) }}</td>
              <td data-label="Share">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="flex:1;max-width:100px;height:6px;background:var(--neutral-100);border-radius:3px;overflow:hidden">
                    <div :style="{ width: cat.share + '%', height: '100%', background: 'var(--primary)', borderRadius: '3px', transition: 'width .3s' }"></div>
                  </div>
                  <span style="font-size:.78rem;font-family:var(--font-mono)">{{ cat.share }}%</span>
                </div>
              </td>
              <td data-label="Trend">
                <span v-if="cat.growth !== null" :class="cat.growth >= 0 ? 'up' : 'down'" style="font-size:.78rem;font-weight:600">
                  {{ cat.growth >= 0 ? '+' : '' }}{{ cat.growth }}%
                </span>
                <span v-else style="color:var(--text-muted);font-size:.78rem">--</span>
              </td>
            </tr>
            <tr v-if="!categoryPerformance.length">
              <td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No data for selected period</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Top Menu Items -->
    <div class="table-wrap" style="margin-top:20px">
      <div class="table-toolbar" style="padding:16px 16px 0">
        <h3>Top Menu Items</h3>
        <span style="font-size:.75rem;color:var(--text-muted)">By quantity sold</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Category</th>
              <th>Qty Sold</th>
              <th>Revenue (ETB)</th>
              <th>% of Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in topItems" :key="item.name">
              <td data-label="#" style="font-weight:700;color:var(--text-muted)">{{ idx + 1 }}</td>
              <td data-label="Item" style="font-weight:600">{{ item.name }}</td>
              <td data-label="Category"><span class="badge badge-new">{{ item.category }}</span></td>
              <td data-label="Qty Sold" style="font-family:var(--font-mono)">{{ item.qty }}</td>
              <td data-label="Revenue" style="font-weight:600;font-family:var(--font-mono)">{{ fmt(item.revenue) }}</td>
              <td data-label="% of Total" style="font-family:var(--font-mono)">{{ item.pctOfTotal }}%</td>
            </tr>
            <tr v-if="!topItems.length">
              <td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No item data for selected period</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Bottom Performers -->
    <div class="table-wrap" style="margin-top:20px">
      <div class="table-toolbar" style="padding:16px 16px 0">
        <h3>Bottom Performers</h3>
        <span style="font-size:.75rem;color:var(--text-muted)">Lowest selling items (min 1 order)</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Category</th>
              <th>Qty Sold</th>
              <th>Revenue (ETB)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in bottomItems" :key="item.name">
              <td data-label="#" style="font-weight:700;color:var(--text-muted)">{{ idx + 1 }}</td>
              <td data-label="Item" style="font-weight:600">{{ item.name }}</td>
              <td data-label="Category"><span class="badge badge-pending">{{ item.category }}</span></td>
              <td data-label="Qty Sold" style="font-family:var(--font-mono)">{{ item.qty }}</td>
              <td data-label="Revenue" style="font-family:var(--font-mono)">{{ fmt(item.revenue) }}</td>
            </tr>
            <tr v-if="!bottomItems.length">
              <td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No data for selected period</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch , inject} from 'vue'
import { apiGet, TODAY } from '../api'
const toast = inject('toast')

// ─── Chart.js lazy loader ───
let _Chart = null
async function loadChartJS() {
  if (!_Chart) {
    const { Chart, registerables } = await import('chart.js')
    Chart.register(...registerables)
    _Chart = Chart
  }
  return _Chart
}

// ─── Refs ───
const revenueTrendChart = ref(null)
const orderVolumeChart = ref(null)
const categoryChart = ref(null)
const hourlyChart = ref(null)
const statusChart = ref(null)

const orders = ref([])
const menuItems = ref([])
const preset = ref('14d')
const dateFrom = ref('')
const dateTo = ref(TODAY())
let charts = {}
let refreshTimer = null

// ─── Preset logic ───
function applyPreset() {
  const to = new Date()
  const from = new Date()
  switch (preset.value) {
    case 'today':
      dateFrom.value = TODAY()
      dateTo.value = TODAY()
      break
    case '7d': from.setDate(from.getDate() - 6); break
    case '14d': from.setDate(from.getDate() - 13); break
    case '30d': from.setDate(from.getDate() - 29); break
    case 'custom': return
  }
  if (preset.value !== 'today' && preset.value !== 'custom') {
    dateFrom.value = from.toISOString().slice(0, 10)
    dateTo.value = to.toISOString().slice(0, 10)
  }
  loadData()
}

// ─── Date range filter ───
const periodOrders = computed(() => {
  return orders.value.filter(o => {
    const d = (o.created || '').slice(0, 10)
    return d >= dateFrom.value && d <= dateTo.value
  })
})

const priorPeriodOrders = computed(() => {
  const days = dayDiff(dateFrom.value, dateTo.value) + 1
  const priorEnd = new Date(dateFrom.value)
  priorEnd.setDate(priorEnd.getDate() - 1)
  const priorStart = new Date(priorEnd)
  priorStart.setDate(priorStart.getDate() - days + 1)
  const ps = priorStart.toISOString().slice(0, 10)
  const pe = priorEnd.toISOString().slice(0, 10)
  return orders.value.filter(o => {
    const d = (o.created || '').slice(0, 10)
    return d >= ps && d <= pe
  })
})

function dayDiff(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / 86400000)
}

// ─── Primary KPIs ───
const totalRevenue = computed(() =>
  periodOrders.value.reduce((s, o) => s + parseFloat(o.total || 0), 0)
)
const avgOrderValue = computed(() =>
  periodOrders.value.length ? totalRevenue.value / periodOrders.value.length : 0
)

const priorTotalRevenue = computed(() =>
  priorPeriodOrders.value.reduce((s, o) => s + parseFloat(o.total || 0), 0)
)
const priorAvgOrderValue = computed(() =>
  priorPeriodOrders.value.length ? priorTotalRevenue.value / priorPeriodOrders.value.length : 0
)

const revenueGrowth = computed(() => {
  if (!priorTotalRevenue.value) return 0
  return Math.round(((totalRevenue.value - priorTotalRevenue.value) / priorTotalRevenue.value) * 100)
})

const revenueGrowthLabel = computed(() => {
  const days = dayDiff(dateFrom.value, dateTo.value) + 1
  return `vs prior ${days}-day period (ETB ${fmt(priorTotalRevenue.value)})`
})

const aovTrend = computed(() => {
  if (!priorAvgOrderValue.value) return '<span style="color:var(--text-muted)">No prior data</span>'
  const diff = avgOrderValue.value - priorAvgOrderValue.value
  const pct = Math.round((diff / priorAvgOrderValue.value) * 100)
  if (diff >= 0) return `<span class="up">+${pct}% vs prior</span>`
  return `<span class="down">${pct}% vs prior</span>`
})

// Gross margin estimation using menu cost data
const totalCost = computed(() => {
  let cost = 0
  const menuMap = {}
  for (const m of menuItems.value) menuMap[m.name] = m
  for (const o of periodOrders.value) {
    const items = parseOrderItems(o)
    for (const item of items) {
      const mi = menuMap[item.name]
      if (mi) cost += (mi.cost || 0) * item.qty
    }
  }
  return cost
})
const totalProfit = computed(() => totalRevenue.value - totalCost.value)
const grossMarginPct = computed(() =>
  totalRevenue.value ? ((totalProfit.value / totalRevenue.value) * 100).toFixed(1) : '0.0'
)

// Fulfillment
const fulfilledCount = computed(() =>
  periodOrders.value.filter(o => o.status === 'fulfilled' || o.status === 'completed').length
)
const cancelledCount = computed(() =>
  periodOrders.value.filter(o => o.status === 'cancelled').length
)
const fulfillmentRate = computed(() =>
  periodOrders.value.length ? Math.round((fulfilledCount.value / periodOrders.value.length) * 100) : 0
)
const cancellationRate = computed(() =>
  periodOrders.value.length ? ((cancelledCount.value / periodOrders.value.length) * 100).toFixed(1) : '0.0'
)

// ─── Hourly analysis ───
const hourlyData = computed(() => {
  const hours = Array(24).fill(0)
  for (const o of periodOrders.value) {
    const h = parseInt((o.created || '').slice(11, 13))
    if (!isNaN(h) && h >= 0 && h < 24) hours[h]++
  }
  return hours
})

const peakHour = computed(() => {
  const max = Math.max(...hourlyData.value)
  if (!max) return null
  const h = hourlyData.value.indexOf(max)
  return `${h.toString().padStart(2, '0')}:00`
})
const peakHourOrders = computed(() => {
  if (!peakHour.value) return 0
  return Math.max(...hourlyData.value)
})

// ─── Items per order ───
const avgItemsPerOrder = computed(() => {
  if (!periodOrders.value.length) return '0.0'
  let total = 0
  for (const o of periodOrders.value) {
    total += parseOrderItems(o).reduce((s, i) => s + i.qty, 0)
  }
  return (total / periodOrders.value.length).toFixed(1)
})

// ─── Parse flat order items string ───
function parseOrderItems(order) {
  const result = []
  const raw = (order.items || '').split(',').map(s => s.trim()).filter(Boolean)
  for (const item of raw) {
    const m = item.match(/^(\d+)\s*[x\u00d7]\s*(.+)/i)
    if (m) {
      result.push({ name: m[2].trim(), qty: parseInt(m[1]) || 1 })
    } else {
      result.push({ name: item, qty: 1 })
    }
  }
  return result
}

// ─── Category breakdown ───
const categoryBreakdown = computed(() => {
  const menuMap = {}
  for (const m of menuItems.value) menuMap[m.name] = m
  const cats = {}
  for (const o of periodOrders.value) {
    const items = parseOrderItems(o)
    for (const item of items) {
      const cat = menuMap[item.name]?.category || 'Other'
      if (!cats[cat]) cats[cat] = { name: cat, orders: new Set(), revenue: 0, qty: 0 }
      cats[cat].orders.add(o.id)
      cats[cat].revenue += (menuMap[item.name]?.price || 0) * item.qty
      cats[cat].qty += item.qty
    }
  }
  return Object.values(cats).map(c => ({
    name: c.name,
    orders: c.orders.size,
    revenue: c.revenue,
    avgOrder: c.orders.size ? c.revenue / c.orders.size : 0,
    qty: c.qty
  })).sort((a, b) => b.revenue - a.revenue)
})

const categoryPerformance = computed(() => {
  const total = totalRevenue.value || 1
  // Prior period category data for growth
  const menuMap = {}
  for (const m of menuItems.value) menuMap[m.name] = m
  const priorCats = {}
  for (const o of priorPeriodOrders.value) {
    const items = parseOrderItems(o)
    for (const item of items) {
      const cat = menuMap[item.name]?.category || 'Other'
      if (!priorCats[cat]) priorCats[cat] = 0
      priorCats[cat] += (menuMap[item.name]?.price || 0) * item.qty
    }
  }
  return categoryBreakdown.value.map(c => {
    const prior = priorCats[c.name] || 0
    return {
      ...c,
      share: ((c.revenue / total) * 100).toFixed(1),
      growth: prior ? Math.round(((c.revenue - prior) / prior) * 100) : null
    }
  })
})

// ─── Top / Bottom items ───
const menuItemStats = computed(() => {
  const menuMap = {}
  for (const m of menuItems.value) menuMap[m.name] = m
  const stats = {}
  for (const o of periodOrders.value) {
    const items = parseOrderItems(o)
    for (const item of items) {
      if (!stats[item.name]) stats[item.name] = { name: item.name, qty: 0, revenue: 0, category: 'Other' }
      stats[item.name].qty += item.qty
      const mi = menuMap[item.name]
      if (mi) {
        stats[item.name].revenue += mi.price * item.qty
        stats[item.name].category = mi.category
      }
    }
  }
  return Object.values(stats)
})

const topItems = computed(() => {
  const total = totalRevenue.value || 1
  return menuItemStats.value
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 15)
    .map(i => ({
      ...i,
      pctOfTotal: ((i.revenue / total) * 100).toFixed(1)
    }))
})

const bottomItems = computed(() => {
  return menuItemStats.value
    .filter(i => i.qty >= 1)
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 10)
})

// ─── Order status distribution ───
const statusDistribution = computed(() => {
  const statuses = {}
  for (const o of periodOrders.value) {
    const s = o.status || 'unknown'
    statuses[s] = (statuses[s] || 0) + 1
  }
  return Object.entries(statuses).map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)
})

// ─── Daily breakdown for charts ───
const dailyData = computed(() => {
  const map = {}
  const start = new Date(dateFrom.value)
  const end = new Date(dateTo.value)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10)
    map[ds] = { date: ds, revenue: 0, orders: 0 }
  }
  for (const o of periodOrders.value) {
    const d = (o.created || '').slice(0, 10)
    if (map[d]) {
      map[d].revenue += parseFloat(o.total || 0)
      map[d].orders++
    }
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
})

// ─── Formatting ───
function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ─── Data loading ───
onMounted(() => {
  applyPreset()
  refreshTimer = setInterval(loadData, 60000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  Object.values(charts).forEach(c => c.destroy?.())
})

async function loadData() {
  try {
    const [o, m] = await Promise.all([apiGet('orders'), apiGet('menu')])
    orders.value = o
    menuItems.value = m
    await nextTick()
    await buildCharts()
  } catch (e) {
    console.error('Analytics load error:', e)
  }
}

// ─── Chart colors ───
const CAT_COLORS = [
  '#0F7B78', '#18B4B7', '#D6B36A', '#2E7D32', '#D97706',
  '#2563EB', '#C67B5C', '#6B7B3C', '#D32F2F', '#7C3AED'
]
const STATUS_COLORS = {
  new: '#2563EB',
  preparing: '#D97706',
  ready: '#7C3AED',
  fulfilled: '#2E7D32',
  completed: '#2E7D32',
  cancelled: '#D32F2F',
  unknown: '#9A9589'
}

// ─── Build all charts ───
async function buildCharts() {
  const Chart = await loadChartJS()
  Object.values(charts).forEach(c => c.destroy?.())
  charts = {}

  const days = dailyData.value

  // 1. Revenue Trend (line)
  if (revenueTrendChart.value && days.length) {
    charts.revenueTrend = new Chart(revenueTrendChart.value, {
      type: 'line',
      data: {
        labels: days.map(d => d.date.slice(5)),
        datasets: [{
          label: 'Revenue (ETB)',
          data: days.map(d => d.revenue),
          borderColor: '#0F7B78',
          backgroundColor: 'rgba(15,123,120,.1)',
          fill: true,
          tension: 0.35,
          pointRadius: days.length > 20 ? 0 : 3,
          pointHoverRadius: 5,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => 'ETB ' + v.toLocaleString() } } },
        interaction: { intersect: false, mode: 'index' }
      }
    })
  }

  // 2. Order Volume (bar)
  if (orderVolumeChart.value && days.length) {
    charts.orderVolume = new Chart(orderVolumeChart.value, {
      type: 'bar',
      data: {
        labels: days.map(d => d.date.slice(5)),
        datasets: [{
          label: 'Orders',
          data: days.map(d => d.orders),
          backgroundColor: 'rgba(24,180,183,.65)',
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    })
  }

  // 3. Sales by Category (horizontal bar)
  const cats = categoryBreakdown.value
  if (categoryChart.value && cats.length) {
    charts.category = new Chart(categoryChart.value, {
      type: 'bar',
      data: {
        labels: cats.map(c => c.name),
        datasets: [{
          label: 'Revenue (ETB)',
          data: cats.map(c => c.revenue),
          backgroundColor: cats.map((_, i) => CAT_COLORS[i % CAT_COLORS.length]),
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { callback: v => 'ETB ' + v.toLocaleString() } } }
      }
    })
  }

  // 4. Hourly Sales Pattern (bar + line overlay)
  const hours = hourlyData.value
  if (hourlyChart.value) {
    const labels = hours.map((_, i) => i.toString().padStart(2, '0') + ':00')
    const hasData = hours.some(v => v > 0)
    charts.hourly = new Chart(hourlyChart.value, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Orders',
          data: hours,
          backgroundColor: hours.map(v => {
            if (!v) return 'rgba(154,149,137,.2)'
            const max = Math.max(...hours)
            const ratio = v / max
            if (ratio > 0.8) return 'rgba(15,123,120,.8)'
            if (ratio > 0.5) return 'rgba(24,180,183,.6)'
            return 'rgba(24,180,183,.35)'
          }),
          borderRadius: 3,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 } }
        }
      }
    })
  }

  // 5. Order Status Distribution (doughnut)
  const statuses = statusDistribution.value
  if (statusChart.value && statuses.length) {
    charts.status = new Chart(statusChart.value, {
      type: 'doughnut',
      data: {
        labels: statuses.map(s => s.status.charAt(0).toUpperCase() + s.status.slice(1)),
        datasets: [{
          data: statuses.map(s => s.count),
          backgroundColor: statuses.map(s => STATUS_COLORS[s.status] || '#9A9589'),
          borderWidth: 2,
          borderColor: 'var(--surface)'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 }, padding: 12 } }
        },
        cutout: '55%'
      }
    })
  }
}

// ─── Export ───
function exportReport() {
  const data = {
    report: 'FU FUT COFFEE Analytics Report',
    generated: new Date().toISOString(),
    period: { from: dateFrom.value, to: dateTo.value },
    summary: {
      totalRevenue,
      totalOrders: periodOrders.value.length,
      avgOrderValue,
      grossMarginPct,
      fulfillmentRate,
      cancellationRate,
      peakHour,
      revenueGrowth
    },
    categoryPerformance: categoryPerformance.value,
    topItems: topItems.value,
    bottomItems: bottomItems.value,
    statusDistribution: statusDistribution.value,
    dailyData: dailyData.value
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `fufut-analytics-${dateFrom.value}-to-${dateTo.value}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  toast('Analytics report exported')
}
</script>

<style scoped>
.analytics-period { font-size: .72rem; color: var(--text-muted); margin-top: 2px; }
</style>
