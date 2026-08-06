<template>
  <div>
    <div class="table-toolbar">
      <h3>Settings</h3>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card">
        <h3 style="font-size:.9rem;color:var(--text-heading);margin-bottom:16px;font-weight:600">Profile</h3>
        <div class="form-group"><label>Full Name</label><input :value="profile.firstName" placeholder="First Name" readonly style="margin-bottom:8px" /><input :value="profile.lastName" placeholder="Last Name" readonly /></div>
        <div class="form-group"><label>Role</label><input :value="profile.role" disabled style="opacity:.6" /></div>
        <div class="form-group"><label>Staff ID</label><input :value="profile.id" disabled style="opacity:.6" /></div>
      </div>

      <div class="card">
        <h3 style="font-size:.9rem;color:var(--text-heading);margin-bottom:16px;font-weight:600">Change Password</h3>
        <form @submit.prevent="changePassword">
          <div class="form-group"><label>Current Password</label><input v-model="pwForm.current" type="password" required /></div>
          <div class="form-group"><label>New Password</label><input v-model="pwForm.newPass" type="password" required minlength="6" /></div>
          <button type="submit" class="btn btn-primary" :class="{'btn-loading': btnState.isBusy(), 'btn-success-state': btnState.isSuccess(), 'btn-error-state': btnState.isError()}" :disabled="btnState.isBusy()" :aria-busy="btnState.isBusy() ? 'true' : undefined">
            <span v-if="btnState.isBusy()" class="btn-spinner" aria-hidden="true"></span>
            <span v-else-if="btnState.isSuccess()" class="btn-check" aria-hidden="true">✓</span>
            <span v-else-if="btnState.isError()" class="btn-error-icon" aria-hidden="true">!</span>
            {{ btnState.isBusy() ? 'Updating...' : btnState.isSuccess() ? 'Updated ✓' : btnState.isError() ? 'Try Again' : 'Update Password' }}
          </button>
        </form>
      </div>

      <div class="card">
        <h3 style="font-size:.9rem;color:var(--text-heading);margin-bottom:16px;font-weight:600">System Info</h3>
        <div style="font-size:.85rem">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--text-muted)">Server</span><span>{{ serverStatus }}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--text-muted)">Connection</span><span class="badge" :class="online ? 'badge-success' : 'badge-cancelled'">{{ online ? 'Online' : 'Offline' }}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:var(--text-muted)">Version</span><span>1.0.0</span></div>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:.9rem;color:var(--text-heading);margin-bottom:16px;font-weight:600">Export / Backup</h3>
        <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px">Download system data for backup or analysis.</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <base-button text="Export Orders" variant="btn-secondary" extra-class="btn-sm" :on-click="() => exportTable('orders')" />
          <base-button text="Export Menu" variant="btn-secondary" extra-class="btn-sm" :on-click="() => exportTable('menu')" />
          <base-button text="Export Inventory" variant="btn-secondary" extra-class="btn-sm" :on-click="() => exportTable('inventory')" />
          <base-button text="Export Staff" variant="btn-secondary" extra-class="btn-sm" :on-click="() => exportTable('staff')" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { useAuthStore } from '../stores/auth'
import { API, apiPost, isOnline, onOnlineChange } from '../api'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const btnState = useButtonState({ successDuration: 2000 })
const auth = useAuthStore()
const serverStatus = ref('Connecting...')
const online = ref(isOnline())

const profile = computed(() => ({
  firstName: auth.user?.firstName || '',
  lastName: auth.user?.lastName || '',
  role: auth.user?.role || '',
  id: auth.user?.id || ''
}))

const pwForm = ref({ current: '', newPass: '' })

onMounted(() => {
  checkServer()
  const unsub = onOnlineChange(v => { online.value = v })
})

async function checkServer() {
  try { const r = await fetch(`${API}/api/auth/me`, { credentials: 'include' }); serverStatus.value = r.ok ? 'Connected' : 'Error' }
  catch { serverStatus.value = 'Unreachable' }
}

async function changePassword() {
  btnState.setLoading()
  try {
    await apiPost('auth/change-password', { currentPassword: pwForm.value.current, newPassword: pwForm.value.newPass })
    toast('Password changed')
    pwForm.value = { current: '', newPass: '' }
    btnState.setSuccess()
  } catch (e) { toast(e.message || 'Failed', 'error'); btnState.setError(e.message) }
}

async function exportTable(table) {
  try {
    const res = await apiPost('export/csv', { table })
    if (res.csv) { const b = new Blob([res.csv], {type:'text/csv'}); const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download=table+'.csv'; a.click(); toast(table+' exported') }
  } catch (e) { toast('Export failed', 'error'); throw e }
}
</script>