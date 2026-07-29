<template>
  <div>
    <div class="table-toolbar">
      <h3>Reservations</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <select v-model="filter" class="select select-sm">
          <option value="">All Statuses</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
        <span class="badge badge-muted">{{ filtered.length }} reservation(s)</span>
        <button class="btn btn-outline btn-sm" @click="loadData">⟳ Refresh</button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Date / Time</th>
              <th>Guests</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.id">
              <td><strong>{{ r.name }}</strong></td>
              <td class="contact-cell">
                <span class="contact-line">{{ r.email }}</span>
                <span class="contact-line muted">{{ r.phone }}</span>
              </td>
              <td>
                <span class="date-badge">{{ formatDate(r.date) }}</span>
                <span class="time-badge">{{ r.time }}</span>
              </td>
              <td>{{ r.guests }} <span class="muted">guest(s)</span></td>
              <td>
                <select class="status-select" :class="'status-' + (r.status||'new')" v-model="r.status" @change="updateStatus(r)">
                  <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                </select>
              </td>
              <td class="notes-cell">{{ r.notes || '—' }}</td>
              <td>
                <button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click="handleDelete(r)">Delete</button>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="7" class="empty-state" style="padding:48px;text-align:center;color:var(--text-muted)">
                <div style="font-size:2rem;margin-bottom:8px">📅</div>
                No reservations found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>{{ filtered.length }} reservation(s)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPut, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
const { toast } = useToast()

const items = ref([])
const filter = ref('')
const statuses = ['new', 'confirmed', 'seated', 'completed', 'cancelled', 'no-show']

const filtered = computed(() =>
  !filter.value ? items.value : items.value.filter(r => r.status === filter.value)
)

onMounted(loadData)

async function loadData() {
  try {
    items.value = await apiGet('reservations')
  } catch {
    toast('Failed to load reservations', 'error')
  }
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d + 'T12:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

async function updateStatus(r) {
  try {
    await apiPut('reservations/' + r.id, { status: r.status })
    toast('Status updated to ' + r.status)
  } catch {
    toast('Failed to update status', 'error')
  }
}

async function handleDelete(r) {
  if (!confirm('Delete reservation for ' + r.name + '?')) return
  try {
    await apiDelete('reservations/' + r.id)
    toast('Reservation deleted')
    await loadData()
  } catch {
    toast('Failed to delete', 'error')
  }
}
</script>

<style scoped>
.contact-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.contact-line {
  font-size: .82rem;
}
.contact-line.muted {
  color: var(--text-muted);
  font-size: .75rem;
}
.date-badge {
  font-size: .82rem;
  font-weight: 500;
}
.time-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: .75rem;
  background: var(--bg);
  color: var(--text-muted);
  font-weight: 500;
}
.muted {
  color: var(--text-muted);
  font-size: .78rem;
}
.notes-cell {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: .82rem;
  color: var(--text-muted);
}
.status-select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: .78rem;
  font-weight: 600;
  cursor: pointer;
  text-transform: capitalize;
  background: var(--bg);
}
.status-new { color: #2563eb; border-color: #93c5fd; background: #eff6ff; }
.status-confirmed { color: #16a34a; border-color: #86efac; background: #f0fdf4; }
.status-seated { color: #7c3aed; border-color: #c4b5fd; background: #f5f3ff; }
.status-completed { color: #6b7280; border-color: #d1d5db; background: #f9fafb; }
.status-cancelled { color: #dc2626; border-color: #fca5a5; background: #fef2f2; }
.status-no-show { color: #dc2626; border-color: #fca5a5; background: #fff1f0; }
</style>
