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
        <template #cell-staff_id="{ row }"><strong>{{ row.staffName || row.staff_id }}</strong></template>
        <template #cell-start_time="{ row }">{{ row.start_time || '—' }}</template>
        <template #cell-end_time="{ row }">{{ row.end_time || '—' }}</template>
        <template #cell-role="{ row }"><span class="badge badge-neutral">{{ row.role || '—' }}</span></template>
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
              <select v-model="form.staff_id" required class="select">
                <option value="" disabled>Select staff member...</option>
                <option v-for="s in staffList" :key="s.id" :value="s.id">{{ s.firstName }} {{ s.lastName }} ({{ s.role }})</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Start Time</label><input type="time" v-model="form.start_time" required /></div>
            <div class="form-group"><label>End Time</label><input type="time" v-model="form.end_time" /></div>
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

const toast = inject('toast')
const confirmDelete = inject('confirm')
const btnState = useButtonState({ successDuration: 2000 })
const shifts = ref([])
const staffList = ref([])
const dateFrom = ref(TODAY())
const dateTo = ref(TODAY())
const showForm = ref(false)
const editing = ref(null)
const form = ref({ date: TODAY(), staff_id: '', start_time: '09:00', end_time: '' })

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'staff_id', label: 'Staff' },
  { key: 'start_time', label: 'Start' },
  { key: 'end_time', label: 'End' },
  { key: 'role', label: 'Role' },
  { key: 'actions', label: 'Actions' },
]


onMounted(async () => {
  const d = new Date(); d.setDate(d.getDate()-7); dateFrom.value = d.toISOString().slice(0,10)
  await loadStaff()
  await loadShifts()
})

async function loadShifts() {
  try {
    const data = await apiGet('shifts')
    // Enrich rows with staff names from the local map
    if (Array.isArray(data)) {
      for (const s of data) {
        if (!s.staffName) {
          const staff = staffMap.value[s.staffId || s.staff_id]
          if (staff) s.staffName = (staff.firstName || '') + ' ' + (staff.lastName || '')
        }
      }
    }
    shifts.value = Array.isArray(data) ? data : []
  } catch (e) { console.error(e) }
}

const staffMap = ref({})
async function loadStaff() {
  try {
    const list = await apiGet('staff')
    if (Array.isArray(list)) {
      staffList.value = list
      const map = {}
      for (const s of list) map[s.id] = s
      staffMap.value = map
    }
  } catch { /* optional — dropdown will just be empty */ }
}

function editShift(s) { editing.value = s; form.value = { date: s.date, staff_id: s.staff_id || '', start_time: s.start_time || '', end_time: s.end_time || '' }; showForm.value = true }

async function saveShift() {
  btnState.setLoading()
  try {
    if (editing.value) { await apiPut('shifts', { ...form.value, id: editing.value.id }); toast('Shift updated') }
    else { await apiPost('shifts', form.value); toast('Shift added') }
    showForm.value = false; editing.value = null; form.value = { date: TODAY(), staff_id: '', start_time: '09:00', end_time: '' }
    await loadShifts()
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}

async function handleDelete(id) { if (!await confirmDelete('Delete this shift?')) return; try { await apiDelete('shifts', id); toast('Deleted'); await loadShifts() } catch (e) { toast(e.message, 'error') } }
</script>