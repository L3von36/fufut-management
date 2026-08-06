<template>
  <div>
    <div class="table-toolbar">
      <h3>Revenue</h3>
      <div style="display:flex;gap:10px">
        <input type="date" v-model="dateFrom" class="input input-sm" style="width:auto" />
        <input type="date" v-model="dateTo" class="input input-sm" style="width:auto" />
        <base-button text="Apply" variant="btn-primary" :on-click="loadRevenue" loading-label="Applying..." success-label="Applied ✓" />
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-bar teal"></div><div class="kpi-label">Total Revenue</div><div class="kpi-value">ETB {{ totalRev.toFixed(0) }}</div></div>
      <div class="kpi-card"><div class="kpi-bar blue"></div><div class="kpi-label">Orders</div><div class="kpi-value">{{ orders.length }}</div></div>
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
              <td>{{ day.date }}</td><td>{{ day.count }}</td><td style="font-weight:600;font-family:var(--font-mono)">{{ day.revenue.toFixed(0) }}</td>
              <td>{{ day.cash.toFixed(0) }}</td><td>{{ day.card.toFixed(0) }}</td>
            </tr>
            <tr v-if="!dailyBreakdown.length"><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No data</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { apiGet, TODAY } from '../api'
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

const revChart = ref(null)
const paymentChart = ref(null)
const orders = ref([])
const expenses = ref([])
const dateFrom = ref(TODAY())
const dateTo = ref(TODAY())
const dailyBreakdown = ref([])
let charts = {}

onUnmounted(() => {
  Object.values(charts).forEach(c => { if (c) c.destroy() })
  charts = {}
})

const totalRev = computed(() => orders.value.reduce((s, o) => s + parseFloat(o.total||0), 0))
const avgOrder = computed(() => orders.value.length ? totalRev.value / orders.value.length : 0)
const cashTotal = computed(() => orders.value.filter(o => o.payment === 'cash').reduce((s, o) => s + parseFloat(o.total||0), 0))
const cardTotal = computed(() => totalRev.value - cashTotal.value)
const cashPct = computed(() => totalRev.value ? ((cashTotal.value/totalRev.value)*100).toFixed(1) : 0)
const cardPct = computed(() => totalRev.value ? ((cardTotal.value/totalRev.value)*100).toFixed(1) : 0)

onMounted(() => { const d = new Date(); d.setDate(d.getDate()-14); dateFrom.value = d.toISOString().slice(0,10); loadRevenue() })

async function loadRevenue() {
  try {
    const [o, ex] = await Promise.all([apiGet('orders'), apiGet('expenses')])
    orders.value = o
    expenses.value = ex
    buildDailyBreakdown()
    await nextTick()
    await buildCharts()
  } catch (e) { console.error(e) }
}

function buildDailyBreakdown() {
  const map = {}
  orders.value.forEach(o => {
    const d = o.created?.slice(0,10)
    if (d && d >= dateFrom.value && d <= dateTo.value) {
      if (!map[d]) map[d] = { date: d, count: 0, revenue: 0, cash: 0, card: 0 }
      map[d].count++
      map[d].revenue += parseFloat(o.total||0)
      if (o.payment === 'cash') map[d].cash += parseFloat(o.total||0)
      else map[d].card += parseFloat(o.total||0)
    }
  })
  dailyBreakdown.value = Object.values(map).sort((a,b) => a.date.localeCompare(b.date))
}

async function buildCharts() {
  const Chart = await _loadChart()
  Object.values(charts).forEach(c => c.destroy())
  charts = {}

  if (revChart.value) {
    // Build expense map by date
    const expByDate = {}
    expenses.value.forEach(e => {
      if (e.date && e.date >= dateFrom.value && e.date <= dateTo.value) {
        expByDate[e.date] = (expByDate[e.date] || 0) + parseFloat(e.amount || 0)
      }
    })
    charts.rev = new Chart(revChart.value, {
      type: 'bar',
      data: { labels: dailyBreakdown.value.map(d => d.date.slice(5)), datasets: [
        { label: 'Revenue', data: dailyBreakdown.value.map(d => d.revenue), backgroundColor: 'rgba(15,123,120,.6)' },
        { label: 'Expenses', data: dailyBreakdown.value.map(d => expByDate[d.date] || 0), backgroundColor: 'rgba(217,119,6,.5)' }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    })
  }
  if (paymentChart.value) {
    charts.payment = new Chart(paymentChart.value, {
      type: 'doughnut',
      data: { labels: ['Cash', 'Card/Mobile'], datasets: [{ data: [cashTotal.value, cardTotal.value], backgroundColor: ['#0F7B78', '#D6B36A'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    })
  }
}
</script>
