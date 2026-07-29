<template>
  <div>
    <div class="table-toolbar">
      <h3>Reports</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-secondary" @click="exportCSV">Export CSV</button>
        <button class="btn btn-secondary" @click="exportReceipt">Generate Receipt</button>
        <button class="btn btn-primary" @click="loadData">Refresh</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-bar teal"></div><div class="kpi-label">Total Revenue</div><div class="kpi-value">ETB {{ totalRev.toFixed(0) }}</div></div>
      <div class="kpi-card"><div class="kpi-bar gold"></div><div class="kpi-label">Total Expenses</div><div class="kpi-value">ETB {{ totalExp.toFixed(0) }}</div></div>
      <div class="kpi-card"><div class="kpi-bar" :class="totalRev-totalExp >= 0 ? 'teal' : 'yellow'"></div><div class="kpi-label">Net</div><div class="kpi-value" :style="{color: totalRev-totalExp >= 0 ? 'var(--success)' : 'var(--danger)'}">ETB {{ (totalRev-totalExp).toFixed(0) }}</div></div>
      <div class="kpi-card"><div class="kpi-bar blue"></div><div class="kpi-label">Active Staff</div><div class="kpi-value">{{ staffCount }}</div></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3 style="font-size:.9rem;color:var(--text-heading);margin-bottom:12px">Export Data</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select v-model="exportTable" class="select select-sm" style="width:auto">
          <option value="orders">Orders</option><option value="expenses">Expenses</option><option value="inventory">Inventory</option>
          <option value="staff">Staff</option><option value="menu">Menu</option><option value="reservations">Reservations</option>
        </select>
        <button class="btn btn-primary" @click="exportCSV">Download CSV</button>
        <label style="font-size:.78rem;color:var(--text-muted)">or</label>
        <input v-model="receiptId" placeholder="Order ID for receipt" class="input input-sm" style="width:160px" />
        <button class="btn btn-secondary" @click="exportReceipt">Get Receipt</button>
      </div>
    </div>

    <div class="chart-grid">
      <div class="chart-card"><h3>Revenue vs Expenses (30 days)</h3><canvas ref="reportChart"></canvas></div>
      <div class="chart-card"><h3>Orders by Status</h3><canvas ref="statusChart"></canvas></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, inject } from 'vue'
import { apiGet, apiPost } from '../api'
let _Chart = null
async function _loadChart() {
  if (!_Chart) {
    const { Chart, registerables } = await import('chart.js')
    Chart.register(...registerables)
    _Chart = Chart
  }
  return _Chart
}

const toast = inject('toast')
const reportChart = ref(null)
const statusChart = ref(null)
const totalRev = ref(0)
const totalExp = ref(0)
const staffCount = ref(0)
const exportTable = ref('orders')
const receiptId = ref('')
let charts = {}

onMounted(loadData)

async function loadData() {
  try {
    const [orders, expenses, staff] = await Promise.all([apiGet('orders'), apiGet('expenses'), apiGet('staff')])
    totalRev.value = orders.reduce((s, o) => s + parseFloat(o.total||0), 0)
    totalExp.value = expenses.reduce((s, e) => s + parseFloat(e.amount||0), 0)
    staffCount.value = staff.length
    await nextTick()
    await buildCharts(orders, expenses)
  } catch (e) { console.error(e) }
}

async function buildCharts(orders, expenses) {
  const Chart = await _loadChart()
  Object.values(charts).forEach(c => c.destroy())
  charts = {}

  const days = []; const rev = []; const exp = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const ds = d.toISOString().slice(0, 10)
    days.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }))
    rev.push(orders.filter(o => o.created?.slice(0,10) === ds).reduce((s, o) => s + parseFloat(o.total||0), 0))
    exp.push(expenses.filter(e => e.date === ds).reduce((s, e) => s + parseFloat(e.amount||0), 0))
  }

  if (reportChart.value) {
    charts.report = new Chart(reportChart.value, {
      type: 'line',
      data: { labels: days, datasets: [
        { label: 'Revenue', data: rev, borderColor: '#0F7B78', tension: .4, fill: false },
        { label: 'Expenses', data: exp, borderColor: '#D97706', tension: .4, fill: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    })
  }

  const statusCounts = {}; orders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status]||0) + 1 })
  if (statusChart.value) {
    charts.status = new Chart(statusChart.value, {
      type: 'doughnut',
      data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#EFF6FF','#FFFBEB','#EEF2FF','#F0FDF4','#FEF2F2'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
    })
  }
}

async function exportCSV() {
  try {
    const res = await apiPost('export/csv', { table: exportTable.value })
    if (res.csv) { const b = new Blob([res.csv], {type:'text/csv'}); const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download=exportTable.value+'.csv'; a.click(); toast('CSV exported') }
  } catch (e) { toast('Export failed', 'error') }
}

async function exportReceipt() {
  if (!receiptId.value) return toast('Enter an order ID', 'error')
  try {
    const res = await apiPost('export/receipt', { id: receiptId.value })
    if (res.html) { const w = window.open(); w.document.write(res.html) }
  } catch (e) { toast('Receipt failed', 'error') }
}
</script>
