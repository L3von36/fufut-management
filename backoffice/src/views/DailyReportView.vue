<template>
  <div class="dr" v-if="report">
    <!-- Print button -->
    <div class="dr-toolbar no-print">
      <button class="btn btn-outline btn-sm" @click="router.back()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <button class="btn btn-primary btn-sm" @click="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
        Print
      </button>
    </div>

    <!-- Report header -->
    <div class="dr-header">
      <h1>Daily Activity Report</h1>
      <div class="dr-header-sub">
        <span>{{ report.staff.firstName }} {{ report.staff.lastName }}</span>
        <span>{{ roleLabel(report.staff.role) }}</span>
        <span>{{ formatDate(report.date) }}</span>
      </div>
    </div>

    <!-- Attendance -->
    <div class="dr-section">
      <h2>Attendance</h2>
      <div class="dr-att-grid">
        <div v-for="e in report.attendance.entries" :key="e.id" class="dr-att-row">
          <span class="dr-att-label">Clock In</span><span class="dr-att-val">{{ e.clockIn || '—' }}</span>
          <span class="dr-att-label">Clock Out</span><span class="dr-att-val">{{ e.clockOut || '—' }}</span>
          <span class="dr-att-label">Hours</span><span class="dr-att-val">{{ e.hours || 0 }}h</span>
          <span v-if="e.lateMinutes > 0" class="dr-att-late">Late {{ e.lateMinutes }}m</span>
        </div>
        <div class="dr-att-summary">
          <span><strong>{{ report.attendance.totalHours }}h</strong> total</span>
          <span v-if="report.attendance.totalBreakMinutes > 0"><strong>{{ report.attendance.totalBreakMinutes }}m</strong> break</span>
        </div>
      </div>
    </div>

    <!-- Activity KPIs -->
    <div class="dr-section">
      <h2>Activity</h2>
      <div class="dr-kpi-grid">
        <div v-for="kpi in report.kpis" :key="kpi.label" class="dr-kpi">
          <span class="dr-kpi-val">{{ kpi.value }}</span>
          <span class="dr-kpi-lbl">{{ kpi.label }}</span>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="dr-section">
      <h2>Activity Log ({{ report.timeline.length }} events)</h2>
      <table class="dr-table">
        <thead>
          <tr><th>Time</th><th>Action</th><th>Area</th><th>Entity</th><th>Summary</th></tr>
        </thead>
        <tbody>
          <tr v-for="(t, i) in report.timeline" :key="i">
            <td>{{ formatTime(t.at) }}</td>
            <td>{{ t.action }}</td>
            <td>{{ t.entity }}</td>
            <td class="dr-mono">{{ t.entityId || '—' }}</td>
            <td>{{ summary(t) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else class="dr-loading">Loading report…</div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { apiGet, TODAY } from '../api'

const router = useRouter()
const route = useRoute()
const report = ref(null)
const window = globalThis

function roleLabel(r) { return r ? r.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : '' }
function formatDate(d) { return new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }
function formatTime(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
function summary(t) {
  if (!t.after) return '—'
  if (typeof t.after === 'object') {
    return Object.keys(t.after).slice(0, 3).map(k => `${k}: ${typeof t.after[k] === 'object' ? JSON.stringify(t.after[k]) : t.after[k]}`).join(', ')
  }
  return String(t.after).slice(0, 60)
}

async function load() {
  const id = route.params.id
  if (!id) return
  const date = route.query.date || TODAY()
  try {
    const res = await apiGet(`employees/${id}/daily-report?date=${date}`)
    if (res && res.ok) report.value = res
  } catch (e) { console.error('Daily report load failed', e) }
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<style scoped>
.dr { max-width: 800px; margin: 0 auto; }
.dr-toolbar { display: flex; gap: 10px; margin-bottom: 16px; }
.dr-header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid var(--text-heading); }
.dr-header h1 { font-size: 1.5rem; margin: 0 0 6px; }
.dr-header-sub { display: flex; justify-content: center; gap: 12px; font-size: .85rem; color: var(--text-muted); }
.dr-section { margin-bottom: 24px; }
.dr-section h2 { font-size: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 12px; }
.dr-att-grid { display: flex; flex-direction: column; gap: 6px; }
.dr-att-row { display: grid; grid-template-columns: 80px 1fr 80px 1fr 60px 1fr; gap: 4px 8px; font-size: .82rem; align-items: center; }
.dr-att-label { color: var(--text-muted); font-size: .72rem; text-transform: uppercase; }
.dr-att-val { font-weight: 600; }
.dr-att-late { color: #DC2626; font-weight: 600; font-size: .72rem; }
.dr-att-summary { display: flex; gap: 16px; font-size: .85rem; color: var(--text-muted); margin-top: 6px; }
.dr-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.dr-kpi { text-align: center; padding: 10px; border: 1px solid var(--border); border-radius: 8px; }
.dr-kpi-val { display: block; font-size: 1.3rem; font-weight: 700; }
.dr-kpi-lbl { display: block; font-size: .72rem; color: var(--text-muted); }
.dr-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
.dr-table th { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: .72rem; text-transform: uppercase; }
.dr-table td { padding: 4px 8px; border-bottom: 1px solid var(--border); }
.dr-mono { font-family: var(--font-mono, monospace); font-size: .72rem; }
.dr-loading { text-align: center; padding: 40px; color: var(--text-muted); }
@media print { .no-print { display: none !important; } .dr { max-width: none; } }
</style>
