<template>
  <div>
    <div class="table-toolbar">
      <h3>Shifts</h3>
      <div style="display:flex;gap:10px">
        <input type="date" v-model="dateFrom" class="input input-sm" style="width:auto" />
        <input type="date" v-model="dateTo" class="input input-sm" style="width:auto" />
        <button class="btn btn-primary" @click="loadShifts">Filter</button>
        <button class="btn btn-secondary" @click="showForm=true;editing=null;form={}">+ Add Shift</button>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Staff</th><th>Start</th><th>End</th><th>Role</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="s in shifts" :key="s.id">
              <td>{{ s.date }}</td><td><strong>{{ s.staffName || s.staffId }}</strong></td>
              <td>{{ s.start }}</td><td>{{ s.end || '-' }}</td>
              <td><span class="badge badge-pending">{{ s.role || '-' }}</span></td>
              <td><button class="btn btn-sm btn-ghost" @click="editShift(s)">Edit</button><base-button text="Delete" variant="btn-ghost" extra-class="btn-sm" :on-click="() => handleDelete(s.id)" /></td>
            </tr>
            <tr v-if="!shifts.length"><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No shifts found</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit Shift' : 'Add Shift' }}</h3>
        <form @submit.prevent="saveShift">
          <div class="form-row">
            <div class="form-group"><label>Date</label><input type="date" v-model="form.date" required /></div>
            <div class="form-group"><label>Staff ID</label><input v-model="form.staffId" required /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Start Time</label><input type="time" v-model="form.start" required /></div>
            <div class="form-group"><label>End Time</label><input type="time" v-model="form.end" /></div>
          </div>
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
import { ref, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete, TODAY } from '../api'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const confirmDelete = inject('confirm')
const btnState = useButtonState({ successDuration: 2000 })
const shifts = ref([])
const dateFrom = ref(TODAY())
const dateTo = ref(TODAY())
const showForm = ref(false)
const editing = ref(null)
const form = ref({ date: TODAY(), staffId: '', start: '09:00', end: '' })

onMounted(() => { const d = new Date(); d.setDate(d.getDate()-7); dateFrom.value = d.toISOString().slice(0,10); loadShifts() })

async function loadShifts() { try { shifts.value = await apiGet('shifts') } catch (e) { console.error(e) } }

function editShift(s) { editing.value = s; form.value = { date: s.date, staffId: s.staffId, start: s.start, end: s.end || '' }; showForm.value = true }

async function saveShift() {
  btnState.setLoading()
  try {
    if (editing.value) { await apiPut('shifts', { ...form.value, id: editing.value.id }); toast('Shift updated') }
    else { await apiPost('shifts', form.value); toast('Shift added') }
    showForm.value = false; editing.value = null; form.value = { date: TODAY(), staffId: '', start: '09:00', end: '' }
    await loadShifts()
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}

async function handleDelete(id) { if (!await confirmDelete('Delete this shift?')) return; try { await apiDelete('shifts', id); toast('Deleted'); await loadShifts() } catch (e) { toast(e.message, 'error') } }
</script>