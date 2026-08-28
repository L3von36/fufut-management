<template>
  <div>
    <div class="table-toolbar"><h3>Reports & Analytics</h3></div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
      <div class="card">
        <div class="card-header"><h3>Today's Summary</h3></div>
        <div v-if="todaySummary.length">
          <div v-for="s in todaySummary" :key="s.label" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem">
            <span>{{ s.label }}</span><span style="font-weight:600;font-family:var(--font-mono)">{{ s.value }}</span>
          </div>
        </div>
        <div v-else class="empty-state" style="padding:24px"><div>No orders today</div></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>This Month</h3></div>
        <div v-if="monthSummary.length">
          <div v-for="s in monthSummary" :key="s.label" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem">
            <span>{{ s.label }}</span><span style="font-weight:600;font-family:var(--font-mono)">{{ s.value }}</span>
          </div>
        </div>
        <div v-else class="empty-state" style="padding:24px"><div>No data yet</div></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Top Products</h3></div>
        <div v-if="topProducts.length">
          <div v-for="(p,i) in topProducts.slice(0,5)" :key="i" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:.82rem">
            <span>{{ i+1 }}. {{ p.name }}</span><span style="font-weight:600">{{ p.count }}×</span>
          </div>
        </div>
        <div v-else class="empty-state" style="padding:24px"><div>No data</div></div>
      </div>

      <div class="card rt-timing">
        <div class="card-header rt-timing-header">
          <h3>Time to Table</h3>
          <div class="rt-range">
            <button
              v-for="r in RANGES"
              :key="r.days"
              class="btn btn-sm"
              :class="rangeDays === r.days ? 'btn-primary' : 'btn-outline'"
              @click="setRange(r.days)"
            >{{ r.label }}</button>
          </div>
        </div>

        <div v-if="timingLoading" class="empty-state" style="padding:24px"><div>Loading…</div></div>

        <template v-else-if="timingRows.length">
          <p class="rt-sample">
            Measured from {{ timingSampled }} served item{{ timingSampled === 1 ? '' : 's' }}, ordered slowest first.
          </p>
          <div class="rt-rows">
            <div v-for="row in timingRows" :key="row.category" class="rt-row">
              <div class="rt-row-head">
                <span class="rt-cat">{{ row.category }}</span>
                <span class="rt-avg">{{ row.averageMinutes }} min</span>
              </div>
              <div class="rt-bar"><div class="rt-bar-fill" :style="{ width: barWidth(row) }"></div></div>
              <div class="rt-row-foot">
                <span>{{ row.served }} served</span>
                <span>fastest {{ row.fastestMinutes }} min · slowest {{ row.slowestMinutes }} min</span>
              </div>
            </div>
          </div>
        </template>

        <div v-else class="empty-state" style="padding:24px">
          <div>No items have been marked served in this period.</div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-top:6px">
            Timings appear once the kitchen marks items ready and served on the Kitchen screen.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Export Reports</h3></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-sm btn-primary" @click="exportPDF('summary')">Export Today Summary (PDF)</button>
          <button class="btn btn-sm btn-outline" @click="exportCSV('today')">Today's Orders (CSV)</button>
          <button class="btn btn-sm btn-outline" @click="exportCSV('month')">This Month (CSV)</button>
          <button v-if="auth.roleKey === 'manager'" class="btn btn-sm btn-outline" @click="exportJSON">All Data (JSON)</button>
        </div>
      </div>
    </div>

    <!-- Staff Performance & Hourly Distribution -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <h3>Staff Performance</h3>
          <button class="btn btn-sm btn-ghost" @click="fetchStaffPerf">Refresh</button>
        </div>
        <div v-if="staffPerf.length">
          <div v-for="sp in staffPerf" :key="sp.name" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem">
            <div>
              <strong>{{ sp.name }}</strong>
              <div style="font-size:.72rem;color:var(--text-muted)">{{ sp.ordersCount }} orders · Avg ETB {{ sp.averageOrder }}</div>
            </div>
            <div style="text-align:right;font-weight:700">ETB {{ sp.totalSales }}</div>
          </div>
        </div>
        <div v-else class="empty-state" style="padding:24px"><div>No staff sales logged today</div></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Hourly Activity Distribution</h3></div>
        <div v-if="hourlyData.length" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding-top:8px">
          <div v-for="h in hourlyData" :key="h.hour" style="text-align:center;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:4px">
            <div style="font-size:.68rem;color:var(--text-muted)">{{ h.hour }}:00</div>
            <div style="font-size:.85rem;font-weight:700">{{ h.orders }}</div>
          </div>
        </div>
        <div v-else-if="hourlyLoaded" class="empty-state" style="padding:24px"><div>No hourly activity in this period.</div></div>
        <div v-else class="empty-state" style="padding:24px"><div>Loading hourly data…</div></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, TODAY } from '../api'
