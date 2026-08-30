<template>
  <div class="ea">
    <!-- Hero header -->
    <div class="ea-hero">
      <div class="ea-hero-left">
        <div class="ea-hero-greeting">Employee Activity</div>
        <h2 class="ea-hero-title">Who worked, what did they do</h2>
        <div class="ea-hero-meta">
          <span class="ea-hero-pill">{{ rangeLabel }}</span>
          <span class="ea-hero-pill">{{ summary.totalEmployees }} employees</span>
        </div>
      </div>
      <button class="ea-refresh-btn" @click="load" :disabled="loading" :title="loading ? 'Loading…' : 'Refresh'">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'ea-spin': loading }">
          <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </button>
    </div>

    <!-- Range tabs -->
    <div class="ea-range">
      <button v-for="opt in RANGE_OPTIONS" :key="opt.key" class="ea-range-tab" :class="{ active: range === opt.key }" @click="selectRange(opt.key)">{{ opt.label }}</button>
      <div class="ea-range-custom" v-if="range === 'custom'">
        <label>From <input type="date" v-model="customFrom" class="input input-sm" /></label>
        <label>To <input type="date" v-model="customTo" class="input input-sm" /></label>
        <button class="btn btn-primary btn-sm" @click="load">Apply</button>
      </div>
    </div>

    <!-- Summary cards -->
    <div class="ea-summary" v-if="!loading">
      <div class="ea-summary-card ea-sum-teal">
        <div class="ea-sum-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <div class="ea-sum-value">{{ summary.totalEmployees }}</div>
        <div class="ea-sum-label">Total Employees</div>
      </div>
      <div class="ea-summary-card ea-sum-green">
        <div class="ea-sum-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="ea-sum-value">{{ summary.workingNow }}</div>
        <div class="ea-sum-label">Working Now</div>
      </div>
      <div class="ea-summary-card ea-sum-blue">
        <div class="ea-sum-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>
        <div class="ea-sum-value">{{ summary.presentToday }}</div>
        <div class="ea-sum-label">Present</div>
      </div>
      <div class="ea-summary-card ea-sum-amber">
        <div class="ea-sum-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        <div class="ea-sum-value">{{ summary.lateToday }}</div>
        <div class="ea-sum-label">Late</div>
      </div>
      <div class="ea-summary-card ea-sum-red">
        <div class="ea-sum-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
        <div class="ea-sum-value">{{ summary.absentToday }}</div>
        <div class="ea-sum-label">Absent</div>
      </div>
      <div class="ea-summary-card ea-sum-indigo">
        <div class="ea-sum-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="ea-sum-value">{{ summary.totalHours }}h</div>
        <div class="ea-sum-label">Total Hours</div>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading && !employees.length" class="ea-emp-list">
      <div v-for="i in 5" :key="i" class="ea-emp-card ea-skel">
        <div class="ea-skel-avatar"></div>
        <div class="ea-skel-lines">
          <div class="ea-skel-line ea-skel-name"></div>
          <div class="ea-skel-line ea-skel-sub"></div>
        </div>
      </div>
    </div>

    <!-- Employee list -->
    <div v-else-if="employees.length" class="ea-emp-list">
      <div v-for="emp in employees" :key="emp.id" class="ea-emp-card" @click="openEmployee(emp.id)">
        <div class="ea-emp-avatar" :style="{ background: roleColor(emp.role) }">{{ initials(emp.name) }}</div>
        <div class="ea-emp-body">
          <div class="ea-emp-top">
            <span class="ea-emp-name">{{ emp.name }}</span>
            <span class="ea-emp-role" :style="{ color: roleColor(emp.role) }">{{ roleLabel(emp.role) }}</span>
          </div>
          <div class="ea-emp-bottom">
            <span class="ea-emp-status" :class="emp.isWorking ? 'ea-sts-working' : emp.shifts > 0 ? 'ea-sts-present' : 'ea-sts-absent'">
              <span class="ea-emp-status-dot"></span>
              {{ emp.isWorking ? 'Working now' : emp.shifts > 0 ? 'Present' : 'Absent' }}
            </span>
            <span v-if="emp.shifts > 0" class="ea-emp-stat">{{ emp.shifts }} shift{{ emp.shifts === 1 ? '' : 's' }}</span>
            <span v-if="emp.totalHours > 0" class="ea-emp-stat">{{ emp.totalHours }}h</span>
            <span v-if="emp.isLate" class="ea-emp-stat ea-sts-late-flag">Late {{ emp.totalLateMinutes }}m</span>
            <span v-if="emp.clockIn" class="ea-emp-stat ea-emp-time">In: {{ shortTime(emp.clockIn) }}</span>
            <span v-if="emp.clockOut" class="ea-emp-stat ea-emp-time">Out: {{ shortTime(emp.clockOut) }}</span>
          </div>
        </div>
        <div class="ea-emp-chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="ea-empty">
      <div class="ea-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
      <h3>No employees found</h3>
      <p>No active staff in the system yet.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { apiGet, TODAY } from '../api'

