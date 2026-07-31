<template>
  <div>
    <div class="table-toolbar">
      <h3>Staff Management</h3>
      <div style="display:flex;gap:10px">
        <input v-model="search" placeholder="Search..." class="input input-sm" />
        <button class="btn btn-secondary" @click="showForm=true;editing=null;form={}">+ Add Staff</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ staff.length }}</div><div class="lbl">Total Staff</div></div>
      <div class="summary-card"><div class="num">{{ activeStaff.length }}</div><div class="lbl">Active</div></div>
      <div class="summary-card"><div class="num">{{ roleCounts }}</div><div class="lbl">Roles</div></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Phone</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="s in filtered" :key="s.id">
              <td style="font-family:var(--font-mono);font-size:.78rem">{{ s.id }}</td>
              <td><strong>{{ s.firstName }} {{ s.lastName }}</strong></td>
              <td><span class="badge badge-pending">{{ s.role }}</span></td>
              <td>{{ s.phone || '-' }}</td>
              <td><span class="badge" :class="s.active !== false ? 'badge-success' : 'badge-cancelled'">{{ s.active !== false ? 'Active' : 'Inactive' }}</span></td>
              <td>
                <button class="btn btn-sm btn-ghost" @click="editStaff(s)">Edit</button>
                <base-button text="Reset PW" variant="btn-ghost" extra-class="btn-sm" :on-click="() => resetPassword(s)" />
              </td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No staff found</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit Staff' : 'Add Staff' }}</h3>
        <form @submit.prevent="saveStaff">
          <div class="form-row">
            <div class="form-group"><label>First Name</label><input v-model="form.firstName" required /></div>
            <div class="form-group"><label>Last Name</label><input v-model="form.lastName" required /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Role</label><select v-model="form.role" class="select"><option>manager</option><option>head-chef</option><option>assistant-chef</option><option>head-waiter</option><option>cashier</option><option>delivery-staff</option><option>cleaner</option></select></div>
            <div class="form-group"><label>Phone</label><input v-model="form.phone" /></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showForm=false">Cancel</button>
            <button type="submit" class="btn btn-primary" :class="{'btn-loading': btnState.isBusy(), 'btn-success-state': btnState.isSuccess(), 'btn-error-state': btnState.isError()}" :disabled="btnState.isBusy()" :aria-busy="btnState.isBusy() ? 'true' : undefined">
              <span v-if="btnState.isBusy()" class="btn-spinner" aria-hidden="true"></span>
              <span v-else-if="btnState.isSuccess()" class="btn-check" aria-hidden="true">✓</span>
              <span v-else-if="btnState.isError()" class="btn-error-icon" aria-hidden="true">!</span>
              {{ btnState.isBusy() ? 'Saving...' : btnState.isSuccess() ? 'Saved ✓' : btnState.isError() ? 'Try Again' : (editing ? 'Update' : 'Add') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut } from '../api'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const btnState = useButtonState({ successDuration: 2000 })
const staff = ref([])
const search = ref('')
const showForm = ref(false)
const editing = ref(null)
const form = ref({ firstName: '', lastName: '', role: 'waiter', phone: '' })

const filtered = computed(() => staff.value.filter(s => !search.value || s.firstName?.toLowerCase().includes(search.value.toLowerCase()) || s.lastName?.toLowerCase().includes(search.value.toLowerCase())))
const activeStaff = computed(() => staff.value.filter(s => s.active !== false))
const roleCounts = computed(() => {
  const c = {}; staff.value.forEach(s => { c[s.role] = (c[s.role]||0) + 1 })
  return Object.entries(c).map(([k,v]) => `${k}:${v}`).join(' ')
})

onMounted(loadStaff)

async function loadStaff() { try { staff.value = await apiGet('staff') } catch (e) { console.error(e) } }

function editStaff(s) { editing.value = s; form.value = { firstName: s.firstName, lastName: s.lastName, role: s.role, phone: s.phone }; showForm.value = true }

async function saveStaff() {
  btnState.setLoading()
  try {
    if (editing.value) { await apiPut('staff', { ...form.value, id: editing.value.id }); toast('Staff updated') }
    else { await apiPost('staff', form.value); toast('Staff added') }
    showForm.value = false; editing.value = null; form.value = { firstName: '', lastName: '', role: 'waiter', phone: '' }
    await loadStaff()
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}

async function resetPassword(s) {
  try { await apiPost('auth/reset-password', { staffId: s.id }); toast('Password reset to default') } catch (e) { toast(e.message, 'error') }
}
</script>