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
      <base-table
        :columns="columns"
        :rows="filtered"
        caption="Table reservations"
        empty-title="No reservations"
        empty-hint="Bookings appear here once taken."
      >
        <template #cell-name="{ row }"><strong>{{ row.name }}</strong></template>
        <template #cell-status="{ row }">
          <span class="badge" :class="statusBadgeClass(row.status)">{{ statusLabel(row.status) }}</span>
        </template>
        <!-- title, so a truncated note can still be read rather than lost -->
        <template #cell-notes="{ row }">
          <span class="truncate" :title="row.notes">{{ row.notes || '—' }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button class="btn btn-sm btn-ghost" @click="editRes(row)">Edit</button>
          <base-button text="Delete" variant="btn-ghost" extra-class="btn-sm" :on-click="() => deleteRes(row.id)" />
        </template>
      </base-table>
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
import BaseTable from '../components/BaseTable.vue'
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

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'name', label: 'Guest' },
  { key: 'guests', label: 'Party' },
  { key: 'tableId', label: 'Table' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },
  { key: 'actions', label: 'Actions' },
]


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