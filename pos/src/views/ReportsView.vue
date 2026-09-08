<template>
  <div>
    <div class="table-toolbar"><h3>Reports & Analytics</h3></div>

    <!-- ─── Summary cards (existing) ──────────────────────────────────────── -->
    <div class="reports-cards-row">
      <div class="card">
        <div class="card-header"><h3>Today's Summary</h3></div>
        <div v-if="todaySummary.length">
          <div v-for="s in todaySummary" :key="s.label" class="summary-row">
            <span>{{ s.label }}</span><span class="summary-val">{{ s.value }}</span>
          </div>
        </div>
        <div v-else class="empty-state" style="padding:24px"><div>No orders today</div></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>This Month</h3></div>
        <div v-if="monthSummary.length">
          <div v-for="s in monthSummary" :key="s.label" class="summary-row">
            <span>{{ s.label }}</span><span class="summary-val">{{ s.value }}</span>
          </div>
        </div>
        <div v-else class="empty-state" style="padding:24px"><div>No data yet</div></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Top Products</h3></div>
        <div v-if="topProducts.length">
          <div v-for="(p,i) in topProducts.slice(0,5)" :key="i" class="summary-row">
            <span>{{ i+1 }}. {{ p.name }}</span><span class="summary-val">{{ p.count }}×</span>
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
          <p class="rt-sample">Measured from {{ timingSampled }} served item{{ timingSampled === 1 ? '' : 's' }}, ordered slowest first.</p>
          <div class="rt-rows">
            <div v-for="row in timingRows" :key="row.category" class="rt-row">
              <div class="rt-row-head"><span class="rt-cat">{{ row.category }}</span><span class="rt-avg">{{ row.averageMinutes }} min</span></div>
              <div class="rt-bar"><div class="rt-bar-fill" :style="{ width: barWidth(row) }"></div></div>
              <div class="rt-row-foot"><span>{{ row.served }} served</span><span>fastest {{ row.fastestMinutes }} min · slowest {{ row.slowestMinutes }} min</span></div>
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

    <!-- ─── ECharts row 1: Revenue vs Expenses + Orders by Status ─────────── -->
    <div class="echart-grid">
      <div class="card chart-card">
        <h3>📈 Revenue vs Expenses (30 days)</h3>
        <div ref="revExpChart" class="echart-box"></div>
      </div>
      <div class="card chart-card">
        <h3>🥧 Orders by Status</h3>
        <div ref="statusChart" class="echart-box"></div>
      </div>
    </div>

    <!-- ─── ECharts row 2: Payment Method Mix + Hourly Heatmap ────────────── -->
    <div class="echart-grid">
      <div class="card chart-card">
        <h3>💳 Payment Method Mix (30 days)</h3>
        <div ref="payChart" class="echart-box"></div>
      </div>
      <div class="card chart-card">
        <h3>🕐 Hourly Order Heatmap (30 days)</h3>
        <div ref="hourChart" class="echart-box"></div>
      </div>
    </div>

    <!-- ─── ECharts row 3: The 3 specific charts you requested ────────────── -->
    <!-- 1. Stacked bar: Revenue by Order Type (dine-in / takeout / delivery)   -->
    <!--    over the last 14 days — each day's bar is split by order type so     -->
    <!--    the manager sees which channel drives revenue.                       -->
    <div class="echart-grid">
      <div class="card chart-card">
        <h3>📊 Revenue by Order Type (14 days)</h3>
        <div ref="orderTypeChart" class="echart-box"></div>
      </div>
      <!-- 2. Sparkline: Daily Revenue Trend (14 days) — a compact inline-style -->
      <!--    chart that shows the trend at a glance without taking much space.  -->
      <div class="card chart-card">
        <h3>✨ Daily Revenue Trend (14 days)</h3>
        <div ref="sparkChart" class="echart-box"></div>
      </div>
    </div>

    <!-- 3. Heatmap: Orders by Day-of-Week × Hour (30 days) — a 7×24 grid     -->
    <!--    where each cell's color intensity = order count. The manager sees  -->
    <!--    rush patterns at a glance: dark cells = peak, light = quiet.       -->
    <div class="card chart-card" style="margin-top:16px">
      <h3>🔥 Orders by Day × Hour (30 days)</h3>
      <div ref="heatmapChart" class="echart-box" style="height:280px"></div>
    </div>

    <!-- ─── Staff Performance + Hourly Distribution (existing, kept) ───────── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <h3>Staff Performance</h3>
          <button class="btn btn-sm btn-ghost" @click="fetchStaffPerf">Refresh</button>
        </div>
        <div v-if="staffPerf.length">
          <div v-for="sp in staffPerf" :key="sp.name" class="summary-row" style="padding:8px 0">
            <div><strong>{{ sp.name }}</strong><div style="font-size:.72rem;color:var(--text-muted)">{{ sp.ordersCount }} orders · Avg ETB {{ sp.averageOrder }}</div></div>
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
import { ref, computed, onMounted, onUnmounted, nextTick, inject } from 'vue'
import { apiGet, TODAY } from '../api'
import { isRealOrder } from '../lib/formatters'
import { useAuthStore } from '../stores/auth'
import { printReport } from '../lib/print'

