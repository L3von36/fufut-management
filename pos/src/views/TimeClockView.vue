<template>
  <div>
    <div class="table-toolbar">
      <h3>Time Clock</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-if="canSeeRoster" v-model="staffFilter" class="select"><option value="">All Staff</option><option v-for="s in staffList" :key="s.id" :value="s.id">{{ s.firstName }} {{ s.lastName }}</option></select>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>

    <!-- ─── Your own shift ─── -->
    <div class="tc-me" :class="{ 'is-on': me.clockedIn }">
      <div class="tc-me-state">
        <span class="tc-dot" aria-hidden="true"></span>
        <div>
          <div class="tc-me-title">{{ me.clockedIn ? 'On shift' : 'Not clocked in' }}</div>
          <div class="tc-me-sub">
            {{ me.clockedIn ? 'Since ' + (me.entry?.clock_in || '—') : 'Clock in to start your shift' }}
          </div>
        </div>
      </div>
      <button
        class="btn"
        :class="me.clockedIn ? 'btn-secondary' : 'btn-primary'"
        :disabled="busy"
        @click="me.clockedIn ? clockOut() : clockIn()"
      >
        {{ busy ? 'Working…' : (me.clockedIn ? 'Clock Out' : 'Clock In') }}
      </button>
      <button
        v-if="me.clockedIn && !onBreak"
        class="btn btn-outline"
        :disabled="busy"
        @click="startBreak"
      >Start Break</button>
      <button
        v-if="onBreak"
        class="btn btn-primary"
        :disabled="busy"
        @click="endBreak"
      >End Break</button>
      <button
        v-if="me.clockedIn"
        class="btn btn-outline"
        @click="showHandover = !showHandover"
      >Handover</button>
    </div>

    <!-- ─── Shift Handover ─── -->
    <div v-if="showHandover" class="tc-handover card">
      <h3>Shift Handover</h3>
      <p class="tc-handover-sub">Record what the next shift needs to know. They'll see this when they clock in.</p>
      <div class="tc-handover-grid">
        <label class="tc-handover-field"><span>Pending Orders</span><textarea v-model="handover.pendingOrders" rows="2" placeholder="Table 8 has a pending order…"></textarea></label>
        <label class="tc-handover-field"><span>Pending Tasks</span><textarea v-model="handover.pendingTasks" rows="2" placeholder="Restroom not cleaned yet…"></textarea></label>
        <label class="tc-handover-field"><span>Cash Info</span><textarea v-model="handover.cashInfo" rows="2" placeholder="Drawer count at handover…"></textarea></label>
        <label class="tc-handover-field"><span>Problems</span><textarea v-model="handover.problems" rows="2" placeholder="POS was slow during rush…"></textarea></label>
        <label class="tc-handover-field"><span>Customer Issues</span><textarea v-model="handover.customerIssues" rows="2" placeholder="VIP at table 5…"></textarea></label>
        <label class="tc-handover-field"><span>Important Notes</span><textarea v-model="handover.importantNotes" rows="2" placeholder="Anything else…"></textarea></label>
      </div>
      <div class="tc-handover-actions">
        <button class="btn btn-primary btn-sm" @click="submitHandover">Record Handover</button>
        <button class="btn btn-secondary btn-sm" @click="showHandover = false">Cancel</button>
      </div>
    </div>

    <!-- ─── Latest Handover ─── -->
    <div v-if="latestHandover" class="tc-latest-handover card">
      <div class="tc-latest-head">
        <h3>Last Handover</h3>
        <span class="tc-latest-meta">{{ latestHandover.staffName }} · {{ shortTime(latestHandover.created) }}</span>
      </div>
      <div class="tc-latest-body">
        <div v-if="latestHandover.pending_orders"><strong>Pending Orders:</strong> {{ latestHandover.pending_orders }}</div>
        <div v-if="latestHandover.pending_tasks"><strong>Pending Tasks:</strong> {{ latestHandover.pending_tasks }}</div>
        <div v-if="latestHandover.cash_info"><strong>Cash:</strong> {{ latestHandover.cash_info }}</div>
        <div v-if="latestHandover.problems"><strong>Problems:</strong> {{ latestHandover.problems }}</div>
        <div v-if="latestHandover.customer_issues"><strong>Customer Issues:</strong> {{ latestHandover.customer_issues }}</div>
        <div v-if="latestHandover.important_notes"><strong>Notes:</strong> {{ latestHandover.important_notes }}</div>
      </div>
    </div>

    <!-- ─── My recent shifts ───
      Everyone can see their own hours: the roster above is a permission, this
      is the caller's own record, and a role with no timeclock grant (a waiter)
      would otherwise see the two buttons and nothing else. -->
    <div class="tc-history">
      <div class="tc-history-head">
        <div class="tc-history-title">My Recent Shifts</div>
        <div class="tc-history-sub">{{ myHistory.length ? myHistory.length + ' most recent, newest first' : 'Clock in to start your first shift' }}</div>
      </div>
      <ul v-if="myHistory.length" class="tc-history-list">
        <li v-for="e in myHistory" :key="e.id" class="tc-history-row" :class="{ 'is-active': !e.clockOut }">
          <span class="tc-history-date">{{ e.date }}</span>
          <span class="tc-history-times">{{ e.clockIn || '—' }} → {{ e.clockOut || '…' }}</span>
          <span class="tc-history-dur">{{ formatDuration(e) }}</span>
          <span class="badge" :class="e.clockOut ? 'badge-fulfilled' : 'badge-new'">{{ e.clockOut ? 'Completed' : 'Active' }}</span>
        </li>
      </ul>
      <div v-else class="tc-history-empty">No shifts recorded yet.</div>
    </div>

    <!--
      Refused because money is still owed on their tables. Listing the checks
      rather than only the count is what makes it actionable — the waiter needs
      to know which table to go back to.
    -->
    <div v-if="blocked" class="tc-blocked">
      <div class="tc-blocked-title">{{ blocked.error }}</div>
      <ul class="tc-blocked-list">
        <li v-for="c in blocked.openChecks" :key="c.id">
          {{ c.table ? 'Table ' + c.table : 'Order' }} · ETB {{ Number(c.total || 0).toFixed(0) }}
        </li>
      </ul>
      <div class="tc-blocked-actions">
        <button class="btn btn-sm btn-primary" @click="goToOpenChecks">Go to Open Checks</button>
        <button v-if="isManager" class="btn btn-sm btn-outline" :disabled="busy" @click="clockOut(true)">
          Override and clock out
        </button>
      </div>
    </div>

    <!--
      The roster is a separate permission from clocking yourself on. A waiter
      may do the second and not the first, and showing them an empty grid would
      read as "nobody is working" rather than "this is not yours to see".
    -->
    <div v-if="canSeeRoster" class="summary-grid">
      <div class="summary-card"><div class="num" style="color:var(--success)">{{ clockedIn.length }}</div><div class="lbl">Clocked In</div></div>
      <div class="summary-card"><div class="num">{{ entries.length }}</div><div class="lbl">Today's Entries</div></div>
    </div>
    <div v-if="canSeeRoster" class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Staff</th><th>Clock In</th><th>Clock Out</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="e in filteredEntries" :key="e.id">
              <td data-label="Staff"><strong>{{ e.staffName||e.name||'—' }}</strong></td>
              <td data-label="In">{{ e.clockIn||e.clock_in||'—' }}</td>
              <td data-label="Out">{{ e.clockOut||e.clock_out||'—' }}</td>
              <td data-label="Duration">{{ formatDuration(e) }}</td>
              <td data-label="Status"><span class="badge" :class="!(e.clockOut||e.clock_out)?'badge-new':'badge-fulfilled'">{{ (e.clockOut||e.clock_out)?'Completed':'Active' }}</span></td>
            </tr>
            <tr v-if="!filteredEntries.length"><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">No time entries</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredEntries.length }} entry(ies)</span></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { useRouter } from 'vue-router'
