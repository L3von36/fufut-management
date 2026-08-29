<template>
  <div class="eh" v-if="staff">
    <!-- Back link -->
    <button class="eh-back" @click="router.push('/app/employee-activity')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      All Employees
    </button>

    <!-- Profile header -->
    <div class="eh-hero">
      <div class="eh-avatar" :style="{ background: roleColor(staff.role) }">{{ initials(staff.firstName, staff.lastName) }}</div>
      <div class="eh-hero-body">
        <h2 class="eh-name">{{ staff.firstName }} {{ staff.lastName }}</h2>
        <div class="eh-meta">
          <span class="eh-role-pill" :style="{ background: roleColor(staff.role) + '22', color: roleColor(staff.role) }">{{ roleLabel(staff.role) }}</span>
          <span class="eh-meta-item" v-if="staff.email">{{ staff.email }}</span>
          <span class="eh-meta-item" v-if="staff.phone">{{ staff.phone }}</span>
          <span class="eh-meta-item">{{ rangeLabel }}</span>
        </div>
      </div>
      <button class="eh-refresh-btn" @click="load" :disabled="loading">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'eh-spin': loading }"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      </button>
    </div>

    <!-- Range tabs -->
    <div class="eh-range">
      <button v-for="opt in RANGE_OPTIONS" :key="opt.key" class="eh-range-tab" :class="{ active: range === opt.key }" @click="selectRange(opt.key)">{{ opt.label }}</button>
    </div>

    <!-- KPI cards -->
    <div class="eh-kpis" v-if="kpis.length">
      <div v-for="kpi in kpis" :key="kpi.label" class="eh-kpi-card">
        <div class="eh-kpi-value">{{ kpi.value }}</div>
        <div class="eh-kpi-label">{{ kpi.label }}</div>
      </div>
    </div>

    <!-- Attendance summary -->
    <div class="eh-section eh-attendance" v-if="attendance.entries.length">
      <div class="eh-section-header">
        <h3>Attendance</h3>
        <span class="eh-section-count">{{ attendance.shifts }} shift{{ attendance.shifts === 1 ? '' : 's' }}</span>
      </div>
      <div class="eh-att-summary">
        <span class="eh-att-stat"><strong>{{ attendance.totalHours }}h</strong> total</span>
        <span v-if="attendance.totalLateMinutes > 0" class="eh-att-stat eh-att-late"><strong>{{ attendance.totalLateMinutes }}m</strong> late</span>
      </div>
      <div class="eh-att-list">
        <div v-for="entry in attendance.entries.slice(0, 10)" :key="entry.id" class="eh-att-row">
          <span class="eh-att-date">{{ entry.date }}</span>
          <span class="eh-att-time">In: {{ shortTime(entry.clockIn) }}</span>
          <span class="eh-att-time" v-if="entry.clockOut">Out: {{ shortTime(entry.clockOut) }}</span>
          <span class="eh-att-time" v-else class="eh-att-open">Still working</span>
          <span class="eh-att-hours" v-if="entry.hours">{{ entry.hours }}h</span>
          <span v-if="entry.lateMinutes > 0" class="eh-att-late-flag">Late {{ entry.lateMinutes }}m</span>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div class="eh-section">
      <div class="eh-section-header">
        <h3>Activity Timeline</h3>
        <span class="eh-section-count">{{ timeline.length }} events</span>
      </div>
      <div v-if="timeline.length" class="eh-timeline">
        <div v-for="(item, i) in timeline.slice(0, 50)" :key="i" class="eh-tl-item" :class="`eh-tl-${item.type}`">
          <div class="eh-tl-dot">
            <span v-if="item.type === 'clock_in'">🟢</span>
            <span v-else-if="item.type === 'clock_out'">🔴</span>
            <span v-else v-html="actionIcon(item)"></span>
          </div>
          <div class="eh-tl-body">
            <div class="eh-tl-top">
              <span class="eh-tl-label" v-if="item.type === 'audit'">{{ item.label }}</span>
              <span class="eh-tl-label" v-else>{{ item.label }}</span>
              <span v-if="item.entity" class="eh-tl-area">{{ entityLabel(item.entity) }}</span>
              <span class="eh-tl-time">{{ formatTime(item.at) }}</span>
            </div>
            <div class="eh-tl-id" v-if="item.entity_id">{{ item.entity_id }}</div>
          </div>
        </div>
        <div v-if="timeline.length > 50" class="eh-tl-more">Showing 50 of {{ timeline.length }} events</div>
      </div>
      <div v-else class="eh-tl-empty">
        <p>No activity in this range.</p>
      </div>
    </div>
  </div>

  <!-- Loading -->
  <div v-else class="eh-loading">
    <div class="eh-spin-large"></div>
    <p>Loading employee history…</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { apiGet, TODAY } from '../api'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const staff = ref(null)
