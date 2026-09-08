<template>
  <div>
    <div class="table-toolbar">
      <h3>Reports</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <base-button text="Export CSV" variant="btn-secondary" :on-click="exportCSV" loading-label="Exporting..." success-label="Exported ✓" />
        <base-button text="Generate Receipt" variant="btn-secondary" :on-click="exportReceipt" loading-label="Generating..." success-label="Generated ✓" />
        <base-button text="Refresh" variant="btn-primary" :on-click="loadData" loading-label="Refreshing..." success-label="Refreshed ✓" />
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
        <base-button text="Download CSV" variant="btn-primary" :on-click="exportCSV" loading-label="Downloading..." success-label="Downloaded ✓" />
        <label style="font-size:.78rem;color:var(--text-muted)">or</label>
        <input v-model="receiptId" placeholder="Order ID for receipt" class="input input-sm" style="width:160px" />
        <base-button text="Get Receipt" variant="btn-secondary" :on-click="exportReceipt" loading-label="Generating..." success-label="Generated ✓" />
      </div>
    </div>

    <!-- ─── ECharts report graphs ─────────────────────────────────────────── -->
    <!-- Replaced Chart.js with Apache ECharts (6.x). ECharts produces      -->
    <!-- dramatically richer visuals: gradient fills, smooth animations,     -->
    <!-- theme-aware tooltips, mobile-responsive, brush/zoom, and a polished -->
    <!-- look out of the box that does not need a designer to look right.    -->
    <!-- Each chart is mounted on its own div ref and re-rendered on every   -->
    <!-- refresh; the old charts are disposed first to avoid leaks.          -->
    <div class="chart-grid">
      <div class="chart-card">
        <h3>Revenue vs Expenses (30 days)</h3>
        <div ref="reportChart" class="echart-box" style="height:340px"></div>
      </div>
      <div class="chart-card">
        <h3>Orders by Status</h3>
        <div ref="statusChart" class="echart-box" style="height:340px"></div>
      </div>
    </div>

    <!-- New: payment-method mix + hourly heatmap, the two charts the       -->
    <!-- dashboard already has but the reports page was missing. Both use     -->
    <!-- ECharts so the visuals match the rest of the page.                  -->
    <div class="chart-grid" style="margin-top:16px">
      <div class="chart-card">
        <h3>Payment Method Mix (30 days)</h3>
        <div ref="payChart" class="echart-box" style="height:300px"></div>
      </div>
      <div class="chart-card">
        <h3>Hourly Order Heatmap (30 days)</h3>
        <div ref="hourChart" class="echart-box" style="height:300px"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, inject } from 'vue'
import { apiGet, apiPost, TODAY } from '../api'
import { isRealOrder } from '../lib/formatters'
import BaseButton from '../components/BaseButton.vue'
import { toCsv, download } from '../lib/csv'

// ─── ECharts (lazy-loaded, theme-aware) ──────────────────────────────────
// ECharts is a ~280kb library; we lazy-load it so the reports page doesn't
// pay the cost on first paint. The instance is cached per chart ref and
// disposed on unmount to avoid memory leaks.
let _echarts = null
async function _loadEcharts() {
  if (!_echarts) {
    _echarts = await import('echarts')
  }
  return _echarts
}

// Brand palette — matches the rest of the backoffice (teal + gold + neutrals).
// Used by every chart so the page reads as one design system, not a chart
// library demo.
const BRAND = {
  primary: '#0F7B78',     // teal
  primaryLight: '#18B4B7',
  gold: '#D6B36A',
  goldDark: '#D97706',
  danger: '#DC2626',
  success: '#16A34A',
  info: '#2563EB',
  warning: '#F59E0B',
  muted: '#94A3B8',
  // doughnut palette — soft, distinguishable, color-blind-friendly
  pie: ['#0F7B78', '#18B4B7', '#D6B36A', '#E4CB99', '#2563EB', '#7C3AED', '#DC2626', '#16A34A', '#F59E0B'],
}

const toast = inject('toast')
const reportChart = ref(null)
const statusChart = ref(null)
const payChart = ref(null)
const hourChart = ref(null)
const totalRev = ref(0)
const totalExp = ref(0)
const staffCount = ref(0)
const exportTable = ref('orders')
const receiptId = ref('')
let charts = {}

