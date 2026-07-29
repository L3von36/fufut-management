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
      <div class="summary-card"><div class="num">{{ entries.length }}</div><div class="lbl">Today's Clocks</div></div>
      <div class="summary-card"><div class="num">{{ staffClockedIn }}</div><div class="lbl">Currently Clocked In</div></div>
      <div class="summary-card"><div class="num">{{ totalHoursToday.toFixed(1) }}h</div><div class="lbl">Total Hours Today</div></div>
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

const filtered = computed(() => entries.value.filter(e => !dateFilter.value || e.date === dateFilter.value))
const staffClockedIn = computed(() => entries.value.filter(e => e.date === TODAY() && !e.clockOut).length)
const totalHoursToday = computed(() => entries.value.filter(e => e.date === TODAY()).reduce((s, e) => {
  if (e.duration) {
    const parts = e.duration.split(':')
    return s + parseInt(parts[0]) + parseInt(parts[1])/60
  }
  return s
}, 0))

onMounted(loadTime)
async function loadTime() { try { entries.value = await apiGet('timeclock') } catch (e) { console.error(e) } }
</script>
