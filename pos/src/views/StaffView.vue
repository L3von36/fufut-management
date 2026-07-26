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
          <div class="form-group"><label>First Name</label><input v-model="form.firstName" /></div>
          <div class="form-group"><label>Last Name</label><input v-model="form.lastName" /></div>
        </div>
        <div class="form-group"><label>Role</label><select v-model="form.role" class="select"><option>Manager</option><option>Head Chef</option><option>Assistant Chef</option><option>Head Waiter</option><option>Cashier</option><option>Delivery Staff</option><option>Cleaner</option></select></div>
        <div class="form-group"><label>Phone</label><input v-model="form.phone" /></div>
        <div class="form-row">
          <div class="form-group"><label>Wage (ETB)</label><input v-model.number="form.wage" type="number" /></div>
          <div class="form-group"><label>Period</label><select v-model="form.wagePeriod" class="select"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
        </div>
        <div class="form-group"><label>Status</label><select v-model="form.active" class="select"><option :value="true">Active</option><option :value="false">Inactive</option></select></div>
        <div class="modal-actions"><button class="btn btn-secondary" @click="showModal=false">Cancel</button><button class="btn btn-primary" @click="saveItem">{{ editing?'Update':'Add' }}</button></div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
const { toast } = useToast()
const staff = ref([]); const showModal = ref(false); const editing = ref(null)
const form = ref({ firstName:'', lastName:'', role:'Manager', phone:'', wage:0, wagePeriod:'monthly', active:true })
onMounted(loadData)
async function loadData() { try { staff.value = await apiGet('staff') } catch {} }
function openAdd() { editing.value=null; form.value={firstName:'',lastName:'',role:'Manager',phone:'',wage:0,wagePeriod:'monthly',active:true}; showModal.value=true }
function openEdit(s) { editing.value=s; form.value={...s}; showModal.value=true }
async function saveItem() { try { if(editing.value){ await apiPut('staff/'+editing.value.id,form.value); toast('Updated') } else { await apiPost('staff',form.value); toast('Added') }; showModal.value=false; await loadData() } catch { toast('Failed','error') } }
async function handleDelete(s) { if(!confirm(`Delete ${s.firstName} ${s.lastName}?`))return; try { await apiDelete('staff/'+s.id); toast('Deleted'); await loadData() } catch { toast('Failed','error') } }
</script>