const router = useRouter()
const loading = ref(false)
const summary = ref({ totalEmployees: 0, workingNow: 0, presentToday: 0, lateToday: 0, absentToday: 0, totalHours: 0 })
const employees = ref([])

const RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
]
const range = ref('today')
const customFrom = ref(TODAY())
const customTo = ref(TODAY())

const rangeLabel = computed(() => {
  if (range.value === 'today') return 'Today'
  if (range.value === 'yesterday') return 'Yesterday'
  if (range.value === 'week') return 'This Week'
  if (range.value === 'month') return 'This Month'
  return `${customFrom.value} → ${customTo.value}`
})

function startOfWeek(d = new Date()) {
  const day = d.getDay() || 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - (day - 1))
  mon.setHours(0, 0, 0, 0)
  return mon
}
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function iso(d) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
function endOfDayIso(d) { return `${iso(d)}T23:59:59` }

function currentRange() {
  const now = new Date()
  if (range.value === 'today') return { from: iso(now), to: iso(now) }
  if (range.value === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1)
    return { from: iso(y), to: iso(y) }
  }
  if (range.value === 'week') return { from: iso(startOfWeek(now)), to: iso(now) }
  if (range.value === 'month') return { from: iso(startOfMonth(now)), to: iso(now) }
  if (range.value === 'custom') return { from: customFrom.value || iso(now), to: customTo.value || iso(now) }
  return { from: iso(now), to: iso(now) }
}

function selectRange(key) {
  range.value = key
  if (key !== 'custom') load()
}

const ROLE_COLORS = {
  manager: '#0F7B78', 'head-chef': '#DC2626', 'assistant-chef': '#F59E0B',
  'head-waiter': '#2563EB', cashier: '#0EA5E9', 'delivery-staff': '#6366F1',
  cleaner: '#10B981', accountant: '#9333EA',
}
function roleColor(r) { return ROLE_COLORS[r] || '#64748B' }
function roleLabel(r) {
  if (!r) return ''
  return r.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}
function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function shortTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function openEmployee(id) {
  router.push(`/app/employee/${id}`)
}