onMounted(loadData)
let resizeObserver = null
onUnmounted(() => {
  // Dispose every ECharts instance — the library attaches listeners and
  // canvas resize observers to the DOM; without this they leak across
  // route changes.
  Object.values(charts).forEach(c => c && c.dispose && c.dispose())
  charts = {}
  // Remove the window resize listener (the POS file does this; the backoffice
  // was missing it, so every route change leaked a stale listener).
  if (window.__echartsResize) {
    window.removeEventListener('resize', window.__echartsResize)
    delete window.__echartsResize
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

async function loadData() {
  try {
    const [orders, expenses, staff, pays] = await Promise.all([
      apiGet('orders'), apiGet('expenses'), apiGet('staff'),
      apiGet('payments').catch(() => []),
    ])
    // Voided and cancelled orders are audit history, not revenue —
    // isRealOrder mirrors the API's REAL_ORDERS rule in reports.js.
    totalRev.value = orders.filter(isRealOrder).reduce((s, o) => s + parseFloat(o.total||0), 0)
    totalExp.value = expenses.reduce((s, e) => s + parseFloat(e.amount||0), 0)
    staffCount.value = staff.length
    await nextTick()
    await buildCharts(orders, expenses, pays)
  } catch (e) { console.error(e) }
}

async function buildCharts(orders, expenses, pays) {
  const echarts = await _loadEcharts()
  // Dispose any existing instances before re-creating — ECharts refuses
  // to init on a DOM node that already has an instance attached.
  Object.values(charts).forEach(c => c && c.dispose && c.dispose())
  charts = {}

  // ── 1. Revenue vs Expenses (30 days) — smooth area line ───────────────
  // Two stacked area lines with gradient fills, smooth curves, rich
  // tooltips showing both series + the day, and a 30-day window.
  const days = []; const rev = []; const exp = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const ds = d.toISOString().slice(0, 10)
    days.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }))
    rev.push(Math.round(orders.filter(o => isRealOrder(o) && o.created?.slice(0,10) === ds).reduce((s, o) => s + parseFloat(o.total||0), 0)))
    exp.push(Math.round(expenses.filter(e => e.date === ds).reduce((s, e) => s + parseFloat(e.amount||0), 0)))
  }
  if (reportChart.value) {
    charts.report = echarts.init(reportChart.value)
    charts.report.setOption({
      animation: true,
      animationDuration: 800,
      animationEasing: 'cubicOut',
      grid: { left: 50, right: 16, top: 40, bottom: 50 },
      legend: {
        data: ['Revenue', 'Expenses'],
        bottom: 0,
        icon: 'roundRect',
        itemWidth: 14, itemHeight: 8,
        textStyle: { fontSize: 12, color: '#475569' },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15,23,42,.92)',
        borderWidth: 0, confine: true,
        textStyle: { color: '#F8FAFC', fontSize: 12 },
        axisPointer: { type: 'line', lineStyle: { color: '#CBD5E1', type: 'dashed' } },
        formatter: (params) => {
          const lines = params.map(p =>
            `<div style="display:flex;justify-content:space-between;gap:14px;align-items:center">
               <span style="display:inline-flex;align-items:center;gap:6px">
                 <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
                 <span>${p.seriesName}</span>
               </span>
               <strong>ETB ${p.value.toLocaleString()}</strong>
             </div>`
          ).join('')
          return `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValueLabel || params[0].name}</div>${lines}`
        },
      },
      xAxis: {
        type: 'category',
        data: days,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisTick: { show: false },
        axisLabel: { color: '#64748B', fontSize: 11, interval: 4 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } },
        axisLabel: { color: '#64748B', fontSize: 11, formatter: (v) => 'ETB ' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) },
      },
      series: [
        {
          name: 'Revenue',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          data: rev,
          lineStyle: { width: 3, color: BRAND.primary },
          itemStyle: { color: BRAND.primary, borderColor: '#fff', borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(15,123,120,0.45)' },
              { offset: 1, color: 'rgba(15,123,120,0.02)' },
            ]),
          },
          emphasis: { focus: 'series' },
        },
        {
          name: 'Expenses',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          data: exp,
          lineStyle: { width: 3, color: BRAND.goldDark },
          itemStyle: { color: BRAND.goldDark, borderColor: '#fff', borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(217,119,6,0.35)' },
              { offset: 1, color: 'rgba(217,119,6,0.02)' },
            ]),
          },
          emphasis: { focus: 'series' },
        },
      ],
    })
  }

  // ── 2. Orders by Status — rose-doughnut with rich tooltip ──────────────
  // Rose chart (radius scaled to value) instead of a flat doughnut — the
  // proportions read at a glance and the chart still works with many
  // categories. Legend below, no axis clutter.
  const statusCounts = {}
  orders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status]||0) + 1 })
  const statusLabels = Object.keys(statusCounts)
  const statusData = statusLabels.map((label, i) => ({
    name: label,
    value: statusCounts[label],
    itemStyle: { color: BRAND.pie[i % BRAND.pie.length] },
  }))
  if (statusChart.value) {
    charts.status = echarts.init(statusChart.value)
    charts.status.setOption({
      animation: true,
      animationDuration: 900,
      animationEasing: 'cubicOut',
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'center',
        icon: 'circle',
        itemWidth: 10, itemHeight: 10,
        textStyle: { fontSize: 12, color: '#475569' },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15,23,42,.92)',
        borderWidth: 0, confine: true,
        textStyle: { color: '#F8FAFC', fontSize: 12 },
        formatter: (p) =>
          `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
           <div>${p.value} order${p.value === 1 ? '' : 's'} · <strong>${p.percent}%</strong></div>`,
      },
      series: [{
        type: 'pie',
        radius: ['38%', '70%'],
        center: ['38%', '50%'],
        roseType: 'radius',
        data: statusData,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2,
        },
        emphasis: {
          scale: true,
          scaleSize: 8,
          itemStyle: { shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.18)' },
        },
      }],
    })
  }

  // ── 3. Payment Method Mix (30 days) — horizontal bar ──────────────────
  // Replaces the dashboard's donut on this page with a horizontal bar chart
  // so the manager can compare method totals at a glance — a donut's tiny
  // slices (bank, mobile) become readable bars.
  const payList = Array.isArray(pays) ? pays : (pays?.payments || [])
  const today30 = new Date(); today30.setDate(today30.getDate() - 29)
  const iso30 = today30.toISOString().slice(0, 10)
  const recentPays = payList.filter(p => (p.created_at || p.created || '').slice(0, 10) >= iso30 && p.status !== 'rejected' && Number(p.amount) > 0)
  const byMethod = {}
  for (const p of recentPays) {
    byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount)
  }
  const methodLabels = Object.keys(byMethod).sort((a, b) => byMethod[b] - byMethod[a])
  const methodValues = methodLabels.map(m => Math.round(byMethod[m]))
  if (payChart.value) {
    charts.pay = echarts.init(payChart.value)
    charts.pay.setOption({
      animation: true,
      animationDuration: 700,
      animationEasing: 'cubicOut',
      grid: { left: 80, right: 30, top: 20, bottom: 20 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15,23,42,.92)',
        borderWidth: 0, confine: true,
        textStyle: { color: '#F8FAFC', fontSize: 12 },
        formatter: (params) => {
          const p = params[0]
          return `<div style="font-weight:600;text-transform:capitalize">${p.name}</div><div>ETB ${p.value.toLocaleString()}</div>`
        },
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } },
        axisLabel: { color: '#64748B', fontSize: 11, formatter: (v) => v >= 1000 ? (v/1000).toFixed(0)+'k' : v },
      },
      yAxis: {
        type: 'category',
        data: methodLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#475569', fontSize: 12,
          formatter: (v) => v.charAt(0).toUpperCase() + v.slice(1),
        },
      },
      series: [{
        type: 'bar',
        data: methodValues.map((v, i) => ({
          value: v,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: BRAND.pie[i % BRAND.pie.length] },
              { offset: 1, color: BRAND.pie[i % BRAND.pie.length] + 'CC' },
            ]),
            borderRadius: [0, 6, 6, 0],
          },
        })),
        barWidth: '60%',
        label: {
          show: true,
          position: 'right',
          color: '#475569',
          fontSize: 11,
          formatter: (p) => 'ETB ' + p.value.toLocaleString(),
        },
      }],
    })
  }

  // ── 4. Hourly heatmap (30 days) — bar chart with gradient by intensity ─
  // 24 bars, one per hour. The bar colour intensity scales with order count
  // so the manager sees the rush hours at a glance even without axis labels.
  const hourCount = new Array(24).fill(0)
  for (const o of orders.filter(isRealOrder)) {
    const c = o.created
    if (c && c.slice(0, 10) >= iso30) {
      const h = new Date(c).getHours()
      if (h >= 0 && h < 24) hourCount[h]++
    }
  }
  const maxHour = Math.max(...hourCount, 1)
  if (hourChart.value) {
    charts.hour = echarts.init(hourChart.value)
    charts.hour.setOption({
      animation: true,
      animationDuration: 800,
      animationEasing: 'cubicOut',
      grid: { left: 40, right: 16, top: 20, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15,23,42,.92)',
        borderWidth: 0, confine: true,
        textStyle: { color: '#F8FAFC', fontSize: 12 },
        formatter: (params) => {
          const p = params[0]
          return `<div style="font-weight:600">${p.name}:00 – ${p.name}:59</div><div>${p.value} order${p.value === 1 ? '' : 's'}</div>`
        },
      },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, h) => String(h)),
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisTick: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10, interval: 2 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } },
        axisLabel: { color: '#64748B', fontSize: 11 },
      },
      series: [{
        type: 'bar',
        data: hourCount.map((v) => {
          // Color intensity scales with value — bright teal at peak hours,
          // muted teal at quiet hours. Bar radius for a softer look.
          const intensity = v / maxHour
          return {
            value: v,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: `rgba(15,123,120,${0.85 * intensity + 0.15})` },
                { offset: 1, color: `rgba(24,180,183,${0.35 * intensity + 0.05})` },
              ]),
              borderRadius: [4, 4, 0, 0],
            },
          }
        }),
        barWidth: '70%',
      }],
    })
  }

  // Resize all charts when the window resizes — ECharts does not do this
  // automatically. The handler is idempotent across refreshes because we
  // dispose+recreate the instances above.
  if (!window.__echartsResize) {
    window.__echartsResize = () => Object.values(charts).forEach(c => c && c.resize && c.resize())
    window.addEventListener('resize', window.__echartsResize)
  }
  // ResizeObserver: sidebar toggles and container width changes don't
  // fire a window.resize event, so observe the chart containers directly.
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      Object.values(charts).forEach(c => c && c.resize && c.resize())
    })
    Object.values({ reportChart, statusChart, payChart, hourChart }).forEach(r => {
      if (r.value) resizeObserver.observe(r.value)
    })
  }
}

