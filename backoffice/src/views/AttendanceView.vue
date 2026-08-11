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
      <div class="table-scroll table-sticky-first">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Staff</th><th>In</th><th>Out</th>
              <th>Scheduled</th><th>Hours</th><th>Late</th><th>Early</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td style="white-space:nowrap">{{ e.date }}</td>
              <td><strong>{{ e.staffName || e.staff_id }}</strong>
                <div v-if="e.role" style="font-size:.7rem;color:var(--text-muted)">{{ e.role }}</div>
              </td>
              <td>{{ e.clock_in || '—' }}</td>
              <td>{{ e.clock_out || '—' }}</td>
              <td style="font-size:.75rem;color:var(--text-muted)">
                {{ e.scheduled_start ? e.scheduled_start + '–' + (e.scheduled_end || '?') : 'not set' }}
              </td>
              <td>{{ e.hoursWorked || 0 }}</td>
              <td>{{ e.lateMinutes ? e.lateMinutes + 'm' : '—' }}</td>
              <td>{{ e.earlyLeaveMinutes ? e.earlyLeaveMinutes + 'm' : '—' }}</td>
              <td><span class="badge" :class="statusClass(e.status)">{{ e.status }}</span></td>
              <td><button class="btn btn-sm btn-ghost" @click="openSchedule(e)">Schedule</button></td>
            </tr>
            <tr v-if="!entries.length">
              <td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted)">
                {{ loaded ? 'No time clock entries in this period' : 'Loading…' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
import BaseButton from '../components/BaseButton.vue'

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

function statusClass(s) {
  if (s === 'absent') return 'badge-cancelled'
  if (s === 'late' || s === 'early-departure') return 'badge-pending'
  if (s === 'on-leave') return 'badge-pending'
  return 'badge-success'
}

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
    entries.value = res.entries || []
    summary.value = res.summary || {}
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