import { apiGet, apiPost } from '../api'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const toast = inject('toast')
const auth = useAuthStore()

const entries = ref([])
const staffList = ref([])
const staffFilter = ref('')
const me = ref({ clockedIn: false, entry: null })
const myHistory = ref([])
const blocked = ref(null)
const busy = ref(false)
const canSeeRoster = ref(false)

const isManager = computed(() => auth.roleKey === 'manager')
const clockedIn = computed(() => entries.value.filter(e => !(e.clockOut || e.clock_out)))
const filteredEntries = computed(() =>
  !staffFilter.value ? entries.value : entries.value.filter(e => e.staffId === staffFilter.value || e.staff_id === staffFilter.value || e.name === staffFilter.value)
)

// Fix #12: Use Date object for robust duration parsing
function parseTime(t) {
  if (!t) return null
  // Handle full ISO timestamps
  if (t.includes('T') || t.includes('-')) {
    const d = new Date(t)
    return isNaN(d) ? null : d
  }
  // Handle HH:MM or HH:MM:SS
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const d = new Date()
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d
}

function formatDuration(e) {
  const inAt = e.clockIn || e.clock_in
  if (!inAt) return '—'
  const outAt = e.clockOut || e.clock_out
  let a = parseTime(inAt)
  let b = outAt ? parseTime(outAt) : new Date()
  // An open shift's live duration must not depend on the device's timezone.
  // clock_in is shop wall-clock (UTC+3) and new Date() is the device clock, so
  // on a device set anywhere else the subtraction goes negative and the row
  // reads '—'. `created` is a real instant recorded at clock-in; anchor the
  // open end on it when it is there.
  if (!outAt && a && e.created) {
    const created = new Date(e.created)
    if (!isNaN(created.getTime())) { a = created; b = new Date() }
  }
  if (!a || !b) return '—'
  const diffMs = b - a
  if (diffMs < 0) return '—'
  const totalMin = Math.floor(diffMs / 60000)
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
}

