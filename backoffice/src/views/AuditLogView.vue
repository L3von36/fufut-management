<template>
  <div>
    <div class="table-toolbar">
      <h3>Audit Log</h3>
      <div style="display:flex;gap:10px">
        <input type="date" v-model="dateFilter" class="input input-sm" style="width:auto" />
        <button class="btn btn-primary" @click="loadAudit">Filter</button>
      </div>
    </div>

    <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:16px">System actions and changes are tracked here for compliance and review.</p>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            <tr v-for="entry in filtered" :key="entry.id">
              <td style="font-family:var(--font-mono);font-size:.75rem;white-space:nowrap">{{ entry.timestamp }}</td>
              <td><strong>{{ entry.user }}</strong></td>
              <td><span class="badge" :class="entry.action === 'delete' ? 'badge-cancelled' : entry.action === 'create' ? 'badge-success' : 'badge-pending'">{{ entry.action }}</span></td>
              <td>{{ entry.entity }}</td>
              <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ entry.details || '-' }}</td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">No audit entries found</td></tr>
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

const filtered = computed(() => entries.value.filter(e => !dateFilter.value || (e.timestamp && e.timestamp.slice(0,10) === dateFilter.value)))

onMounted(loadAudit)
async function loadAudit() { try { entries.value = await apiGet('audit') } catch (e) { entries.value = []; console.error(e) } }
</script>