import { isRealOrder } from '../lib/formatters'
import { useAuthStore } from '../stores/auth'
import { printReport } from '../lib/print'

const toast = inject('toast')
const auth = useAuthStore()

const orders = ref([])
const expenses = ref([])

// Voided and cancelled orders are history, not revenue — see isRealOrder.
const todayData = computed(() => orders.value.filter(o => isRealOrder(o) && (o.created||'').slice(0,10) === TODAY()))
const monthData = computed(() => orders.value.filter(o => isRealOrder(o) && (o.created||'').slice(0,7) === TODAY().slice(0,7)))
const todayExp = computed(() => expenses.value.filter(e => e.date === TODAY()))
const monthExp = computed(() => expenses.value.filter(e => (e.date||'').slice(0,7) === TODAY().slice(0,7)))

// Revenue is food money, not tips: the same day's figures must match the
// dashboard's "Today Sales (excludes tips)" and the server's NET_SALES
// (total - tip). Summing raw totals here made a 20.5-birr tip day read
// ETB 1066 on Reports against ETB 1045 everywhere else.
const netOf = (list) => list.reduce((s,o) => s + parseFloat(o.total||0) - parseFloat(o.tip||0), 0)

const todaySummary = computed(() => {
  if (!todayData.value.length) return []
  const rev = netOf(todayData.value)
  const exp = todayExp.value.reduce((s,e) => s + parseFloat(e.amount||0), 0)
  return [
    { label:'Orders', value:todayData.value.length },
    { label:'Revenue', value:`ETB ${rev.toFixed(0)}` },
    { label:'Expenses', value:`ETB ${exp.toFixed(0)}` },
    { label:'Net', value:`ETB ${(rev-exp).toFixed(0)}` }
  ]
})

const monthSummary = computed(() => {
  if (!monthData.value.length) return []
  const rev = netOf(monthData.value)
  const exp = monthExp.value.reduce((s,e) => s + parseFloat(e.amount||0), 0)
  return [
    { label:'Orders', value:monthData.value.length },
    { label:'Revenue', value:`ETB ${rev.toFixed(0)}` },
    { label:'Expenses', value:`ETB ${exp.toFixed(0)}` },
    { label:'Net', value:`ETB ${(rev-exp).toFixed(0)}` }
  ]
})

const topProducts = computed(() => {
  const counts = {}
  // Top products is a sales ranking: a voided order's items were not sold.
  for (const o of orders.value.filter(isRealOrder)) {
    let items = []
    const structured = o.order_items || o.orderItems
    if (Array.isArray(structured) && structured.length) {
      items = structured.map(i => ({ name: i.name || 'Item', qty: i.qty || 1 }))
    } else if (o.items && typeof o.items === 'string' && (o.items.trim().startsWith('[') || o.items.trim().startsWith('{'))) {
      try {
        const parsed = JSON.parse(o.items.trim())
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        items = arr.map(i => typeof i === 'string' ? { name: i, qty: 1 } : { name: i.name || 'Item', qty: i.qty || 1 })
      } catch {}
    } else if (o.items && typeof o.items === 'string') {
      const parts = o.items.split(/,(?=\s*\d+x)/i)
      for (const part of parts) {
        const m = part.trim().match(/^(\d+)x\s*(.+)/i)
        const name = m ? m[2].trim().split('[')[0].split('(')[0].trim() : part.trim().replace(/^\d+×/, '')
        if (name) items.push({ name, qty: m ? parseInt(m[1]) : 1 })
      }
    }
    for (const { name, qty } of items) {
      if (name) counts[name] = (counts[name] || 0) + (qty || 1)
    }
  }
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)
})

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' }
]
const rangeDays = ref(1)
const timingRows = ref([])
const timingSampled = ref(0)
const timingLoading = ref(true)
const staffPerf = ref([])
const hourlyData = ref([])
const hourlyLoaded = ref(false)

