<template>
  <div>
    <div class="table-toolbar">
      <h3>Time Clock</h3>
      <div style="display:flex;gap:10px">
        <input type="date" v-model="dateFilter" class="input input-sm" style="width:auto" />
        <button class="btn btn-primary" @click="loadTime">Filter</button>
      </div>
    </div>

    <div class="summary-grid">
      <!--
        Labelled by the date being viewed rather than "Today", because the date
        picker above changes what these count. "Today's Clocks" also showed
        entries.length — every entry ever recorded, not the day's.
      -->
      <div class="summary-card"><div class="num">{{ filtered.length }}</div><div class="lbl">Clock-ins {{ periodLabel }}</div></div>
      <div class="summary-card"><div class="num">{{ staffClockedIn }}</div><div class="lbl">Still Clocked In</div></div>
      <div class="summary-card"><div class="num">{{ totalHoursToday.toFixed(1) }}h</div><div class="lbl">Hours {{ periodLabel }}</div></div>
    </div>

    <div class="table-wrap">
      <base-table
        :columns="columns"
        :rows="filtered"
        stack-on-mobile
        caption="Time clock entries for the selected day"
        empty-title="No time entries"
        empty-hint="Nobody clocked in on this date."
      >
        <!-- The API returns snake_case; the original read only camelCase, so
             these cells were blank against real data. -->
        <template #cell-staffId="{ row }"><strong>{{ staffName(row) }}</strong></template>
        <template #cell-clockIn="{ row }">{{ row.clockIn || row.clock_in || '—' }}</template>
        <template #cell-clockOut="{ row }">{{ row.clockOut || row.clock_out || '—' }}</template>
        <template #cell-status="{ row }">
          <span class="badge" :class="isOpen(row) ? 'badge-pending' : 'badge-success'">
            {{ isOpen(row) ? 'Active' : 'Completed' }}
          </span>
        </template>
      </base-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiGet, TODAY } from '../api'
import BaseTable from '../components/BaseTable.vue'

const entries = ref([])
const staffMap = ref({})
const dateFilter = ref(TODAY())

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'staffId', label: 'Staff' },
  { key: 'clockIn', label: 'Clock In' },
  { key: 'clockOut', label: 'Clock Out' },
  { key: 'duration', label: 'Duration' },
  { key: 'status', label: 'Status' },
]

/** Still on the clock. The API uses snake_case; the view read only camelCase. */
function isOpen(e) { return !(e.clockOut || e.clock_out) }

/**
 * Resolve a timeclock entry's staff_id to a human-readable name.
 *
 * The API returns the raw auto-generated ID (e.g. "Sb4cd9bf1") which looks
 * like a phone model name. We fetch the staff list once on mount and build
 * a lookup map so the table shows "Amanuel Tadesse" instead.
 */
function staffName(row) {
  const id = row.staffId || row.staff_id
  // The API may include a joined name already
  if (row.staffName || row.name) return row.staffName || row.name
  if (!id) return '—'
  const s = staffMap.value[id]
  if (!s) return id
  return (s.firstName || s.first_name || '') + ' ' + (s.lastName || s.last_name || '')
}


/**
 * The KPIs describe the day being looked at, not always today.
 *
 * They hardcoded TODAY() while the table below them honoured `dateFilter`, so
 * picking any other date produced a header and a table describing different
 * days — with nothing saying so. Both now read `filtered`.
 */
const filtered = computed(() => entries.value.filter(e => !dateFilter.value || e.date === dateFilter.value))
const periodLabel = computed(() =>
  !dateFilter.value ? '(all dates)' : dateFilter.value === TODAY() ? 'today' : `on ${dateFilter.value}`
)
const staffClockedIn = computed(() => filtered.value.filter(e => !(e.clockOut || e.clock_out)).length)
const totalHoursToday = computed(() => filtered.value.reduce((s, e) => {
  // Seconds were dropped: "01:30:45" parsed as 1h30m, losing 45s per entry and
  // understating a busy day by minutes across a team.
  if (e.duration) {
    const [h = 0, m = 0, sec = 0] = String(e.duration).split(':').map(Number)
    return s + h + m / 60 + sec / 3600
  }
  // The API records `hours` directly; prefer it over re-parsing a display string.
  if (e.hours) return s + (parseFloat(e.hours) || 0)
  return s
}, 0))

/**
 * The screen refreshes itself while it is open.
 *
 * The floor does not wait for the manager to click Filter: somebody clocks in
 * on the POS and the entry exists the same second, but this view used to fetch
 * once on mount, so a manager watching an already-open screen never saw anyone
 * arrive or leave. There is no SSE channel for timeclock — the live stream
 * covers tables and orders only — so the screen polls instead. It pauses while
 * the tab is hidden, so a parked browser stops loading the API rather than
 * polling a screen nobody is looking at.
 */
const POLL_MS = 15000
let pollTimer = null

async function loadStaffMap() {
  try {
    const list = await apiGet('staff')
    if (Array.isArray(list)) {
      const map = {}
      for (const s of list) map[s.id] = s
      staffMap.value = map
    }
  } catch { /* staff list is optional — IDs will show as fallback */ }
}

onMounted(() => {
  loadTime()
  loadStaffMap()
  pollTimer = setInterval(() => { if (!document.hidden) loadTime() }, POLL_MS)
})
onUnmounted(() => clearInterval(pollTimer))
async function loadTime() { try { entries.value = await apiGet('timeclock') } catch (e) { console.error(e) } }
</script>
