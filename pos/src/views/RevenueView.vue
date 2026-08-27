<template>
  <div>
    <div class="table-toolbar">
      <h3>Revenue</h3>
      <!--
        Wraps, like every other toolbar in the app. Two native date inputs and
        a button come to ~424px, and without this they were laid out in one
        unwrappable row on a 390px screen: the page does not scroll sideways,
        so the Apply button was simply clipped off the edge.
      -->
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input type="date" v-model="dateFrom" class="input input-sm" style="width:auto" />
        <input type="date" v-model="dateTo" class="input input-sm" style="width:auto" />
        <button class="btn btn-primary" @click="loadRevenue">Apply</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-bar teal"></div><div class="kpi-label">Total Revenue</div><div class="kpi-value">ETB {{ totalRev.toFixed(0) }}</div></div>
      <!-- filteredOrders, not orders.length: the count must describe the same
           date range as the revenue beside it, not every order ever taken. -->
      <div class="kpi-card"><div class="kpi-bar blue"></div><div class="kpi-label">Orders</div><div class="kpi-value">{{ filteredOrders.length }}</div></div>
      <div class="kpi-card"><div class="kpi-bar gold"></div><div class="kpi-label">Avg Order Value</div><div class="kpi-value">ETB {{ avgOrder.toFixed(0) }}</div></div>
      <div class="kpi-card"><div class="kpi-bar" :class="cashPct > 50 ? 'teal' : 'yellow'"></div><div class="kpi-label">Cash / Card</div><div class="kpi-value">{{ cashPct }}% / {{ cardPct }}%</div></div>
    </div>

    <div class="chart-grid">
      <div class="chart-card"><h3>Daily Revenue</h3><canvas ref="revChart"></canvas></div>
      <div class="chart-card"><h3>Payment Methods</h3><canvas ref="paymentChart"></canvas></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Orders</th><th>Revenue (ETB)</th><th>Cash</th><th>Card/Mobile</th></tr></thead>
          <tbody>
            <tr v-for="day in dailyBreakdown" :key="day.date">
              <td data-label="Date">{{ day.date }}</td><td data-label="Orders">{{ day.count }}</td><td data-label="Revenue (ETB)" style="font-weight:600;font-family:var(--font-mono)">{{ day.revenue.toFixed(0) }}</td>
              <td data-label="Cash">{{ day.cash.toFixed(0) }}</td><td data-label="Card/Mobile">{{ day.card.toFixed(0) }}</td>
            </tr>
            <tr v-if="!dailyBreakdown.length"><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No data</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { apiGet, TODAY } from '../api'
import { isRealOrder } from '../lib/formatters'
let _Chart = null
async function _loadChart() {
  if (!_Chart) {
    const { Chart, registerables } = await import('chart.js')
    Chart.register(...registerables)
    _Chart = Chart
  }
  return _Chart
}

const revChart = ref(null)
const paymentChart = ref(null)
const orders = ref([])
const dateFrom = ref(TODAY())
const dateTo = ref(TODAY())
const dailyBreakdown = ref([])
let charts = {}

/**
 * The orders the selected date range actually covers, voided and cancelled
 * tickets excluded — the same isRealOrder rule as Dashboard and Reports.
 * Every figure on this screen reads from here; before it existed the KPI row
 * summed ALL history (ETB 51,567 / 145 orders) no matter which dates were
 * picked, while the daily table quietly filtered by date underneath it.
 */
const filteredOrders = computed(() => orders.value.filter(o => {
  if (!isRealOrder(o)) return false
  const d = (o.created || '').slice(0, 10)
  return d >= dateFrom.value && d <= dateTo.value
}))

// Revenue is food money, tips excluded — the same NET_SALES convention as
// the server reports, the Dashboard and Reports, so the same day reads the
// same on every screen (live: ETB 1066 here vs 1045 there for one 20.5 tip).
const netOf = (o) => parseFloat(o.total || 0) - parseFloat(o.tip || 0)
const totalRev = computed(() => filteredOrders.value.reduce((s, o) => s + netOf(o), 0))
const avgOrder = computed(() => filteredOrders.value.length ? totalRev.value / filteredOrders.value.length : 0)
// Fix #14: Break down by individual payment method
const paymentBreakdown = computed(() => {
  const m = {}
  for (const o of filteredOrders.value) {
    const methods = (o.payment || 'unknown').split('+')
    for (const method of methods) {
      const key = method.trim()
      m[key] = (m[key] || 0) + netOf(o) / methods.length
    }
  }
  return m
})
const cashTotal = computed(() => paymentBreakdown.value['cash'] || 0)
const cardTotal = computed(() => {
  return Object.entries(paymentBreakdown.value)
    .filter(([k]) => k !== 'cash')
    .reduce((s, [, v]) => s + v, 0)
})
const cashPct = computed(() => totalRev.value ? ((cashTotal.value/totalRev.value)*100).toFixed(1) : 0)
const cardPct = computed(() => totalRev.value ? ((cardTotal.value/totalRev.value)*100).toFixed(1) : 0)

onMounted(() => { const d = new Date(); d.setDate(d.getDate()-14); dateFrom.value = d.toISOString().slice(0,10); loadRevenue() })

async function loadRevenue() {
  try {
    orders.value = await apiGet('orders')
    buildDailyBreakdown()
    await nextTick()
    await buildCharts()
  } catch (e) { console.error(e) }
}

function buildDailyBreakdown() {
  const map = {}
  filteredOrders.value.forEach(o => {
    const d = o.created?.slice(0,10)
    if (d && d >= dateFrom.value && d <= dateTo.value) {
      if (!map[d]) map[d] = { date: d, count: 0, revenue: 0, cash: 0, card: 0 }
      map[d].count++
      map[d].revenue += netOf(o)
      if (o.payment === 'cash') map[d].cash += netOf(o)
      else map[d].card += netOf(o)
    }
  })
  dailyBreakdown.value = Object.values(map).sort((a,b) => a.date.localeCompare(b.date))
}

async function buildCharts() {
  const Chart = await _loadChart()
  Object.values(charts).forEach(c => c.destroy())
  charts = {}

  if (revChart.value) {
    charts.rev = new Chart(revChart.value, {
      type: 'bar',
      data: { labels: dailyBreakdown.value.map(d => d.date.slice(5)), datasets: [{ label: 'Revenue', data: dailyBreakdown.value.map(d => d.revenue), backgroundColor: 'rgba(15,123,120,.6)' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    })
  }
  if (paymentChart.value) {
    // Fix #14: Show individual payment methods
    const pmLabels = Object.keys(paymentBreakdown.value)
    const pmData = Object.values(paymentBreakdown.value)
    const pmColors = ['#0F7B78', '#D6B36A', '#2563EB', '#2E7D32', '#D97706', '#7C3AED', '#D32F2F']
    charts.payment = new Chart(paymentChart.value, {
      type: 'doughnut',
      data: { labels: pmLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)), datasets: [{ data: pmData, backgroundColor: pmColors.slice(0, pmLabels.length) }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
    })
  }
}
</script>