async function load() {
  loading.value = true
  try {
    const { from, to } = currentRange()
    const res = await apiGet(`employees/activity?from=${from}&to=${to}`)
    if (res && res.ok) {
      summary.value = res.summary
      employees.value = res.employees || []
    } else {
      summary.value = { totalEmployees: 0, workingNow: 0, presentToday: 0, lateToday: 0, absentToday: 0, totalHours: 0 }
      employees.value = []
    }
  } catch (e) {
    console.error('Employee activity load failed', e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.ea { padding: 0; }
.ea-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; padding: 20px 24px; border-radius: 14px; background: linear-gradient(135deg, var(--teal-700, #0F7B78) 0%, var(--teal-800, #0B5A57) 100%); color: #fff; box-shadow: 0 8px 24px rgba(15, 123, 120, 0.18); }
.ea-hero-left { flex: 1; min-width: 240px; }
.ea-hero-greeting { font-size: .82rem; opacity: .82; font-weight: 500; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .06em; }
.ea-hero-title { font-size: 1.75rem; font-weight: 700; margin: 0 0 10px; line-height: 1.1; }
.ea-hero-meta { display: flex; gap: 8px; flex-wrap: wrap; }
.ea-hero-pill { background: rgba(255,255,255,.15); padding: 4px 10px; border-radius: 99px; font-size: .76rem; font-weight: 500; }
.ea-refresh-btn { background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.25); color: #fff; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.ea-refresh-btn:hover { background: rgba(255,255,255,.25); }
.ea-spin { animation: ea-spin 1s linear infinite; }
@keyframes ea-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

.ea-range { display: flex; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 4px; width: fit-content; flex-wrap: wrap; margin-bottom: 16px; }
.ea-range-tab { background: transparent; border: none; padding: 7px 14px; font-size: .82rem; font-weight: 500; color: var(--text-muted); cursor: pointer; border-radius: 8px; transition: all .15s; min-height: 34px; }
.ea-range-tab:hover { color: var(--text-heading); background: var(--bg); }
.ea-range-tab.active { background: var(--primary); color: #fff; box-shadow: 0 2px 6px rgba(15,123,120,.3); }
.ea-range-custom { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 4px; }
.ea-range-custom label { display: flex; flex-direction: column; gap: 3px; font-size: .72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }

.ea-summary { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; margin-bottom: 20px; }
.ea-summary-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; position: relative; overflow: hidden; }
.ea-summary-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--sum-color, var(--primary)); }
.ea-sum-teal { --sum-color: #0F7B78; } .ea-sum-green { --sum-color: #10B981; } .ea-sum-blue { --sum-color: #2563EB; }
.ea-sum-amber { --sum-color: #D97706; } .ea-sum-red { --sum-color: #DC2626; } .ea-sum-indigo { --sum-color: #6366F1; }
.ea-sum-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--sum-color) 12%, transparent); color: var(--sum-color); margin-bottom: 10px; }
.ea-sum-value { font-size: 1.65rem; font-weight: 700; color: var(--text-heading); line-height: 1.1; font-variant-numeric: tabular-nums; }
.ea-sum-label { font-size: .76rem; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: .04em; }

.ea-emp-list { display: flex; flex-direction: column; gap: 10px; }
.ea-emp-card { display: flex; align-items: center; gap: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; cursor: pointer; transition: transform .15s, box-shadow .15s; }
.ea-emp-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.06); border-color: var(--primary); }
.ea-emp-avatar { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 1rem; flex-shrink: 0; }
.ea-emp-body { flex: 1; min-width: 0; }
.ea-emp-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.ea-emp-name { font-weight: 600; color: var(--text-heading); font-size: .92rem; }
.ea-emp-role { font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.ea-emp-bottom { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ea-emp-status { display: inline-flex; align-items: center; gap: 5px; font-size: .76rem; font-weight: 500; padding: 2px 8px; border-radius: 99px; }
.ea-emp-status-dot { width: 7px; height: 7px; border-radius: 50%; }
.ea-sts-working { color: #10B981; background: rgba(16,185,129,.1); } .ea-sts-working .ea-emp-status-dot { background: #10B981; }
.ea-sts-present { color: #2563EB; background: rgba(37,99,235,.1); } .ea-sts-present .ea-emp-status-dot { background: #2563EB; }
.ea-sts-absent { color: var(--text-muted); background: var(--bg); } .ea-sts-absent .ea-emp-status-dot { background: #94a3b8; }
.ea-emp-stat { font-size: .76rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.ea-sts-late-flag { color: #DC2626; font-weight: 600; }
.ea-emp-time { font-size: .72rem; }
.ea-emp-chevron { color: var(--text-muted); flex-shrink: 0; }

.ea-empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.ea-empty-icon { margin-bottom: 14px; }
.ea-empty h3 { font-size: 1rem; color: var(--text-heading); margin: 0 0 6px; }
.ea-empty p { font-size: .85rem; }

.ea-skel { pointer-events: none; }
.ea-skel-avatar { width: 44px; height: 44px; border-radius: 12px; background: var(--bg); }
.ea-skel-lines { flex: 1; }
.ea-skel-line { background: var(--bg); border-radius: 4px; height: 10px; margin-bottom: 6px; animation: ea-skel-pulse 1.5s ease-in-out infinite; }
.ea-skel-name { width: 40%; } .ea-skel-sub { width: 60%; }
@keyframes ea-skel-pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }

@media (max-width: 768px) {
  .ea-hero { padding: 16px 18px; }
  .ea-hero-title { font-size: 1.3rem; }
  .ea-range { width: 100%; }
  .ea-range-tab { flex: 1 1 auto; padding: 6px 8px; font-size: .76rem; }
  .ea-summary { grid-template-columns: 1fr 1fr; gap: 10px; }
  .ea-emp-card { padding: 12px; }
}
</style>