/**
 * Exports the chosen table.
 *
 * This POSTed to `/api/export/csv`, an endpoint that has never existed, so
 * every export 404'd and the caught error read as a transient glitch rather
 * than a missing feature. It now reads the resource endpoint — which carries
 * its own role gating, so nothing new is exposed — and serialises client-side.
 */
async function exportCSV() {
  try {
    const data = await apiGet(exportTable.value)
    const rows = Array.isArray(data) ? data : (data && (data.entries || data.recipes || data.runs)) || []
    if (!rows.length) { toast(`No ${exportTable.value} to export`, 'error'); return }
    download(toCsv(rows), `${exportTable.value}-${TODAY()}.csv`, 'text/csv;charset=utf-8')
    toast(`${rows.length} row(s) exported`)
  } catch (e) { toast(e.message || 'Export failed', 'error') }
}

async function exportReceipt() {
  if (!receiptId.value) return toast('Enter an order ID', 'error')
  try {
    const res = await apiPost('export/receipt', { id: receiptId.value })
    if (res.html) { const w = window.open(); w.document.write(res.html) }
  } catch (e) { toast('Receipt failed', 'error') }
}
</script>

<style scoped>
.echart-box{width:100%;min-height:280px}
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:900px){.chart-grid{grid-template-columns:1fr}}
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px}
.chart-card h3{font-size:.9rem;color:var(--text-heading);margin-bottom:12px}
</style>
