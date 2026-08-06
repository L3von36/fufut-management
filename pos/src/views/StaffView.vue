<template>
  <div>
    <div class="table-toolbar"><h3>Staff</h3><button class="btn btn-primary btn-sm" @click="openAdd">+ Add Staff</button></div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Wage</th><th>Period</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="s in staff" :key="s.id">
              <td><strong>{{ s.firstName }} {{ s.lastName }}</strong></td>
              <td><span class="badge badge-new">{{ s.role }}</span></td>
              <td>{{ s.phone||'—' }}</td>
              <td>{{ s.wage?`ETB ${s.wage}`:'—' }}</td>
              <td>{{ s.wagePeriod||'—' }}</td>
              <td><span class="badge" :class="s.active!==false?'badge-ok':'badge-danger'">{{ s.active!==false?'Active':'Inactive' }}</span></td>
              <td><button class="btn btn-sm btn-ghost" @click="openEdit(s)">Edit</button><button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click="handleDelete(s)">Delete</button></td>
            </tr>
            <tr v-if="!staff.length"><td colspan="7" class="empty-state" style="padding:40px">No staff</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ staff.length }} staff</span></div>
    </div>

    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>{{ editing?'Edit':'Add' }} Staff</h3>
        <div class="form-row">
          <div class="form-group"><label>First Name</label><input v-model="form.firstName" :class="{ 'input-error': vErrors.firstName }" /><span v-if="vErrors.firstName" class="field-error">{{ vErrors.firstName }}</span></div>
          <div class="form-group"><label>Last Name</label><input v-model="form.lastName" :class="{ 'input-error': vErrors.lastName }" /><span v-if="vErrors.lastName" class="field-error">{{ vErrors.lastName }}</span></div>
        </div>
        <div class="form-group"><label>Role</label><select v-model="form.role" class="select"><option>Manager</option><option>Head Chef</option><option>Assistant Chef</option><option>Head Waiter</option><option>Cashier</option><option>Delivery Staff</option><option>Cleaner</option></select></div>
        <div class="form-group"><label>Phone</label><input v-model="form.phone" :class="{ 'input-error': vErrors.phone }" /><span v-if="vErrors.phone" class="field-error">{{ vErrors.phone }}</span></div>
        <div class="form-row">
          <div class="form-group"><label>Wage (ETB)</label><input v-model.number="form.wage" type="number" :class="{ 'input-error': vErrors.wage }" /><span v-if="vErrors.wage" class="field-error">{{ vErrors.wage }}</span></div>
          <div class="form-group"><label>Period</label><select v-model="form.wagePeriod" class="select"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
        </div>
        <div class="form-group"><label>Status</label><select v-model="form.active" class="select"><option :value="true">Active</option><option :value="false">Inactive</option></select></div>
        <div class="modal-actions"><button class="btn btn-secondary" @click="showModal=false">Cancel</button><button class="btn btn-primary" @click="saveItem">{{ editing?'Update':'Add' }}</button></div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted , inject} from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { useFormValidation } from '../composables/useFormValidation'
const toast = inject('toast')
const confirmDelete = inject('confirm')
const staff = ref([]); const showModal = ref(false); const editing = ref(null)
const form = ref({ firstName:'', lastName:'', role:'Manager', phone:'', wage:0, wagePeriod:'monthly', active:true })
const schema = {
  firstName: { required: true, label: 'First Name', max: 50 },
  lastName: { required: true, label: 'Last Name', max: 50 },
  phone: { label: 'Phone', max: 20, pattern: /^[+]?[\d\s\-]{8,20}$/, message: 'Enter a valid phone number' },
  wage: { required: true, label: 'Wage', min: 0, maxVal: 999999 }
}
const { errors: vErrors, validate } = useFormValidation(schema)
onMounted(loadData)
async function loadData() { try { staff.value = await apiGet('staff') } catch (e) { console.error(e) } }
function openAdd() { editing.value=null; form.value={firstName:'',lastName:'',role:'Manager',phone:'',wage:0,wagePeriod:'monthly',active:true}; showModal.value=true }
function openEdit(s) { editing.value=s; form.value={...s}; showModal.value=true }
async function saveItem() { if (!validate(form.value)) { toast('Please fix the errors', 'error'); return } try { if(editing.value){ await apiPut('staff/'+editing.value.id,form.value); toast('Updated') } else { await apiPost('staff',form.value); toast('Added') }; showModal.value=false; await loadData() } catch (e) { console.error(e); toast('Failed','error') } }
async function handleDelete(s) { if(!await confirmDelete(`Delete ${s.firstName} ${s.lastName}?`))return; try { await apiDelete('staff/'+s.id); toast('Deleted'); await loadData() } catch (e) { console.error(e); toast('Failed','error') } }
</script>
<style scoped>
.input-error { border-color: var(--danger) !important; }
.field-error { display: block; font-size: 0.72rem; color: var(--danger); margin-top: 2px; }
</style>