function rangeStartIso(days) {
  const d = new Date()
  if (days <= 1) {
    d.setHours(0, 0, 0, 0)
  } else {
    d.setDate(d.getDate() - days)
  }
  return d.toISOString()
}

async function loadTiming() {
  timingLoading.value = true
  try {
    const res = await apiGet(`orders/timing?from=${encodeURIComponent(rangeStartIso(rangeDays.value))}`)
    timingRows.value = res.categories || []
    timingSampled.value = res.sampled || 0
  } catch (e) {
    console.error(e)
    timingRows.value = []
    timingSampled.value = 0
  } finally {
    timingLoading.value = false
  }
}

function setRange(days) {
  rangeDays.value = days
  loadTiming()
}

function barWidth(row) {
  const max = timingRows.value.reduce((m, r) => Math.max(m, r.averageMinutes), 0)
  if (!max) return '0%'
  return `${Math.max(4, Math.round((row.averageMinutes / max) * 100))}%`
}

async function fetchStaffPerf() {
  try {
    const res = await apiGet('reports/staff-performance')
    staffPerf.value = res.staff || []
  } catch { staffPerf.value = [] }
}

async function fetchHourly() {
  try {
    const res = await apiGet('reports/hourly-heatmap')
    hourlyData.value = (res.hours || []).filter(h => h.orders > 0)
  } catch { hourlyData.value = [] }
  hourlyLoaded.value = true
}

function exportPDF(type) {
  if (type === 'summary') {
    const headers = ['Metric', 'Value']
    const rows = todaySummary.value.map(s => [s.label, String(s.value)])
    const ok = printReport({ title: `Today Summary Report (${TODAY()})`, headers, rows, paper: 'a4' })
    if (!ok) toast('Allow pop-ups to print PDF', 'error')
    else toast('PDF print preview opened', 'info')
  }
}

function toCSV(data, fn) {
  if (!data.length) return
  const h = Object.keys(data[0])
  const r = data.map(x => h.map(k => `"${(x[k]||'').toString().replace(/"/g,'""')}"`).join(','))
  const csv = [h.join(','), ...r].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = fn
  a.click()
}

function exportCSV(p) {
  const d = p === 'today' ? todayData.value : monthData.value
  toCSV(d.map(o => ({ ID: o.id, Items: o.items, Total: o.total, Status: o.status, Date: (o.created||'').slice(0,10) })), `${p}-orders.csv`)
  toast('CSV exported')
}

function exportJSON() {
  const data = { orders: orders.value, expenses: expenses.value, exported: new Date().toISOString(), report: 'FU FUT COFFEE Report' }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  a.download = `fufut-report-${TODAY()}.json`
  a.click()
  toast('JSON exported')
}

onMounted(async () => {
  loadTiming()
  fetchStaffPerf()
  fetchHourly()
  try {
    const [o, e] = await Promise.all([apiGet('orders'), apiGet('expenses')])
    orders.value = o
    expenses.value = e
  } catch (e) {
    console.error(e)
  }
})
</script>

<style scoped>
.rt-timing { grid-column: 1 / -1; }
.rt-timing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.rt-range { display: flex; gap: 6px; }
.rt-sample { font-size: .82rem; color: var(--text-muted); margin-bottom: 12px; }
.rt-rows { display: flex; flex-direction: column; gap: 12px; }
.rt-row-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.rt-cat { font-size: .88rem; font-weight: 600; color: var(--text-heading); }
.rt-avg { font-size: .95rem; font-weight: 700; font-family: var(--font-mono); color: var(--text-heading); }
.rt-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--neutral-100);
  overflow: hidden;
  margin: 4px 0 3px;
}
.rt-bar-fill { height: 100%; border-radius: 3px; background: var(--primary); }
.rt-row-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: .78rem;
  color: var(--text-muted);
}
</style>
