<template>
  <div>
    <div class="table-toolbar">
      <h3>Attendance</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="staffId" class="select select-sm" style="width:auto">
          <option value="">Everyone</option>
          <option v-for="s in staff" :key="s.id" :value="s.id">{{ s.firstName }} {{ s.lastName }}</option>
        </select>
        <input type="date" v-model="from" class="input input-sm" style="width:auto" />
        <input type="date" v-model="to" class="input input-sm" style="width:auto" />
        <base-button text="Filter" variant="btn-primary" :on-click="load" loading-label="Loading..." success-label="Loaded ✓" />
      </div>
    </div>

    <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:16px">
      Lateness is judged against each person's scheduled start with a
      {{ grace }}-minute grace period. Time Clock records the stamps; this reads them.
    </p>

    <div class="summary-row">
      <div class="card stat"><div class="stat-num">{{ summary.present || 0 }}</div><div class="stat-lbl">Present</div></div>
      <div class="card stat"><div class="stat-num" :style="summary.late ? 'color:var(--warning)' : ''">{{ summary.late || 0 }}</div><div class="stat-lbl">Late</div></div>
      <div class="card stat"><div class="stat-num" :style="summary.absent ? 'color:var(--danger)' : ''">{{ summary.absent || 0 }}</div><div class="stat-lbl">Absent</div></div>
      <div class="card stat"><div class="stat-num">{{ summary['on-leave'] || 0 }}</div><div class="stat-lbl">On Leave</div></div>
      <div class="card stat"><div class="stat-num">{{ Math.round(summary.totalHours || 0) }}</div><div class="stat-lbl">Hours Worked</div></div>
      <div class="card stat"><div class="stat-num">{{ summary.totalLateMinutes || 0 }}</div><div class="stat-lbl">Late Minutes</div></div>
    </div>

    <div class="table-wrap">
      <base-table
        :columns="columns"
        :rows="entries"
        sticky-first
        caption="Attendance for the selected period"
        :empty-title="loaded ? 'No time clock entries in this period' : 'Loading…'"
      >
        <template #cell-staffName="{ row: e }">
          <strong>{{ e.staffName || e.staff_id }}</strong>
          <div v-if="e.role" style="font-size:.7rem;color:var(--text-muted)">{{ e.role }}</div>
        </template>
        <template #cell-clock_in="{ row: e }">{{ e.clock_in || '—' }}</template>
        <template #cell-clock_out="{ row: e }">{{ e.clock_out || '—' }}</template>
        <template #cell-scheduled="{ row: e }">
          <span style="font-size:.75rem;color:var(--text-muted)">
            {{ e.scheduled_start ? e.scheduled_start + '–' + (e.scheduled_end || '?') : 'not set' }}
          </span>
        </template>
        <template #cell-hoursWorked="{ row: e }">{{ e.hoursWorked || 0 }}</template>
        <template #cell-lateMinutes="{ row: e }">{{ e.lateMinutes ? e.lateMinutes + 'm' : '—' }}</template>
        <template #cell-earlyLeaveMinutes="{ row: e }">{{ e.earlyLeaveMinutes ? e.earlyLeaveMinutes + 'm' : '—' }}</template>
        <template #cell-status="{ row: e }">
          <span class="badge" :class="statusBadgeClass(e.status)">{{ statusLabel(e.status) }}</span>
        </template>
        <template #cell-actions="{ row: e }">
          <button class="btn btn-sm btn-ghost" @click="openSchedule(e)">Schedule</button>
        </template>
      </base-table>
      <div class="pagination"><span>{{ entries.length }} day(s)</span></div>
    </div>

    <!--
      A day with no scheduled start cannot be late — there is nothing to be late
      against. Setting one here re-runs the classification for that day rather
      than leaving it permanently "present" by default.
    -->
    <div v-if="scheduling" class="modal-overlay" @click.self="scheduling=null">
      <div class="modal">
        <h3>Scheduled hours</h3>
        <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px">
          {{ scheduling.staffName }} · {{ scheduling.date }}. Saving re-checks whether this day was late.
        </p>
        <div class="form-row">
          <div class="form-group"><label>Start</label><input type="time" v-model="schedForm.start" /></div>
          <div class="form-group"><label>End</label><input type="time" v-model="schedForm.end" /></div>
        </div>
        <div class="form-group"><label>Note</label><input v-model="schedForm.notes" placeholder="Optional" /></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="scheduling=null">Cancel</button>
          <button class="btn btn-primary" @click="saveSchedule">Save &amp; Re-check</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue'
import { apiGet, apiPost, TODAY } from '../api'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
import BaseButton from '../components/BaseButton.vue'
import BaseTable from '../components/BaseTable.vue'

const toast = inject('toast')

const entries = ref([])
const summary = ref({})
const staff = ref([])
const loaded = ref(false)
const grace = ref(10)
const staffId = ref('')
const to = ref(TODAY())
const from = ref(TODAY())
const scheduling = ref(null)
const schedForm = ref({ start: '', end: '', notes: '' })

const columns = [
  { key: 'date', label: 'Date', class: 'nowrap' },
  { key: 'staffName', label: 'Staff' },
  { key: 'clock_in', label: 'In' },
  { key: 'clock_out', label: 'Out' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'hoursWorked', label: 'Hours' },
  { key: 'lateMinutes', label: 'Late' },
  { key: 'earlyLeaveMinutes', label: 'Early' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: '' },
]


onMounted(() => {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  from.value = d.toISOString().slice(0, 10)
  loadGrace()
  load()
})

/**
 * The grace period is policy, not a constant. Reading it means the explanation
 * above the table always matches the rule the server actually applied.
 */
async function loadGrace() {
  try {
    const res = await apiGet('settings?category=operations')
    const row = (res.settings || []).find(s => s.key === 'attendance.late_grace_minutes')
    if (row) grace.value = Number(row.value) || 10
  } catch { /* the default in the label is the same as the server's */ }
}

async function load() {
  const params = new URLSearchParams({ from: from.value, to: to.value })
  if (staffId.value) params.set('staff_id', staffId.value)
  try {
    const [res, people] = await Promise.all([
      apiGet(`attendance?${params.toString()}`),
      staff.value.length ? Promise.resolve(staff.value) : apiGet('staff').catch(() => []),
    ])
    // `res.entries` is only safe when `res` is an object. Handed a bare array —
    // which is what several of these endpoints return — it resolves to
    // Array.prototype.entries, a *function*, and the table renders empty with
    // no error. AuditLogView already guards the same two shapes; this now
    // matches it.
    entries.value = Array.isArray(res) ? res : (res?.entries || [])
    summary.value = (Array.isArray(res) ? null : res?.summary) || {}
    if (!staff.value.length) staff.value = Array.isArray(people) ? people : []
  } catch (e) {
    console.error(e)
    toast(e.message || 'Could not load attendance', 'error')
  } finally {
    loaded.value = true
  }
}

function openSchedule(entry) {
  scheduling.value = entry
  schedForm.value = {
    start: entry.scheduled_start || '09:00',
    end: entry.scheduled_end || '17:00',
    notes: entry.notes || '',
  }
}

async function saveSchedule() {
  try {
    await apiPost(`attendance/${scheduling.value.id}/classify`, {
      scheduledStart: schedForm.value.start,
      scheduledEnd: schedForm.value.end,
      notes: schedForm.value.notes || undefined,
    })
    toast('Re-checked')
    scheduling.value = null
    await load()
  } catch (e) {
    toast(e.message || 'Could not save', 'error')
  }
}
</script>

<style scoped>
</style>