// ─── ECharts (lazy-loaded) ────────────────────────────────────────────────
let _echarts = null
async function _loadEcharts() {
  if (!_echarts) _echarts = await import('echarts')
  return _echarts
}

// Brand palette — same as the backoffice reports page
const BRAND = {
  primary: '#0F7B78', primaryLight: '#18B4B7', gold: '#D6B36A', goldDark: '#D97706',
  danger: '#DC2626', success: '#16A34A', info: '#2563EB', warning: '#F59E0B', muted: '#94A3B8',
  pie: ['#0F7B78', '#18B4B7', '#D6B36A', '#E4CB99', '#2563EB', '#7C3AED', '#DC2626', '#16A34A', '#F59E0B'],
  // Order type colors — consistent across all charts
  orderTypes: { 'dine-in': '#0F7B78', 'takeout': '#D97706', 'delivery': '#2563EB' },
}

const toast = inject('toast')
const auth = useAuthStore()
const orders = ref([])
const expenses = ref([])

// Chart refs — one per ECharts canvas
const revExpChart = ref(null)
const statusChart = ref(null)
const payChart = ref(null)
const hourChart = ref(null)
const orderTypeChart = ref(null)
const sparkChart = ref(null)
const heatmapChart = ref(null)
let charts = {}

// ─── Existing computed properties (kept from original) ───────────────────
const todayData = computed(() => orders.value.filter(o => isRealOrder(o) && (o.created||'').slice(0,10) === TODAY()))
const monthData = computed(() => orders.value.filter(o => isRealOrder(o) && (o.created||'').slice(0,7) === TODAY().slice(0,7)))
const todayExp = computed(() => expenses.value.filter(e => e.date === TODAY()))
const monthExp = computed(() => expenses.value.filter(e => (e.date||'').slice(0,7) === TODAY().slice(0,7)))
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
    for (const { name, qty } of items) { if (name) counts[name] = (counts[name] || 0) + (qty || 1) }
  }
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)
})

