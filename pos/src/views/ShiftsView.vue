<template>
  <div>
    <div class="table-toolbar">
      <h3>Shifts</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="filter" class="select"><option value="">All</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select>
        <button class="btn btn-primary" @click="openAdd">+ Add Shift</button>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Staff</th><th>Role</th><th>Shift</th><th>Date</th><th>Start</th><th>End</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="s in filteredShifts" :key="s.id">
              <td data-label="Staff"><strong>{{ s.staffName||s.staff||'—' }}</strong></td>
              <td data-label="Role">{{ s.role||'—' }}</td>
              <td data-label="Shift">{{ s.shift||s.type||'—' }}</td>
              <td data-label="Date">{{ s.date||'—' }}</td>
              <td data-label="Start">{{ s.start||'—' }}</td>
              <td data-label="End">{{ s.end||'—' }}</td>
              <td data-label="Actions"><button class="btn btn-sm btn-ghost" @click="openEdit(s)">Edit</button><button class="btn btn-sm btn-ghost danger" @click="handleDelete(s)">Delete</button></td>
            </tr>
            <tr v-if="!filteredShifts.length"><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No shifts</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredShifts.length }} shift(s)</span></div>
    </div>
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>{{ editing?'Edit':'Add' }} Shift</h3>
        <p class="modal-sub">{{ editing?'Update shift':'Schedule a shift' }}</p>
        <div class="form-group"><label>Staff Name</label><input v-model="form.staffName" :class="{ 'input-error': vErrors.staffName }" /><span v-if="vErrors.staffName" class="field-error">{{ vErrors.staffName }}</span></div>
        <div class="form-row">
          <div class="form-group"><label>Shift Type</label><select v-model="form.shift" class="select" :class="{ 'input-error': vErrors.shift }"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></div>
          <span v-if="vErrors.shift" class="field-error">{{ vErrors.shift }}</span>
          <div class="form-group"><label>Date</label><input v-model="form.date" type="date" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Start</label><input v-model="form.start" type="time" :class="{ 'input-error': vErrors.start }" /><span v-if="vErrors.start" class="field-error">{{ vErrors.start }}</span></div>
          <div class="form-group"><label>End</label><input v-model="form.end" type="time" :class="{ 'input-error': vErrors.end }" /><span v-if="vErrors.end" class="field-error">{{ vErrors.end }}</span></div>
        </div>
        <div class="modal-actions"><button class="btn btn-secondary" @click="showModal=false">Cancel</button><button class="btn btn-primary" @click="saveItem">{{ editing?'Update':'Add' }}</button></div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
import { useFormValidation } from '../composables/useFormValidation'
const { toast } = useToast()
const schema = {
  staffName: { required: true, label: 'Staff Name', max: 100 },
  shift: { required: true, label: 'Shift Type' },
  start: { required: true, label: 'Start Time' },
  end: { required: true, label: 'End Time' }
}
const { errors: vErrors, validate } = useFormValidation(schema)
const shifts = ref([]); const filter = ref(''); const showModal = ref(false); const editing = ref(null)
const form = ref({ staffName:'', shift:'morning', date:'', start:'09:00', end:'17:00' })
const filteredShifts = computed(()=>!filter.value?shifts.value:shifts.value.filter(s=>(s.shift||s.type)===filter.value))
onMounted(()=>{form.value.date=new Date().toISOString().slice(0,10); loadData()})
async function loadData() { try { shifts.value = await apiGet('shifts') } catch (e) { console.error(e) } }
function openAdd() { editing.value=null; form.value={staffName:'',shift:'morning',date:new Date().toISOString().slice(0,10),start:'09:00',end:'17:00'}; showModal.value=true }
function openEdit(s) { editing.value=s; form.value={...s}; showModal.value=true }
async function saveItem() { if (!validate(form.value)) { toast('Please fix the errors', 'error'); return } try { if(editing.value){ await apiPut('shifts/'+editing.value.id,form.value); toast('Updated') } else { await apiPost('shifts',form.value); toast('Added') }; showModal.value=false; await loadData() } catch (e) { console.error(e); toast('Failed','error') } }
async function handleDelete(s) { if(!confirm('Delete?'))return; try { await apiDelete('shifts/'+s.id); toast('Deleted'); await loadData() } catch (e) { console.error(e); toast('Failed','error') } }
</script>
<style scoped>
.input-error { border-color: var(--danger, #e74c3c) !important; }
.field-error { display: block; color: var(--danger, #e74c3c); font-size: 0.75rem; margin-top: 2px; }
</style>
