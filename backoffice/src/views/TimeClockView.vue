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
        caption="Time clock entries for the selected day"
        empty-title="No time entries"
        empty-hint="Nobody clocked in on this date."
      >
        <!-- The API returns snake_case; the original read only camelCase, so
             these cells were blank against real data. -->
        <template #cell-staffId="{ row }"><strong>{{ row.staffId || row.staff_id }}</strong></template>
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
import { ref, computed, onMounted } from 'vue'
import { apiGet, TODAY } from '../api'
import BaseTable from '../components/BaseTable.vue'

const entries = ref([])
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

onMounted(loadTime)
async function loadTime() { try { entries.value = await apiGet('timeclock') } catch (e) { console.error(e) } }
</script>