// ─── Timing (existing) ───────────────────────────────────────────────────
const RANGES = [ { days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' } ]
const rangeDays = ref(1)
const timingRows = ref([])
const timingSampled = ref(0)
const timingLoading = ref(true)
const staffPerf = ref([])
const hourlyData = ref([])
const hourlyLoaded = ref(false)

function rangeStartIso(days) {
  const d = new Date()
  if (days <= 1) d.setHours(0, 0, 0, 0)
  else d.setDate(d.getDate() - days)
  return d.toISOString()
}

async function loadTiming() {
  timingLoading.value = true
  try {
    const res = await apiGet(`orders/timing?from=${encodeURIComponent(rangeStartIso(rangeDays.value))}`)
    timingRows.value = res.categories || []
    timingSampled.value = res.sampled || 0
  } catch (e) { timingRows.value = []; timingSampled.value = 0 }
  finally { timingLoading.value = false }
}

function setRange(days) { rangeDays.value = days; loadTiming() }
function barWidth(row) {
  const max = timingRows.value.reduce((m, r) => Math.max(m, r.averageMinutes), 0)
  if (!max) return '0%'
  return `${Math.max(4, Math.round((row.averageMinutes / max) * 100))}%`
}

async function fetchStaffPerf() {
  try { const res = await apiGet('reports/staff-performance'); staffPerf.value = res.staff || [] }
  catch { staffPerf.value = [] }
}

async function fetchHourly() {
  try { const res = await apiGet('reports/hourly-heatmap'); hourlyData.value = (res.hours || []).filter(h => h.orders > 0) }
  catch { hourlyData.value = [] }
  hourlyLoaded.value = true
}

// ─── ECharts builders ─────────────────────────────────────────────────────
async function buildCharts() {
  const echarts = await _loadEcharts()
  Object.values(charts).forEach(c => c && c.dispose && c.dispose())
  charts = {}

  const realOrders = orders.value.filter(isRealOrder)

  // ── 1. Revenue vs Expenses (30 days) ────────────────────────────────────
  const days30 = [], rev30 = [], exp30 = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const ds = d.toISOString().slice(0, 10)
    days30.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }))
    rev30.push(Math.round(realOrders.filter(o => (o.created||'').slice(0,10) === ds).reduce((s, o) => s + parseFloat(o.total||0), 0)))
    exp30.push(Math.round(expenses.value.filter(e => e.date === ds).reduce((s, e) => s + parseFloat(e.amount||0), 0)))
  }
  if (revExpChart.value) {
    charts.revExp = echarts.init(revExpChart.value)
    charts.revExp.setOption({
      animation: true, animationDuration: 800, animationEasing: 'cubicOut',
      grid: { left: 50, right: 16, top: 30, bottom: 50 },
      legend: { data: ['Revenue', 'Expenses'], bottom: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 12, color: '#475569' } },
      tooltip: {
        trigger: 'axis', backgroundColor: 'rgba(15,23,42,.92)', borderWidth: 0, textStyle: { color: '#F8FAFC', fontSize: 12 },
        axisPointer: { type: 'line', lineStyle: { color: '#CBD5E1', type: 'dashed' } },
        formatter: (params) => params.map(p => `<div style="display:flex;justify-content:space-between;gap:14px"><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>${p.seriesName}</span><strong>ETB ${p.value.toLocaleString()}</strong></div>`).join(''),
      },
      xAxis: { type: 'category', data: days30, boundaryGap: false, axisLine: { lineStyle: { color: '#CBD5E1' } }, axisTick: { show: false }, axisLabel: { color: '#64748B', fontSize: 11, interval: 4 } },
      yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } }, axisLabel: { color: '#64748B', fontSize: 11, formatter: (v) => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
      series: [
        { name: 'Revenue', type: 'line', smooth: true, showSymbol: false, data: rev30, lineStyle: { width: 3, color: BRAND.primary }, itemStyle: { color: BRAND.primary },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(15,123,120,0.45)' }, { offset: 1, color: 'rgba(15,123,120,0.02)' }]) } },
        { name: 'Expenses', type: 'line', smooth: true, showSymbol: false, data: exp30, lineStyle: { width: 3, color: BRAND.goldDark }, itemStyle: { color: BRAND.goldDark },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(217,119,6,0.35)' }, { offset: 1, color: 'rgba(217,119,6,0.02)' }]) } },
      ],
    })
  }

  // ── 2. Orders by Status (rose doughnut) ─────────────────────────────────
  const statusCounts = {}
  realOrders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status]||0) + 1 })
  if (statusChart.value) {
    charts.status = echarts.init(statusChart.value)
    charts.status.setOption({
      animation: true, animationDuration: 900, animationEasing: 'cubicOut',
      legend: { orient: 'vertical', right: 10, top: 'center', icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 12, color: '#475569' } },
      tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,.92)', borderWidth: 0, textStyle: { color: '#F8FAFC', fontSize: 12 },
        formatter: (p) => `<div style="font-weight:600">${p.name}</div><div>${p.value} order${p.value === 1 ? '' : 's'} · <strong>${p.percent}%</strong></div>` },
      series: [{
        type: 'pie', radius: ['38%', '70%'], center: ['38%', '50%'], roseType: 'radius',
        data: Object.entries(statusCounts).map(([name, value], i) => ({ name, value, itemStyle: { color: BRAND.pie[i % BRAND.pie.length] } })),
        label: { show: false }, labelLine: { show: false },
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        emphasis: { scale: true, scaleSize: 8, itemStyle: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.18)' } },
      }],
    })
  }

  // ── 3. Payment Method Mix (horizontal bar) ──────────────────────────────
  if (payChart.value) {
    const pays = await apiGet('payments').catch(() => [])
    const payList = Array.isArray(pays) ? pays : (pays?.payments || [])
    const iso30 = new Date(); iso30.setDate(iso30.getDate() - 29)
    const recentPays = payList.filter(p => (p.created_at || p.created || '').slice(0, 10) >= iso30.toISOString().slice(0,10) && p.status !== 'rejected' && Number(p.amount) > 0)
    const byMethod = {}
    for (const p of recentPays) byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount)
    const methodLabels = Object.keys(byMethod).sort((a, b) => byMethod[b] - byMethod[a])
    const methodValues = methodLabels.map(m => Math.round(byMethod[m]))
    charts.pay = echarts.init(payChart.value)
    charts.pay.setOption({
      animation: true, animationDuration: 700, animationEasing: 'cubicOut',
      grid: { left: 80, right: 50, top: 20, bottom: 20 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(15,23,42,.92)', borderWidth: 0, textStyle: { color: '#F8FAFC', fontSize: 12 },
        formatter: (params) => `<div style="font-weight:600;text-transform:capitalize">${params[0].name}</div><div>ETB ${params[0].value.toLocaleString()}</div>` },
      xAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } }, axisLabel: { color: '#64748B', fontSize: 11, formatter: (v) => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
      yAxis: { type: 'category', data: methodLabels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 12, formatter: (v) => v.charAt(0).toUpperCase() + v.slice(1) } },
      series: [{
        type: 'bar', barWidth: '60%',
        data: methodValues.map((v, i) => ({ value: v, itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: BRAND.pie[i % BRAND.pie.length] }, { offset: 1, color: BRAND.pie[i % BRAND.pie.length] + 'CC' }]), borderRadius: [0, 6, 6, 0] } })),
        label: { show: true, position: 'right', color: '#475569', fontSize: 11, formatter: (p) => 'ETB ' + p.value.toLocaleString() },
      }],
    })
  }

  // ── 4. Hourly heatmap (30 days) — bar chart with intensity color ─────────
  const hourCount = new Array(24).fill(0)
  const iso30 = new Date(); iso30.setDate(iso30.getDate() - 29)
  const iso30Str = iso30.toISOString().slice(0, 10)
  for (const o of realOrders) {
    if ((o.created||'').slice(0, 10) >= iso30Str) {
      const h = new Date(o.created).getHours()
      if (h >= 0 && h < 24) hourCount[h]++
    }
  }
  const maxHour = Math.max(...hourCount, 1)
  if (hourChart.value) {
    charts.hour = echarts.init(hourChart.value)
    charts.hour.setOption({
      animation: true, animationDuration: 800, animationEasing: 'cubicOut',
      grid: { left: 40, right: 16, top: 20, bottom: 40 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(15,23,42,.92)', borderWidth: 0, textStyle: { color: '#F8FAFC', fontSize: 12 },
        formatter: (params) => `<div style="font-weight:600">${params[0].name}:00 – ${params[0].name}:59</div><div>${params[0].value} order${params[0].value === 1 ? '' : 's'}</div>` },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, h) => String(h)), axisLine: { lineStyle: { color: '#CBD5E1' } }, axisTick: { show: false }, axisLabel: { color: '#64748B', fontSize: 10, interval: 2 } },
      yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } }, axisLabel: { color: '#64748B', fontSize: 11 } },
      series: [{
        type: 'bar', barWidth: '70%',
        data: hourCount.map((v) => {
          const intensity = v / maxHour
          return { value: v, itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: `rgba(15,123,120,${0.85 * intensity + 0.15})` }, { offset: 1, color: `rgba(24,180,183,${0.35 * intensity + 0.05})` }]), borderRadius: [4, 4, 0, 0] } }
        }),
      }],
    })
  }

  // ── 5. NEW: Stacked bar — Revenue by Order Type (14 days) ───────────────
  // Each day's bar is split into 3 segments: dine-in (teal), takeout (gold),
  // delivery (blue). The manager sees which channel drives which days.
  const days14 = [], dineIn14 = [], takeout14 = [], delivery14 = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const ds = d.toISOString().slice(0, 10)
    days14.push(d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' }))
    dineIn14.push(Math.round(realOrders.filter(o => (o.created||'').slice(0,10) === ds && (o.type === 'dine-in' || !o.type)).reduce((s, o) => s + parseFloat(o.total||0), 0)))
    takeout14.push(Math.round(realOrders.filter(o => (o.created||'').slice(0,10) === ds && (o.type === 'takeout' || o.type === 'takeaway')).reduce((s, o) => s + parseFloat(o.total||0), 0)))
    delivery14.push(Math.round(realOrders.filter(o => (o.created||'').slice(0,10) === ds && o.type === 'delivery').reduce((s, o) => s + parseFloat(o.total||0), 0)))
  }
  if (orderTypeChart.value) {
    charts.orderType = echarts.init(orderTypeChart.value)
    charts.orderType.setOption({
      animation: true, animationDuration: 700, animationEasing: 'cubicOut',
      grid: { left: 50, right: 16, top: 40, bottom: 50 },
      legend: { bottom: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 12, color: '#475569' } },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(15,23,42,.92)', borderWidth: 0, textStyle: { color: '#F8FAFC', fontSize: 12 },
        formatter: (params) => {
          const total = params.reduce((s, p) => s + p.value, 0)
          const lines = params.map(p => `<div style="display:flex;justify-content:space-between;gap:14px"><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${p.color}"></span>${p.seriesName}</span><strong>ETB ${p.value.toLocaleString()}</strong></div>`)
          return `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValueLabel}</div>${lines.join('')}<div style="border-top:1px solid rgba(255,255,255,.2);margin-top:4px;padding-top:4px;display:flex;justify-content:space-between"><span>Total</span><strong>ETB ${total.toLocaleString()}</strong></div>`
        },
      },
      xAxis: { type: 'category', data: days14, axisLine: { lineStyle: { color: '#CBD5E1' } }, axisTick: { show: false }, axisLabel: { color: '#64748B', fontSize: 10, rotate: 30 } },
      yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } }, axisLabel: { color: '#64748B', fontSize: 11, formatter: (v) => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } },
      series: [
        { name: 'Dine-in', type: 'bar', stack: 'total', data: dineIn14, itemStyle: { color: BRAND.orderTypes['dine-in'], borderRadius: [0, 0, 0, 0] }, barWidth: '50%' },
        { name: 'Takeout', type: 'bar', stack: 'total', data: takeout14, itemStyle: { color: BRAND.orderTypes['takeout'], borderRadius: [0, 0, 0, 0] }, barWidth: '50%' },
        { name: 'Delivery', type: 'bar', stack: 'total', data: delivery14, itemStyle: { color: BRAND.orderTypes['delivery'], borderRadius: [4, 4, 0, 0] }, barWidth: '50%' },
      ],
    })
  }

  // ── 6. NEW: Sparkline — Daily Revenue Trend (14 days) ────────────────────
  // A compact line chart with no axes — the trend at a glance. Uses
  // ECharts' minimalist mode: no grid, no axis labels, just the line +
  // gradient area + a tooltip on hover.
  const sparkData = rev30.slice(-14)  // last 14 days of revenue
  const sparkLabels = days30.slice(-14)
  if (sparkChart.value) {
    charts.spark = echarts.init(sparkChart.value)
    charts.spark.setOption({
      animation: true, animationDuration: 1000, animationEasing: 'cubicOut',
      grid: { left: 0, right: 0, top: 10, bottom: 0 },
      xAxis: { type: 'category', show: false, data: sparkLabels, boundaryGap: false },
      yAxis: { type: 'value', show: false },
      tooltip: {
        trigger: 'axis', backgroundColor: 'rgba(15,23,42,.92)', borderWidth: 0, textStyle: { color: '#F8FAFC', fontSize: 12 },
        formatter: (params) => `<div style="font-weight:600">${params[0].axisValueLabel}</div><div>ETB ${params[0].value.toLocaleString()}</div>`,
        axisPointer: { type: 'line', lineStyle: { color: '#CBD5E1', type: 'dashed' } },
      },
      series: [{
        type: 'line', smooth: true, showSymbol: false, data: sparkData,
        lineStyle: { width: 2, color: BRAND.primary },
        itemStyle: { color: BRAND.primary },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(15,123,120,0.4)' },
            { offset: 1, color: 'rgba(15,123,120,0.02)' },
          ]),
        },
        emphasis: { scale: true, scaleSize: 6, focus: 'series' },
        markPoint: {
          symbol: 'pin', symbolSize: 40,
          data: [
            { type: 'max', name: 'Peak', itemStyle: { color: BRAND.success }, label: { formatter: (p) => 'ETB ' + p.value.toLocaleString(), fontSize: 9, color: '#fff' } },
          ],
        },
        markLine: {
          silent: true, symbol: 'none',
          data: [{ type: 'average', name: 'Avg', lineStyle: { color: BRAND.muted, type: 'dashed', width: 1 }, label: { formatter: (p) => 'Avg ETB ' + Math.round(p.value).toLocaleString(), color: BRAND.muted, fontSize: 9, position: 'middle' } }],
        },
      }],
    })
  }

  // ── 7. NEW: Heatmap — Orders by Day-of-Week × Hour (30 days) ────────────
  // A 7×24 grid where each cell's color intensity = order count.
  // X-axis: hours 0-23, Y-axis: days of the week (Mon–Sun).
  // Dark teal = peak, light = quiet. The manager sees the rush pattern
  // at a glance (e.g. "Saturday 12:00-14:00 is our busiest slot").
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const heatData = []
  const heatMax = { v: 0 }
  for (const o of realOrders) {
    if ((o.created||'').slice(0, 10) >= iso30Str) {
      const d = new Date(o.created)
      // JS getDay(): 0=Sun, 1=Mon, ... 6=Sat — convert to Mon=0..Sun=6
      const dayIdx = (d.getDay() + 6) % 7
      const hour = d.getHours()
      // Find existing cell or create
      let cell = heatData.find(c => c.value[0] === dayIdx && c.value[1] === hour)
      if (!cell) { cell = { value: [dayIdx, hour, 0] }; heatData.push(cell) }
      cell.value[2]++
      if (cell.value[2] > heatMax.v) heatMax.v = cell.value[2]
    }
  }
  if (heatmapChart.value) {
    charts.heatmap = echarts.init(heatmapChart.value)
    charts.heatmap.setOption({
      animation: true, animationDuration: 600,
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,.92)', borderWidth: 0, textStyle: { color: '#F8FAFC', fontSize: 12 },
        formatter: (p) => `<div style="font-weight:600">${dayNames[p.value[0]]} ${String(p.value[1]).padStart(2,'0')}:00</div><div>${p.value[2]} order${p.value[2] === 1 ? '' : 's'}</div>`,
      },
      xAxis: {
        type: 'category', data: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
        axisLine: { lineStyle: { color: '#CBD5E1' } }, axisTick: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10, interval: 1 },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category', data: dayNames,
        axisLine: { lineStyle: { color: '#CBD5E1' } }, axisTick: { show: false },
        axisLabel: { color: '#475569', fontSize: 11 },
        splitArea: { show: false },
      },
      visualMap: {
        min: 0, max: Math.max(heatMax.v, 1), calculable: false, orient: 'horizontal',
        left: 'center', bottom: 0, itemWidth: 14, itemHeight: 100,
        textStyle: { color: '#64748B', fontSize: 10 },
        inRange: { color: ['#F0FDFA', '#99F6E4', '#5EEAD4', '#14B8A6', '#0F7B78', '#0D5F5C'] },
      },
      series: [{
        type: 'heatmap', data: heatData,
        itemStyle: { borderRadius: 3, borderColor: '#fff', borderWidth: 1 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.15)' } },
        label: { show: false },
      }],
    })
  }

  // Resize handler
  if (!window.__echartsResize) {
    window.__echartsResize = () => Object.values(charts).forEach(c => c && c.resize && c.resize())
    window.addEventListener('resize', window.__echartsResize)
  }
}

