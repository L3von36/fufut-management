<template>
  <div>
    <div class="table-toolbar">
      <h3>Profit &amp; Loss</h3>
      <div style="display:flex;gap:10px">
        <input type="date" v-model="dateFrom" class="input input-sm" style="width:auto" />
        <input type="date" v-model="dateTo" class="input input-sm" style="width:auto" />
        <base-button text="Apply" variant="btn-primary" :on-click="loadPnL" loading-label="Applying..." success-label="Applied ✓" />
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-bar teal"></div>
        <div class="kpi-label">Revenue</div>
        <div class="kpi-value">ETB {{ revenue.toFixed(0) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar gold"></div>
        <div class="kpi-label">Cost of Goods</div>
        <div class="kpi-value">ETB {{ cog.toFixed(0) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar blue"></div>
        <div class="kpi-label">Gross Profit</div>
        <div class="kpi-value">ETB {{ grossProfit.toFixed(0) }}</div>
        <div class="kpi-sub">Margin: {{ margin }}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar" :class="netProfit >= 0 ? 'teal' : 'yellow'"></div>
        <div class="kpi-label">Net Profit</div>
        <div class="kpi-value" :style="{color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">ETB {{ netProfit.toFixed(0) }}</div>
        <div class="kpi-sub">After expenses</div>
      </div>
    </div>

    <div class="chart-grid" style="margin-bottom:24px">
      <div class="chart-card">
        <h3>Revenue vs Expenses</h3>
        <canvas ref="pnlChart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Cost Breakdown</h3>
        <canvas ref="costChart"></canvas>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Category</th><th>Amount (ETB)</th><th>% of Revenue</th></tr></thead>
          <tbody>
            <tr><td><strong>Revenue</strong></td><td><strong>{{ revenue.toFixed(0) }}</strong></td><td>100%</td></tr>
            <tr><td>Cost of Goods Sold</td><td style="color:var(--danger)">-{{ cog.toFixed(0) }}</td><td>{{ cogPct }}%</td></tr>
            <tr><td><strong>Gross Profit</strong></td><td><strong style="color:var(--success)">{{ grossProfit.toFixed(0) }}</strong></td><td>{{ margin }}%</td></tr>
            <tr v-for="(amt, cat) in expenseBreakdown" :key="cat">
              <td style="padding-left:32px">{{ cat }}</td><td style="color:var(--danger)">-{{ amt.toFixed(0) }}</td><td>{{ ((amt/revenue)*100).toFixed(1) }}%</td></tr>
            <tr style="border-top:2px solid var(--border)"><td><strong>Net Profit</strong></td><td><strong :style="{color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">{{ netProfit >= 0 ? '' : '-' }}{{ Math.abs(netProfit).toFixed(0) }}</strong></td><td>{{ ((netProfit/revenue)*100).toFixed(1) }}%</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { apiGet, TODAY } from '../api'
import { localDate } from '../lib/datetime'
import BaseButton from '../components/BaseButton.vue'
let _Chart = null
async function _loadChart() {
  if (!_Chart) {
    const { Chart, registerables } = await import('chart.js')
    Chart.register(...registerables)
    _Chart = Chart
  }
  return _Chart
}

const pnlChart = ref(null)
const costChart = ref(null)
const revenue = ref(0)
const cog = ref(0)
const grossProfit = ref(0)
const netProfit = ref(0)
const margin = ref(0)
const cogPct = ref(0)
const expenseBreakdown = ref({})
const dateFrom = ref(TODAY())
const dateTo = ref(TODAY())

let charts = {}

onUnmounted(() => {
  Object.values(charts).forEach(c => { if (c) c.destroy() })
  charts = {}
})

onMounted(() => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  dateFrom.value = d.toISOString().slice(0, 10)
  loadPnL()
})

async function loadPnL() {
  try {
    const [orders, expenses, menu] = await Promise.all([
      apiGet('orders'), apiGet('expenses'), apiGet('menu')
    ])

    // localDate, not slice(0,10): `created` is UTC and the range is local, so
    // slicing dropped every sale between local midnight and 03:00 into the
    // previous day — understating the start of each period and overstating the
    // one before it.
    const filteredOrders = orders.filter(o => {
      const d = localDate(o.created)
      return d && d >= dateFrom.value && d <= dateTo.value
    })
    const filteredExpenses = expenses.filter(e => e.date && e.date >= dateFrom.value && e.date <= dateTo.value)

    revenue.value = filteredOrders.reduce((s, o) => s + parseFloat(o.total||0), 0)
    // Calculate COG from actual menu item costs matched to order items
    const menuCostMap = {}
    menu.forEach(m => { menuCostMap[m.name?.toLowerCase()] = parseFloat(m.cost || 0) })
    cog.value = 0
    filteredOrders.forEach(o => {
      const structured = o.order_items || o.orderItems
      if (Array.isArray(structured) && structured.length) {
        structured.forEach(item => {
          const cost = menuCostMap[item.name?.toLowerCase()] || 0
          cog.value += cost * (item.qty || 1)
        })
      } else if (o.items && typeof o.items === 'string') {
        const parts = o.items.split(/,(?=\s*\d+x)/)
        parts.forEach(part => {
          const qtyMatch = part.trim().match(/^(\d+)x\s*(.*)/)
          if (qtyMatch) {
            const name = qtyMatch[2].trim().split('[')[0].split('(')[0].trim().toLowerCase()
            cog.value += (menuCostMap[name] || 0) * parseInt(qtyMatch[1], 10)
          }
        })
      }
    })
    grossProfit.value = revenue.value - cog.value
    margin.value = revenue.value ? ((grossProfit.value/revenue.value)*100).toFixed(1) : 0
    cogPct.value = revenue.value ? ((cog.value/revenue.value)*100).toFixed(1) : 0

    const breakdown = {}
    filteredExpenses.forEach(e => {
      const cat = e.category || 'Other'
      breakdown[cat] = (breakdown[cat] || 0) + parseFloat(e.amount||0)
    })
    expenseBreakdown.value = breakdown
    const totalExp = Object.values(breakdown).reduce((s, v) => s + v, 0)
    netProfit.value = grossProfit.value - totalExp

    // The trend chart is explicitly the last 30 days, so it gets the unfiltered
    // lists. Passing the filtered set drew empty bars for every day outside the
    // selected range on a chart whose axis said otherwise.
    buildCharts(orders, breakdown, expenses)
  } catch (e) { console.error(e) }
}

async function buildCharts(orders, breakdown, expenses = []) {
  const Chart = await _loadChart()
  await nextTick()
  if (!pnlChart.value || !costChart.value) return
  Object.values(charts).forEach(c => c.destroy())
  charts = {}

  const days = []
  const revData = []
  const expData = []
  // Pre-bucket by local date: one pass instead of re-scanning every order and
  // expense thirty times.
  const revByDate = {}
  for (const o of orders) {
    if (o.status === 'cancelled' || o.voided_at) continue
    const d = localDate(o.created)
    if (d) revByDate[d] = (revByDate[d] || 0) + parseFloat(o.total || 0) - parseFloat(o.tip || 0)
  }
  const expByDate = {}
  for (const e of expenses) {
    if (e.voided_at) continue
    const d = (e.date || '').slice(0, 10)   // expenses.date is already a local date
    if (d) expByDate[d] = (expByDate[d] || 0) + parseFloat(e.amount || 0)
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    // Local calendar date, not toISOString() — that would be the UTC day and
    // would not match the buckets above.
    const pad = (n) => String(n).padStart(2, '0')
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    days.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }))
    revData.push(revByDate[ds] || 0)
    // Was `push(0)` with a "simplified" note, so the expense series was a flat
    // line of fake zeros drawn on a chart labelled Revenue vs Expenses — which
    // reads as "we spent nothing for thirty days".
    expData.push(expByDate[ds] || 0)
  }

  charts.pnl = new Chart(pnlChart.value, {
    type: 'bar',
    data: { labels: days, datasets: [
      { label: 'Revenue', data: revData, backgroundColor: 'rgba(15,123,120,.6)' },
      { label: 'Expenses', data: expData, backgroundColor: 'rgba(217,119,6,.5)' }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  })

  const labels = Object.keys(breakdown)
  charts.cost = new Chart(costChart.value, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: Object.values(breakdown), backgroundColor: ['#0F7B78','#D6B36A','#18B4B7','#D97706','#2563EB','#7DCFD0','#E4CB99'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
  })
}
</script>
