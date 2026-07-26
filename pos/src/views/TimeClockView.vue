<template>
  <div>
    <div class="table-toolbar">
      <h3>Time Clock</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="staffFilter" class="select"><option value="">All Staff</option><option v-for="s in staffList" :key="s.id" :value="s.id">{{ s.firstName }} {{ s.lastName }}</option></select>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>
    <div class="summary-grid">
      <div class="summary-card"><div class="num" style="color:var(--success)">{{ clockedIn.length }}</div><div class="lbl">Clocked In</div></div>
      <div class="summary-card"><div class="num">{{ entries.length }}</div><div class="lbl">Today's Entries</div></div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Staff</th><th>Clock In</th><th>Clock Out</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="e in filteredEntries" :key="e.id">
              <td data-label="Staff"><strong>{{ e.staffName||e.name||'—' }}</strong></td>
              <td data-label="In">{{ e.clockIn?new Date(e.clockIn).toLocaleTimeString():'—' }}</td>
              <td data-label="Out">{{ e.clockOut?new Date(e.clockOut).toLocaleTimeString():'—' }}</td>
              <td data-label="Duration">{{ formatDuration(e) }}</td>
              <td data-label="Status"><span class="badge" :class="!e.clockOut?'badge-new':'badge-fulfilled'">{{ e.clockOut?'Completed':'Active' }}</span></td>
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
import { ref, computed, onMounted } from 'vue'
import { apiGet } from '../api'
const entries = ref([]); const staffList = ref([]); const staffFilter = ref('')
const clockedIn = computed(()=>entries.value.filter(e=>!e.clockOut))
const filteredEntries = computed(()=>!staffFilter.value?entries.value:entries.value.filter(e=>e.staffId===staffFilter.value||e.name===staffFilter.value))
function formatDuration(e) { if(!e.clockIn)return'—'; const start=new Date(e.clockIn); const end=e.clockOut?new Date(e.clockOut):new Date(); const ms=end-start; const h=Math.floor(ms/3600000); const m=Math.floor((ms%3600000)/60000); return `${h}h ${m}m` }
onMounted(async()=>{ try { const [t,s]=await Promise.all([apiGet('timeclock'),apiGet('staff')]); entries.value=t; staffList.value=s } catch {} })
</script>
