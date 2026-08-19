<template>
  <div>
    <!-- Animated KPIs -->
    <div class="kpi-grid">
      <div v-for="kpi in kpiDefs" :key="kpi.label" class="kpi-card" ref="kpiRefs">
        <div class="kpi-bar" :class="kpi.bar"></div>
        <div class="kpi-label">{{ kpi.label }}</div>
        <div class="kpi-value">{{ kpi.prefix }}{{ kpi.animatedValue }}{{ kpi.suffix }}</div>
        <div class="kpi-sub" v-if="kpi.sub" v-html="kpi.sub"></div>
      </div>
    </div>

    <!-- Top Selling Items + Peak Hours -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div class="card">
        <div class="card-header"><h3>🔥 Top Selling Items</h3></div>
        <div v-if="topItems.length">
          <div v-for="(item, i) in topItems.slice(0, 6)" :key="item.name" class="top-item-row">
            <span class="top-rank">#{{ i + 1 }}</span>
            <span class="top-name">{{ item.name }}</span>
            <span class="top-count">{{ item.count }}x</span>
            <div class="top-bar-bg"><div class="top-bar-fill" :style="{ width: (item.count / topItems[0].count * 100) + '%' }"></div></div>
          </div>
        </div>
        <div v-else style="text-align:center;padding:20px;color:var(--text-muted);font-size:.85rem">No sales data yet</div>
      </div>
      <div class="card chart-card">
        <div class="card-header"><h3>🕐 Peak Hours</h3></div>
        <canvas ref="peakChart" style="max-height:200px"></canvas>
      </div>
    </div>

    <!-- Order Pipeline mini -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <h3>📋 Active Orders</h3>
        <router-link to="/app/pipeline" class="btn btn-sm btn-secondary">View Pipeline →</router-link>
      </div>
      <div class="mini-pipeline">
        <div v-for="stage in miniStages" :key="stage.key" class="mini-lane">
          <div class="mini-lane-header" :style="{ background: stage.color }">{{ stage.label }} ({{ miniGrouped[stage.key]?.length || 0 }})</div>
          <div class="mini-lane-body">
            <div v-for="order in (miniGrouped[stage.key] || []).slice(0, 3)" :key="order.id" class="mini-order">
              <span class="mini-order-id">#{{ order.id }}</span>
              <span class="mini-order-items">{{ formatOrderItems(order.items) }}</span>
            </div>
            <div v-if="!(miniGrouped[stage.key]?.length)" class="mini-empty">{{ stage.emptyText }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tables Overview -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <h3>🗄️ Tables Overview</h3>
        <router-link to="/app/tables" class="btn btn-sm btn-secondary">View All Tables →</router-link>
      </div>
      <div v-if="tables.length" class="dash-tables">
        <div v-for="table in tables.slice(0, 12)" :key="table.id"
          class="dash-table-cell"
          :class="'status-' + (table.status || 'available')"
          @click="navigateToTable(table)"
        >
          <div class="dash-table-number">{{ table.number || table.id }}</div>
          <div class="dash-table-status">{{ (table.status || 'available').slice(0, 4) }}</div>
          <div v-if="table.status === 'occupied' && tableOrders(table)?.length" class="dash-table-guests">
            {{ tableOrders(table)[0].guests || '—' }} guests · ETB {{ parseFloat(tableOrders(table)[0].total || 0).toFixed(0) }}
          </div>
          <div v-if="table.status === 'occupied' && tableOrders(table)?.length" class="dash-table-duration">
            {{ getDuration(tableOrders(table)[0].created) }}
          </div>
        </div>
      </div>
      <div v-else style="text-align:center;padding:16px;color:var(--text-muted);font-size:.85rem">Loading tables...</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { apiGet, TODAY } from '../api'
import { useAnimatedNumber } from '../composables/useAnimatedNumber'
import { formatOrderItems } from '../lib/formatters'
import { sameTable } from '../lib/tableRef'
let _Chart = null
async function _loadChart() {
  if (!_Chart) {
    const { Chart, registerables } = await import('chart.js')
    Chart.register(...registerables)
    _Chart = Chart
  }
  return _Chart
}

const peakChart = ref(null)
const kpiRefs = ref([])
const orders = ref([])
const todayOrders = ref([])
const todayExpenses = ref([])
const inventory = ref([])
const menu = ref([])
const topItems = ref([])
const tables = ref([])
let chart = null
let interval = null

const { displayValue: revDisplay, animateTo: animateRev } = useAnimatedNumber(800)
const { displayValue: ordDisplay, animateTo: animateOrd } = useAnimatedNumber(600)
const { displayValue: expDisplay, animateTo: animateExp } = useAnimatedNumber(700)
const { displayValue: lowDisplay, animateTo: animateLow } = useAnimatedNumber(500)

const kpiDefs = computed(() => [
  { label: 'Today Revenue', prefix: 'ETB ', animatedValue: Math.round(revDisplay.value), suffix: '', sub: `${todayOrders.value.length} orders today`, bar: 'teal' },
  { label: 'Active Orders', prefix: '', animatedValue: Math.round(ordDisplay.value), suffix: '', sub: `${todayOrders.value.filter(o => o.status === 'preparing').length} preparing`, bar: 'blue' },
  { label: 'Today Expenses', prefix: 'ETB ', animatedValue: Math.round(expDisplay.value), suffix: '', sub: `${todayExpenses.value.length} entries`, bar: 'gold' },
  { label: 'Low Stock', prefix: '', animatedValue: Math.round(lowDisplay.value), suffix: '', sub: `${Math.round(lowDisplay.value)} items need reorder`, bar: 'yellow', color: lowDisplay.value > 0 ? 'var(--danger)' : '' }
])

const router = useRouter()

/* Same reference-spelling problem as the floor plan; see lib/tableRef.js. */
function tableOrders(table) {
  if (!table) return []
  return orders.value.filter(o =>
    sameTable(o.tableId, table) && o.status !== 'fulfilled' && o.status !== 'cancelled')
}

function getDuration(created) {
  if (!created) return '—'
  const diff = Math.floor((Date.now() - new Date(created).getTime()) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function navigateToTable(table) {
  router.push('/app/tables')
}

const miniStages = [
  { key: 'new', label: 'New', color: 'linear-gradient(135deg,#2563EB,#60A5FA)', emptyText: 'None' },
  { key: 'preparing', label: 'Cooking', color: 'linear-gradient(135deg,#D97706,#FBBF24)', emptyText: 'None' },
  { key: 'ready', label: 'Ready', color: 'linear-gradient(135deg,#7C3AED,#A78BFA)', emptyText: 'None' }
]

const miniGrouped = computed(() => {
  const g = {}
  miniStages.forEach(s => { g[s.key] = [] })
  orders.value.forEach(o => {
    if (g[o.status]) g[o.status].push(o)
  })
  return g
})

function isToday(d) { return d && d.slice(0, 10) === TODAY() }

onMounted(async () => {
  await loadDashboard()
  interval = setInterval(loadDashboard, 30000)
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
  if (chart) chart.destroy()
})

async function loadDashboard() {
  try {
    const [o, ex, inv, m, t] = await Promise.all([
      apiGet('orders'), apiGet('expenses'), apiGet('inventory'), apiGet('menu'), apiGet('tables')
    ])
    orders.value = o
    tables.value = t
    todayOrders.value = o.filter(o => isToday(o.created))
    todayExpenses.value = ex.filter(e => isToday(e.date))
    inventory.value = inv
    menu.value = m

    const rev = todayOrders.value.reduce((s, o) => s + parseFloat(o.total||0), 0)
    const exp = todayExpenses.value.reduce((s, e) => s + parseFloat(e.amount||0), 0)
    const low = inv.filter(i => parseInt(i.quantity||0) <= parseInt(i.minLevel||0)).length
    const active = o.filter(o => o.status !== 'fulfilled' && o.status !== 'cancelled').length

    animateRev(rev)
    animateOrd(active)
    animateExp(exp)
    animateLow(low)

    // Top selling items
    buildTopItems(o)
    // Peak hours chart
    await nextTick()
    await buildPeakChart(o)
  } catch (e) { console.error(e) }
}

function buildTopItems(orders) {
  const count = {}
  orders.forEach(o => {
    if (!o.items) return
    // items could be a string like "Latte x2, Espresso" or a list
    const itemsStr = typeof o.items === 'string' ? o.items : (o.items || []).join(', ')
    const parts = itemsStr.split(',').map(s => s.trim()).filter(Boolean)
    parts.forEach(p => {
      const match = p.match(/(.+?)\s*x(\d+)/i)
      if (match) {
        const name = match[1].trim()
        count[name] = (count[name] || 0) + parseInt(match[2])
      } else {
        count[p] = (count[p] || 0) + 1
      }
    })
  })
  topItems.value = Object.entries(count)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

async function buildPeakChart(orders) {
  const Chart = await _loadChart()
  if (chart) chart.destroy()
  if (!peakChart.value) return

  const hourCount = {}
  for (let h = 0; h < 24; h++) hourCount[h] = 0

  orders.forEach(o => {
    if (o.created) {
      const h = new Date(o.created).getHours()
      hourCount[h] = (hourCount[h] || 0) + 1
    }
  })

  const labels = []
  const data = []
  for (let h = 0; h < 24; h++) {
    labels.push(`${h}:00`)
    data.push(hourCount[h])
  }

  // Color intensity based on value
  const maxVal = Math.max(...data, 1)
  const bgColors = data.map(v => {
    const intensity = v / maxVal
    return `rgba(15, 123, 120, ${0.15 + intensity * 0.7})`
  })

  chart = new Chart(peakChart.value, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Orders', data, backgroundColor: bgColors, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false }, ticks: { maxRotation: 0, font: { size: 10 } } }
      }
    }
  })
}
</script>

<style scoped>
.top-item-row{display:grid;grid-template-columns:28px 1fr 36px 80px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:.82rem}
.top-rank{font-weight:700;color:var(--text-muted);font-size:.72rem}
.top-name{color:var(--text-heading);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.top-count{font-weight:600;font-family:var(--font-mono);color:var(--primary);text-align:right}
.top-bar-bg{height:6px;background:var(--neutral-100);border-radius:99px;overflow:hidden}
.top-bar-fill{height:100%;background:linear-gradient(90deg,var(--primary),var(--secondary));border-radius:99px;transition:width .6s var(--ease-out)}

.mini-pipeline{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.mini-lane{background:var(--neutral-50);border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border)}
.mini-lane-header{padding:6px 10px;color:#fff;font-size:.72rem;font-weight:600}
.mini-lane-body{padding:6px;min-height:50px}
.mini-order{display:flex;gap:6px;padding:4px 6px;font-size:.75rem;border-bottom:1px solid var(--border)}
.mini-order-id{font-weight:600;font-family:var(--font-mono);color:var(--text-heading)}
.mini-order-items{color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mini-empty{padding:12px;text-align:center;font-size:.72rem;color:var(--text-muted)}

.dash-tables{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.dash-table-cell{border:2px solid var(--border);border-radius:var(--radius-sm);padding:8px;text-align:center;cursor:pointer;transition:all var(--duration-fast) var(--ease)}
.dash-table-cell:hover{transform:translateY(-2px);box-shadow:var(--shadow-sm)}
.dash-table-cell.status-available{border-color:var(--success);background:var(--green-50)}
.dash-table-cell.status-occupied{border-color:var(--danger);background:var(--red-50)}
.dash-table-cell.status-reserved{border-color:var(--warning);background:var(--gold-50)}
.dash-table-cell.status-cleaning{border-color:var(--info);background:var(--blue-50)}
.dash-table-number{font-size:1rem;font-weight:700;color:var(--text-heading)}
.dash-table-status{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)}
.dash-table-cell.status-occupied .dash-table-status{color:var(--danger)}
.dash-table-cell.status-reserved .dash-table-status{color:var(--warning)}
.dash-table-guests{font-size:.62rem;color:var(--text-heading);font-weight:500;margin-top:2px}
.dash-table-duration{font-size:.6rem;color:var(--text-muted);font-family:var(--font-mono)}
</style>