onUnmounted(() => {
  Object.values(charts).forEach(c => c && c.dispose && c.dispose())
  charts = {}
  if (window.__echartsResize) {
    window.removeEventListener('resize', window.__echartsResize)
    delete window.__echartsResize
  }
})

// ─── Export functions (existing, kept) ───────────────────────────────────
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

// ─── onMounted: load data + build charts ─────────────────────────────────
onMounted(async () => {
  loadTiming()
  fetchStaffPerf()
  fetchHourly()
  try {
    const [o, e] = await Promise.all([apiGet('orders'), apiGet('expenses')])
    orders.value = o
    expenses.value = e
    await nextTick()
    await buildCharts()
  } catch (e) {
    console.error(e)
  }
})
</script>

<style scoped>
.reports-cards-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:16px}
.summary-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem}
.summary-val{font-weight:600;font-family:var(--font-mono)}

.rt-timing{grid-column:1/-1}
.rt-timing-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.rt-range{display:flex;gap:6px}
.rt-sample{font-size:.82rem;color:var(--text-muted);margin-bottom:12px}
.rt-rows{display:flex;flex-direction:column;gap:12px}
.rt-row-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.rt-cat{font-size:.88rem;font-weight:600;color:var(--text-heading)}
.rt-avg{font-size:.95rem;font-weight:700;font-family:var(--font-mono);color:var(--text-heading)}
.rt-bar{height:6px;border-radius:3px;background:var(--neutral-100);overflow:hidden;margin:4px 0 3px}
.rt-bar-fill{height:100%;border-radius:3px;background:var(--primary)}
.rt-row-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:.78rem;color:var(--text-muted)}

/* ECharts containers */
.echart-box{width:100%;height:320px}
.echart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:900px){.echart-grid{grid-template-columns:1fr}}
.chart-card{padding:16px}
.chart-card h3{font-size:.9rem;color:var(--text-heading);margin-bottom:12px}
</style>
