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
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Staff ID</th><th>Clock In</th><th>Clock Out</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="e in filtered" :key="e.id">
              <td>{{ e.date }}</td><td><strong>{{ e.staffId }}</strong></td>
              <td>{{ e.clockIn }}</td><td>{{ e.clockOut || '-' }}</td>
              <td>{{ e.duration || '-' }}</td>
              <td><span class="badge" :class="!e.clockOut ? 'badge-pending' : 'badge-success'">{{ !e.clockOut ? 'Active' : 'Completed' }}</span></td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No time entries</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, TODAY } from '../api'

const entries = ref([])
const dateFilter = ref(TODAY())

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
