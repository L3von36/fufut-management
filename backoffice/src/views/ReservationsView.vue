<template>
  <div>
    <div class="table-toolbar">
      <h3>Reservations</h3>
      <div style="display:flex;gap:10px">
        <input type="date" v-model="dateFilter" class="input input-sm" style="width:auto" />
        <select v-model="statusFilter" class="select select-sm" style="width:auto">
          <option value="">All Status</option><option>new</option><option>confirmed</option><option>cancelled</option><option>completed</option>
        </select>
        <button class="btn btn-primary" @click="loadReservations">Filter</button>
        <button class="btn btn-secondary" @click="showForm=true;editing=null;form={}">+ Add</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ filtered.length }}</div><div class="lbl">Total</div></div>
      <div class="summary-card"><div class="num">{{ filtered.filter(r => r.status === 'new').length }}</div><div class="lbl">New</div></div>
      <div class="summary-card"><div class="num">{{ filtered.filter(r => r.status === 'confirmed').length }}</div><div class="lbl">Confirmed</div></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Guest</th><th>Party</th><th>Table</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.id">
              <td>{{ r.date }}</td><td>{{ r.time }}</td><td><strong>{{ r.name }}</strong></td>
              <td>{{ r.guests }}</td><td>{{ r.tableId || '-' }}</td>
              <td><span class="badge" :class="statusBadgeClass(r.status)">{{ statusLabel(r.status) }}</span></td>
              <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.notes || '-' }}</td>
              <td><button class="btn btn-sm btn-ghost" @click="editRes(r)">Edit</button><base-button text="Delete" variant="btn-ghost" extra-class="btn-sm" :on-click="() => deleteRes(r.id)" /></td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No reservations</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit Reservation' : 'Add Reservation' }}</h3>
        <form @submit.prevent="saveRes">
          <div class="form-row">
            <div class="form-group"><label>Name</label><input v-model="form.name" required /></div>
            <div class="form-group"><label>Guests</label><input type="number" v-model.number="form.guests" min="1" required /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Date</label><input type="date" v-model="form.date" required /></div>
            <div class="form-group"><label>Time</label><input type="time" v-model="form.time" required /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Table ID</label><input v-model="form.tableId" /></div>
            <div class="form-group"><label>Status</label><select v-model="form.status" class="select"><option>new</option><option>confirmed</option><option>cancelled</option><option>completed</option></select></div>
          </div>
          <div class="form-group"><label>Notes</label><input v-model="form.notes" /></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showForm=false">Cancel</button>
            <button type="submit" class="btn btn-primary" :class="{'btn-loading': btnState.isBusy(), 'btn-success-state': btnState.isSuccess(), 'btn-error-state': btnState.isError()}" :disabled="btnState.isBusy()" :aria-busy="btnState.isBusy() ? 'true' : undefined">
              <span v-if="btnState.isBusy()" class="btn-spinner" aria-hidden="true"></span>
              <span v-else-if="btnState.isSuccess()" class="btn-check" aria-hidden="true">✓</span>
              <span v-else-if="btnState.isError()" class="btn-error-icon" aria-hidden="true">!</span>
              {{ btnState.isBusy() ? 'Saving...' : btnState.isSuccess() ? 'Saved ✓' : btnState.isError() ? 'Try Again' : (editing ? 'Update' : 'Save') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete, TODAY } from '../api'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const confirmDelete = inject('confirm')
const btnState = useButtonState({ successDuration: 2000 })
const reservations = ref([])
const dateFilter = ref(TODAY())
const statusFilter = ref('')
const showForm = ref(false)
const editing = ref(null)
const form = ref({ name: '', guests: 2, date: TODAY(), time: '19:00', tableId: '', status: 'new', notes: '' })

const filtered = computed(() => reservations.value.filter(r => {
  if (dateFilter.value && r.date !== dateFilter.value) return false
  if (statusFilter.value && r.status !== statusFilter.value) return false
  return true
}))

onMounted(loadReservations)
async function loadReservations() { try { reservations.value = await apiGet('reservations') } catch (e) { console.error(e) } }
function editRes(r) { editing.value = r; form.value = { ...r }; showForm.value = true }

async function saveRes() {
  btnState.setLoading()
  try {
    if (editing.value) { await apiPut('reservations', { ...form.value, id: editing.value.id }); toast('Updated') }
    else { await apiPost('reservations', form.value); toast('Reservation added') }
    showForm.value = false; editing.value = null; form.value = { name: '', guests: 2, date: TODAY(), time: '19:00', tableId: '', status: 'new', notes: '' }
    await loadReservations()
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}
async function deleteRes(id) { if (!await confirmDelete('Delete this reservation?')) return; try { await apiDelete('reservations', id); toast('Deleted'); await loadReservations() } catch (e) { toast(e.message, 'error') } }
</script>