async function loadMine() {
  // Two self-service reads, failing independently: the shift history is this
  // screen's own record and must not take the state card down with it (and
  // vice versa) if one endpoint is slow or refused.
  const [stateRes, historyRes] = await Promise.allSettled([
    apiGet('timeclock/me'),
    apiGet('timeclock/me/history'),
  ])
  me.value = stateRes.status === 'fulfilled'
    ? stateRes.value
    : { clockedIn: false, entry: null }
  const h = historyRes.status === 'fulfilled' ? historyRes.value : null
  myHistory.value = Array.isArray(h && h.entries) ? h.entries : []
}

async function loadData() {
  // Refused rather than empty: a role without the roster grant gets 403 here,
  // and that is the difference between "nobody is working" and "not yours".
  const [t, s] = await Promise.all([
    apiGet('timeclock').then(r => r, () => null),
    apiGet('staff').then(r => r, () => null),
  ])
  canSeeRoster.value = Array.isArray(t)
  entries.value = Array.isArray(t) ? t : []
  staffList.value = Array.isArray(s) ? s : []
  await loadMine()
}

async function clockIn() {
  busy.value = true
  blocked.value = null
  try {
    await apiPost('timeclock/clock-in', {})
    toast('Clocked in')
    await loadData()
  } catch (e) {
    toast(e.message || 'Could not clock in', 'error')
  } finally {
    busy.value = false
  }
}

async function clockOut(force = false) {
  busy.value = true
  try {
    await apiPost('timeclock/clock-out', force ? { force: true } : {})
    blocked.value = null
    toast(force ? 'Clocked out — override recorded' : 'Clocked out')
    await loadData()
  } catch (e) {
    // The server answers a refusal with the checks that are still open. Showing
    // them is the whole point: a bare "failed" leaves the person guessing which
    // table they still owe.
    if (e.data && Array.isArray(e.data.openChecks)) {
      blocked.value = e.data
    } else {
      toast(e.message || 'Could not clock out', 'error')
    }
  } finally {
    busy.value = false
  }
}

