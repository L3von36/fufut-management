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
              <span class="mini-order-id" :title="order.id">{{ shortId(order.id) }}</span>
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
          <div class="dash-table-number">{{ table.number ? 'T-' + String(table.number).padStart(2, '0') : shortId(table.id) }}</div>
          <div class="dash-table-status">{{ statusLabel(table.status || 'available') }}</div>
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

    <!-- ─── Day Summary — the simulation's end-of-day scoreboard ─────────── -->
    <!-- Mirrors the POS manager dashboard's Day Summary panel so the backoffice -->
    <!-- has the same picture the simulation produces: customers, items cooked, -->
    <!-- drinks made, deliveries, reviews, audit entries, peak concurrency. -->
    <div class="day-summary">
      <div class="card day-summary-card">
        <div class="card-header">
          <h3>📊 Day Summary</h3>
          <span class="day-summary-sub">{{ daySummary.customers }} customers · {{ clock() }}</span>
        </div>
        <div class="day-summary-grid">
          <div class="ds-stat">
            <div class="ds-stat-label">Total Customers</div>
            <div class="ds-stat-value">{{ daySummary.customers }}</div>
            <div class="ds-stat-sub">Dine-in {{ daySummary.byType.dineIn }} · QR {{ daySummary.byType.qr }} · Takeout {{ daySummary.byType.takeout }} · Delivery {{ daySummary.byType.delivery }}</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Kitchen</div>
            <div class="ds-stat-value">{{ daySummary.itemsCooked }} <span class="ds-stat-unit">items</span></div>
            <div class="ds-stat-sub">{{ daySummary.drinksMade }} drinks made by barista</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Deliveries</div>
            <div class="ds-stat-value">{{ daySummary.deliveriesInitiated }} <span class="ds-stat-unit">initiated</span></div>
            <div class="ds-stat-sub">
              <span style="color:var(--success)">{{ daySummary.deliveriesCompleted }} completed</span>
              <span v-if="daySummary.deliveriesFailed" style="color:var(--danger)"> · {{ daySummary.deliveriesFailed }} failed</span>
            </div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Reviews</div>
            <div class="ds-stat-value">
              {{ daySummary.reviewsCount }} <span class="ds-stat-unit">⭐ {{ daySummary.reviewsAvg }}/5</span>
            </div>
            <div class="ds-stat-sub">{{ operations.complaints }} complaints today</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Peak Concurrency</div>
            <div class="ds-stat-value">{{ daySummary.peakConcurrentOrders }} <span class="ds-stat-unit">orders</span></div>
            <div class="ds-stat-sub">High-water mark today</div>
          </div>
          <div class="ds-stat">
            <div class="ds-stat-label">Audit Entries</div>
            <div class="ds-stat-value">{{ daySummary.auditEntries }}</div>
            <div class="ds-stat-sub">Back-office activity today</div>
          </div>
        </div>
      </div>

      <!-- Operations panel — voids, refunds, splits, modifications, cancellations -->
      <div class="card ops-card">
        <div class="card-header">
          <h3>❌ Operations</h3>
          <span class="ops-sub">Today's voids, refunds, splits, modifications, cancellations</span>
        </div>
        <div class="ops-grid">
          <div class="ops-stat">
            <div class="ops-stat-label" style="color:var(--danger)">Voids</div>
            <div class="ops-stat-value">{{ operations.voids }}</div>
            <div class="ops-stat-sub">ETB {{ operations.voidsTotal.toFixed(0) }}</div>
          </div>
          <div class="ops-stat">
            <div class="ops-stat-label" style="color:var(--warning)">Refunds</div>
            <div class="ops-stat-value">{{ operations.refunds }}</div>
            <div class="ops-stat-sub">ETB {{ operations.refundsTotal.toFixed(0) }}</div>
          </div>
          <div class="ops-stat">
            <div class="ops-stat-label">Splits</div>
            <div class="ops-stat-value">{{ operations.splits }}</div>
            <div class="ops-stat-sub">Bill splits today</div>
          </div>
          <div class="ops-stat">
            <div class="ops-stat-label">Modifications</div>
            <div class="ops-stat-value">{{ operations.modifications }}</div>
            <div class="ops-stat-sub">Order item updates</div>
          </div>
          <div class="ops-stat">
            <div class="ops-stat-label" style="color:var(--info)">Cancellations</div>
            <div class="ops-stat-value">{{ operations.cancellations }}</div>
            <div class="ops-stat-sub">ETB {{ operations.cancellationsTotal.toFixed(0) }}</div>
          </div>
          <div class="ops-stat">
            <div class="ops-stat-label" style="color:var(--danger)">Complaints</div>
            <div class="ops-stat-value">{{ operations.complaints }}</div>
            <div class="ops-stat-sub">From audit log reasons</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { apiGet, TODAY } from '../api'