const kpis = ref([])
const attendance = ref({ shifts: 0, totalHours: 0, totalLateMinutes: 0, entries: [] })
const timeline = ref([])

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
]
const range = ref('today')

const rangeLabel = computed(() => {
  if (range.value === 'today') return 'Today'
  if (range.value === 'yesterday') return 'Yesterday'
  if (range.value === 'week') return 'This Week'
  if (range.value === 'month') return 'This Month'
  return ''
})

function startOfWeek(d = new Date()) { const day = d.getDay() || 7; const mon = new Date(d); mon.setDate(d.getDate() - (day - 1)); mon.setHours(0,0,0,0); return mon }
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function iso(d) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}` }

function currentRange() {
  const now = new Date()
  if (range.value === 'today') return { from: iso(now), to: iso(now) }
  if (range.value === 'yesterday') { const y = new Date(now); y.setDate(y.getDate()-1); return { from: iso(y), to: iso(y) } }
  if (range.value === 'week') return { from: iso(startOfWeek(now)), to: iso(now) }
  if (range.value === 'month') return { from: iso(startOfMonth(now)), to: iso(now) }
  return { from: iso(now), to: iso(now) }
}

function selectRange(key) { range.value = key; load() }

const ROLE_COLORS = { manager: '#0F7B78', 'head-chef': '#DC2626', 'assistant-chef': '#F59E0B', 'head-waiter': '#2563EB', cashier: '#0EA5E9', 'delivery-staff': '#6366F1', cleaner: '#10B981', accountant: '#9333EA' }
function roleColor(r) { return ROLE_COLORS[r] || '#64748B' }
function roleLabel(r) { if (!r) return ''; return r.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') }
function initials(f, l) { return ((f||'')[0] + (l||'')[0]).toUpperCase() || '?' }

const ENTITY_LABELS = { orders:'Orders', payments:'Payments', inventory:'Inventory', staff:'Staff', timeclock:'Time Clock', shifts:'Shifts', cashdrawer:'Cash Drawer', expenses:'Expenses', purchases:'Purchases', recipes:'Recipes', delivery:'Delivery', tips:'Tips', tables:'Tables', reservations:'Reservations', waste:'Waste' }
function entityLabel(e) { return ENTITY_LABELS[e] || (e ? e[0].toUpperCase()+e.slice(1) : '—') }

const ACTION_ICONS = {
  create: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  update: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>',
  void: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  verify: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
}
function actionIcon(item) {
  if (item.type === 'clock_in' || item.type === 'clock_out') return ''
  return ACTION_ICONS[item.label] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'
}

function shortTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function formatTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

async function load() {
  const id = route.params.id
  if (!id) return
  loading.value = true
  try {
    const { from, to } = currentRange()
    const res = await apiGet(`employees/${id}/history?from=${from}&to=${to}`)
    if (res && res.ok) {
      staff.value = res.staff
      kpis.value = res.kpis || []
      attendance.value = res.attendance || { shifts: 0, totalHours: 0, totalLateMinutes: 0, entries: [] }
      timeline.value = res.timeline || []
    }
  } catch (e) {
    console.error('Employee history load failed', e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<style scoped>
.eh { padding: 0; }
.eh-back { background: none; border: none; color: var(--text-muted); font-size: .82rem; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; margin-bottom: 14px; padding: 4px 0; }
.eh-back:hover { color: var(--text-heading); }

.eh-hero { display: flex; align-items: center; gap: 16px; padding: 20px 24px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); margin-bottom: 16px; }
.eh-avatar { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 1.2rem; flex-shrink: 0; }
.eh-hero-body { flex: 1; }
.eh-name { font-size: 1.4rem; font-weight: 700; color: var(--text-heading); margin: 0 0 6px; }
.eh-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.eh-role-pill { padding: 3px 10px; border-radius: 99px; font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.eh-meta-item { font-size: .8rem; color: var(--text-muted); }
.eh-refresh-btn { background: var(--bg); border: 1px solid var(--border); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-muted); }
.eh-spin { animation: eh-spin 1s linear infinite; }
@keyframes eh-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

.eh-range { display: flex; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 4px; width: fit-content; flex-wrap: wrap; margin-bottom: 16px; }
.eh-range-tab { background: transparent; border: none; padding: 7px 14px; font-size: .82rem; font-weight: 500; color: var(--text-muted); cursor: pointer; border-radius: 8px; transition: all .15s; }
.eh-range-tab:hover { color: var(--text-heading); background: var(--bg); }
.eh-range-tab.active { background: var(--primary); color: #fff; }

.eh-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; margin-bottom: 16px; }
.eh-kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
.eh-kpi-value { font-size: 1.65rem; font-weight: 700; color: var(--text-heading); line-height: 1.1; font-variant-numeric: tabular-nums; }
.eh-kpi-label { font-size: .76rem; color: var(--text-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: .04em; }

.eh-section { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; }
.eh-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.eh-section-header h3 { font-size: .95rem; font-weight: 600; color: var(--text-heading); margin: 0; }
.eh-section-count { font-size: .72rem; color: var(--text-muted); background: var(--bg); padding: 2px 8px; border-radius: 99px; }

.eh-attendance .eh-att-summary { display: flex; gap: 16px; margin-bottom: 12px; }
.eh-att-stat { font-size: .85rem; color: var(--text-muted); }
.eh-att-stat strong { color: var(--text-heading); }
.eh-att-late strong { color: #DC2626; }
.eh-att-list { display: flex; flex-direction: column; gap: 6px; }
.eh-att-row { display: flex; align-items: center; gap: 12px; font-size: .8rem; padding: 6px 0; border-bottom: 1px solid var(--border); }
.eh-att-row:last-child { border-bottom: none; }
.eh-att-date { font-weight: 600; color: var(--text-heading); min-width: 90px; }
.eh-att-time { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.eh-att-open { color: #10B981; font-weight: 600; }
.eh-att-hours { color: var(--text-heading); font-weight: 600; margin-left: auto; }
.eh-att-late-flag { color: #DC2626; font-size: .72rem; font-weight: 600; }

.eh-timeline { position: relative; }
.eh-tl-item { display: flex; gap: 12px; padding: 8px 0; border-left: 2px solid var(--border); padding-left: 16px; margin-left: 10px; position: relative; }
.eh-tl-item::before { content: ''; position: absolute; left: -6px; top: 12px; width: 10px; height: 10px; border-radius: 50%; background: var(--surface); border: 2px solid var(--tl-color, #94a3b8); }
.eh-tl-clock_in { --tl-color: #10B981; } .eh-tl-clock_out { --tl-color: #EF4444; } .eh-tl-audit { --tl-color: #0EA5E9; }
.eh-tl-dot { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--tl-color) 12%, transparent); color: var(--tl-color); flex-shrink: 0; margin-top: 2px; font-size: .8rem; }
.eh-tl-body { flex: 1; min-width: 0; }
.eh-tl-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.eh-tl-label { font-size: .76rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--tl-color); }
.eh-tl-area { font-size: .72rem; color: var(--text-muted); background: var(--bg); padding: 1px 7px; border-radius: 99px; }
.eh-tl-time { font-size: .72rem; color: var(--text-muted); margin-left: auto; font-variant-numeric: tabular-nums; }
.eh-tl-id { font-size: .72rem; font-family: var(--font-mono, monospace); color: var(--text-muted); margin-top: 2px; }
.eh-tl-more { padding: 10px; font-size: .8rem; color: var(--text-muted); text-align: center; }
.eh-tl-empty { text-align: center; padding: 30px; color: var(--text-muted); }

.eh-loading { text-align: center; padding: 60px 20px; }
.eh-spin-large { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; margin: 0 auto 12px; animation: eh-spin 1s linear infinite; }

@media (max-width: 768px) {
  .eh-hero { flex-direction: column; align-items: flex-start; padding: 16px; }
  .eh-kpis { grid-template-columns: 1fr 1fr; }
  .eh-att-row { flex-wrap: wrap; gap: 6px; }
}
</style>