// ─── Breaks ───
const onBreak = ref(false)

async function startBreak() {
  busy.value = true
  try {
    await apiPost('timeclock/break-start', {})
    onBreak.value = true
    toast('Break started')
  } catch (e) {
    toast(e.message || 'Could not start break', 'error')
  } finally {
    busy.value = false
  }
}

async function endBreak() {
  busy.value = true
  try {
    const res = await apiPost('timeclock/break-end', {})
    onBreak.value = false
    toast(`Break ended · ${res.durationMin || 0} min`)
  } catch (e) {
    toast(e.message || 'Could not end break', 'error')
  } finally {
    busy.value = false
  }
}

// ─── Shift Handover ───
const showHandover = ref(false)
const latestHandover = ref(null)
const handover = ref({
  pendingOrders: '', pendingTasks: '', cashInfo: '',
  problems: '', customerIssues: '', importantNotes: '',
})

function shortTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

async function submitHandover() {
  busy.value = true
  try {
    await apiPost('handovers', handover.value)
    toast('Handover recorded')
    showHandover.value = false
    handover.value = { pendingOrders: '', pendingTasks: '', cashInfo: '', problems: '', customerIssues: '', importantNotes: '' }
    await loadLatestHandover()
  } catch (e) {
    toast(e.message || 'Could not record handover', 'error')
  } finally {
    busy.value = false
  }
}

async function loadLatestHandover() {
  try {
    const res = await apiGet('handovers/latest')
    latestHandover.value = (res && res.handover) || null
  } catch { latestHandover.value = null }
}

function goToOpenChecks() {
  if (auth.hasPermission('open-checks')) router.push('/app/open-checks')
  else router.push('/app/orders')
}

onMounted(() => {
  loadData()
  loadLatestHandover()
})
</script>

<style scoped>
.tc-me {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--text-muted);
  border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 16px;
}
.tc-me.is-on { border-left-color: var(--success); }
.tc-me-state { display: flex; align-items: center; gap: 12px; min-width: 0; }
.tc-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
.tc-me.is-on .tc-dot { background: var(--success); }
.tc-me-title { font-weight: 600; color: var(--text-heading); }
.tc-me-sub { font-size: .76rem; color: var(--text-muted); }

.tc-blocked {
  background: var(--surface); border: 1px solid var(--danger);
  border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 16px;
}

/* My recent shifts — the caller's own record, so it reads like a payslip stub
   rather than the roster table: one row per shift, four facts per row, no
   columns to scrub sideways on a phone. */
.tc-history {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 16px;
}
.tc-history-head { margin-bottom: 10px; }
.tc-history-title { font-weight: 600; color: var(--text-heading); }
.tc-history-sub { font-size: .76rem; color: var(--text-muted); margin-top: 2px; }
.tc-history-list { list-style: none; margin: 0; padding: 0; }
.tc-history-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 9px 0; border-top: 1px solid var(--border);
  font-size: .84rem; color: var(--text-body);
}
.tc-history-row.is-active .tc-history-dur { color: var(--success); font-weight: 600; }
.tc-history-date { font-weight: 600; color: var(--text-heading); min-width: 86px; }
.tc-history-times { font-variant-numeric: tabular-nums; }
.tc-history-dur { margin-left: auto; font-variant-numeric: tabular-nums; }
.tc-history-empty { padding: 18px 0 6px; text-align: center; color: var(--text-muted); font-size: .84rem; }
.tc-blocked-title { font-weight: 600; color: var(--danger); margin-bottom: 8px; }
.tc-blocked-list { margin: 0 0 12px; padding-left: 18px; font-size: .84rem; color: var(--text-body); }
.tc-blocked-actions { display: flex; gap: 8px; flex-wrap: wrap; }

@media (max-width: 768px) {
  .tc-me { align-items: stretch; }
  .tc-me .btn { width: 100%; justify-content: center; }
}
</style>
