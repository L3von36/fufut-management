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
      <base-table
        :columns="columns"
        :rows="shifts"
        stack-on-mobile
        caption="Rostered shifts"
        empty-title="No shifts found"
        empty-hint="Add a shift to build the roster."
      >
        <template #cell-staffName="{ row }"><strong>{{ staffNames[row.staff_id] || row.staffName || row.staff_id }}</strong></template>
        <template #cell-role="{ row }"><span class="badge badge-neutral">{{ roleLabel(row.role) || '—' }}</span></template>
        <template #cell-actions="{ row }">
          <button class="btn btn-sm btn-ghost" @click="editShift(row)">Edit</button>
          <base-button text="Delete" variant="btn-ghost" extra-class="btn-sm" :on-click="() => handleDelete(row.id)" />
        </template>
      </base-table>
    </div>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit Shift' : 'Add Shift' }}</h3>
        <form @submit.prevent="saveShift">
          <div class="form-row">
            <div class="form-group"><label>Date</label><input type="date" v-model="form.date" required /></div>
            <div class="form-group">
              <label>Staff</label>
              <select v-model="form.staffId" required>
                <option value="" disabled>Select staff</option>
                <option v-for="s in staffList" :key="s.id" :value="s.id">{{ s.firstName }} {{ s.lastName }} ({{ roleLabel(s.role) || s.role }})</option>
              </select>
            </div>
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
import BaseTable from '../components/BaseTable.vue'
import { useButtonState } from '../composables/useButtonState'
import { roleLabel } from '../lib/formatters'

const toast = inject('toast')
const confirmDelete = inject('confirm')
const btnState = useButtonState({ successDuration: 2000 })
const shifts = ref([])
const staffNames = ref({})
const staffList = ref([])
const dateFrom = ref(TODAY())
const dateTo = ref(TODAY())
const showForm = ref(false)
const editing = ref(null)
const form = ref({ date: TODAY(), staffId: '', start: '09:00', end: '' })

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'staffName', label: 'Staff' },
  { key: 'start_time', label: 'Start' },
  { key: 'end_time', label: 'End' },
  { key: 'role', label: 'Role' },
  { key: 'actions', label: 'Actions' },
]

onMounted(async () => {
  const d = new Date(); d.setDate(d.getDate()-7); dateFrom.value = d.toISOString().slice(0,10)
  try {
    const staff = await apiGet('staff')
    staffList.value = staff
    for (const s of staff) staffNames.value[s.id] = [s.firstName, s.lastName].filter(Boolean).join(' ')
  } catch { /* staff list unavailable */ }
  await loadShifts()
})

async function loadShifts() {
  try { shifts.value = await apiGet('shifts') }
  catch (e) { console.error(e) }
}

function editShift(s) {
  editing.value = s
  form.value = { date: s.date, staffId: s.staff_id, start: s.start_time, end: s.end_time || '' }
  showForm.value = true
}

async function saveShift() {
  btnState.setLoading()
  try {
    const payload = {
      date: form.value.date,
      staff_id: form.value.staffId,
      start_time: form.value.start,
      end_time: form.value.end || null,
      role: form.value.role || null,
    }
    if (editing.value) { await apiPut('shifts', { ...payload, id: editing.value.id }); toast('Shift updated') }
    else { await apiPost('shifts', payload); toast('Shift added') }
    showForm.value = false; editing.value = null
    form.value = { date: TODAY(), staffId: '', start: '09:00', end: '' }
    await loadShifts()
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}

async function handleDelete(id) {
  if (!await confirmDelete('Delete this shift?')) return
  try { await apiDelete('shifts', id); toast('Deleted'); await loadShifts() }
  catch (e) { toast(e.message, 'error') }
}
</script>