import { useAnimatedNumber } from '../composables/useAnimatedNumber'
import { formatOrderItems, shortId, isRealOrder } from '../lib/formatters'
import { statusLabel } from '../composables/useStatusBadge'
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

// ─── Day Summary + Operations ────────────────────────────────────────────
// The simulation's end-of-day scoreboard, surfaced live on the backoffice
// dashboard. Same shape as the POS manager dashboard's Day Summary panel.
const daySummary = ref({
  customers: 0,
  byType: { dineIn: 0, qr: 0, takeout: 0, delivery: 0 },
  itemsCooked: 0,
  drinksMade: 0,
  deliveriesInitiated: 0,
  deliveriesCompleted: 0,
  deliveriesFailed: 0,
  reviewsCount: 0,
  reviewsAvg: 0,
  auditEntries: 0,
  peakConcurrentOrders: 0,
})
const operations = ref({
  voids: 0, voidsTotal: 0,
  refunds: 0, refundsTotal: 0,
  splits: 0,
  modifications: 0,
  cancellations: 0, cancellationsTotal: 0,
  complaints: 0,
})

function clock() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function loadDaySummary() {
  try {
    const [allOrders, pays, reviews, deliv, audit] = await Promise.all([
      apiGet('orders').catch(() => []),
      apiGet('payments').catch(() => []),
      apiGet('reviews').catch(() => []),
      apiGet('delivery').catch(() => []),
      apiGet('audit?limit=500').catch(() => []),
    ])
    const oList = Array.isArray(allOrders) ? allOrders : []
    const payList = Array.isArray(pays) ? pays : (pays?.payments || [])
    const revList = Array.isArray(reviews) ? reviews : []
    const delList = Array.isArray(deliv) ? deliv : []
    const audList = Array.isArray(audit) ? audit : []

    const today = oList.filter(o => isRealOrder(o) && isToday(o.created))
    const todayVoided = oList.filter(o => o.voided_at && isToday(o.voided_at))
    const todayCancelled = oList.filter(o => o.status === 'cancelled' && isToday(o.created) && !o.voided_at)

    const byType = {
      dineIn: today.filter(o => o.type === 'dine-in' && o.source !== 'qr').length,
      qr: today.filter(o => o.source === 'qr').length,
      takeout: today.filter(o => o.type === 'takeout' || o.type === 'takeaway').length,
      delivery: today.filter(o => o.type === 'delivery').length,
    }

    const DRINK_CATS = new Set(['C-COF','C-TEA','C-DRK','C-BAK','Coffee','Tea','Drinks','Bakery'])
    let itemsCooked = 0, drinksMade = 0
    for (const o of today) {
      const lines = o.order_items || o.orderItems
      if (Array.isArray(lines)) {
        for (const l of lines) {
          if (l.status === 'cancelled' || l.status === 'voided') continue
          const qty = parseInt(l.qty) || 1
          if (DRINK_CATS.has(l.category || '')) drinksMade += qty
          else itemsCooked += qty
        }
      }
    }

    const todayDel = delList.filter(d => isToday(d.created))
    const todayRev = revList.filter(r => isToday(r.date || r.created))
    const reviewsAvg = todayRev.length
      ? Math.round(todayRev.reduce((s, r) => s + (Number(r.rating) || 0), 0) / todayRev.length * 10) / 10
      : 0
    const auditEntries = audList.filter(a => isToday(a.at || a.created)).length

    // Peak concurrent orders — sweep created→served/voided intervals.
    let peakConcurrent = 0
    const events = []
    for (const o of today) {
      const start = new Date(o.created).getTime()
      const end = new Date(o.served_at || o.voided_at || o.updated_at || o.created).getTime()
      events.push([start, +1], [Math.max(end, start + 1), -1])
    }
    events.sort((a, b) => a[0] - b[0] || b[1] - a[1])
    let cur = 0
    for (const [, d] of events) { cur += d; if (cur > peakConcurrent) peakConcurrent = cur }

    daySummary.value = {
      customers: today.length, byType,
      itemsCooked, drinksMade,
      deliveriesInitiated: todayDel.length,
      deliveriesCompleted: todayDel.filter(d => d.status === 'delivered').length,
      deliveriesFailed: todayDel.filter(d => d.status === 'cancelled').length,
      reviewsCount: todayRev.length, reviewsAvg,
      auditEntries, peakConcurrentOrders: peakConcurrent,
    }

    // Operations panel
    const todayPays = payList.filter(p => isToday(p.created_at || p.created))
    const refundsToday = todayPays.filter(p => Number(p.amount) < 0 || p.status === 'refunded')
    const complaintKeywords = ['complaint', 'wrong', 'cold', 'slow', 'rude']
    operations.value = {
      voids: todayVoided.length,
      voidsTotal: todayVoided.reduce((s, o) => s + (Number(o.total) || 0), 0),
      refunds: refundsToday.length,
      refundsTotal: refundsToday.reduce((s, p) => s + Math.abs(Number(p.amount) || 0), 0),
      splits: oList.filter(o => o.payment_status === 'split' && isToday(o.created)).length,
      modifications: audList.filter(a => isToday(a.at || a.created) && a.action === 'update' && a.entity === 'order_items').length,
      cancellations: todayCancelled.length,
      cancellationsTotal: todayCancelled.reduce((s, o) => s + (Number(o.total) || 0), 0),
      complaints: audList.filter(a => isToday(a.at || a.created) && a.reason && complaintKeywords.some(k => String(a.reason).toLowerCase().includes(k))).length,
    }
  } catch (e) { console.error('Day summary load failed', e) }
}

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
  // isRealOrder: a voided check is history even when a legacy row carries
  // only one of the two void markers.
  return orders.value.filter(o =>
    sameTable(o.tableId, table) && isRealOrder(o) && o.status !== 'fulfilled')
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
    // Voided and cancelled orders are audit history, not today's revenue —
    // isRealOrder mirrors the API's REAL_ORDERS rule in reports.js.
    todayOrders.value = o.filter(o => isRealOrder(o) && isToday(o.created))
    todayExpenses.value = ex.filter(e => isToday(e.date))
    inventory.value = inv
    menu.value = m

    const rev = todayOrders.value.reduce((s, o) => s + parseFloat(o.total||0), 0)
    const exp = todayExpenses.value.reduce((s, e) => s + parseFloat(e.amount||0), 0)
    const low = inv.filter(i => parseInt(i.quantity||0) <= parseInt(i.minLevel||0)).length
    const active = o.filter(o => isRealOrder(o) && o.status !== 'fulfilled').length

    animateRev(rev)
    animateOrd(active)
    animateExp(exp)
    animateLow(low)

    // Top selling items
    buildTopItems(o.filter(isRealOrder))
    // Peak hours chart
    await nextTick()
    await buildPeakChart(o.filter(isRealOrder))
    // Day Summary + Operations panel — the simulation's end-of-day scoreboard
    loadDaySummary()
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
.dash-table-status{font-size:.62rem;font-weight:600;text-transform:capitalize;letter-spacing:.04em;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dash-table-cell.status-occupied .dash-table-status{color:var(--danger)}
.dash-table-cell.status-reserved .dash-table-status{color:var(--warning)}
.dash-table-guests{font-size:.62rem;color:var(--text-heading);font-weight:500;margin-top:2px}
.dash-table-duration{font-size:.6rem;color:var(--text-muted);font-family:var(--font-mono)}

/* ─── Day Summary + Operations panels ──────────────────────────────────── */
.day-summary{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-top:20px}
@media(max-width:900px){.day-summary{grid-template-columns:1fr}}
.day-summary-card,.ops-card{margin-bottom:0}
.day-summary-sub,.ops-sub{font-size:.75rem;color:var(--text-muted);font-weight:400}
.day-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:600px){.day-summary-grid{grid-template-columns:repeat(2,1fr)}}
.ds-stat{padding:10px 12px;border-radius:var(--radius-sm);background:var(--neutral-50);border:1px solid var(--border)}
.ds-stat-label{font-size:.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
.ds-stat-value{font-size:1.4rem;font-weight:700;color:var(--text-heading);line-height:1.1;font-variant-numeric:tabular-nums}
.ds-stat-unit{font-size:.78rem;font-weight:500;color:var(--text-muted);margin-left:4px}
.ds-stat-sub{font-size:.7rem;color:var(--text-muted);margin-top:3px;line-height:1.3}

.ops-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(max-width:600px){.ops-grid{grid-template-columns:repeat(2,1fr)}}
.ops-stat{padding:8px 10px;border-radius:var(--radius-sm);background:var(--neutral-50);border:1px solid var(--border)}
.ops-stat-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;font-weight:600}
.ops-stat-value{font-size:1.15rem;font-weight:700;color:var(--text-heading);line-height:1.1;font-variant-numeric:tabular-nums}
.ops-stat-sub{font-size:.68rem;color:var(--text-muted);margin-top:2px}
:global([data-theme="dark"]) .ds-stat,:global([data-theme="dark"]) .ops-stat{background:rgba(255,255,255,.03)}
</style>
