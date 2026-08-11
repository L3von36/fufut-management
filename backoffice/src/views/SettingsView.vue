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
          <base-button text="Export Inventory" variant="btn-secondary" extra-class="btn-sm" :on-click="() => exportTable('inventory')" />
          <base-button text="Export Staff" variant="btn-secondary" extra-class="btn-sm" :on-click="() => exportTable('staff')" />
          <base-button text="Export Expenses" variant="btn-secondary" extra-class="btn-sm" :on-click="() => exportTable('expenses')" />
        </div>
      </div>

      <!--
        The month-end hand-over §51 describes. One request returns sales,
        payments, expenses, supplier purchases and balances, tips, attendance,
        overtime, leave and payroll, so it is a download rather than eleven
        screenshots.
      -->
      <div class="card">
        <h3 style="font-size:.9rem;color:var(--text-heading);margin-bottom:16px;font-weight:600">Accountant Pack</h3>
        <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px">
          Everything the accountant needs for a period, in one download.
        </p>
        <div class="form-row">
          <div class="form-group"><label>From</label><input type="date" v-model="packFrom" /></div>
          <div class="form-group"><label>To</label><input type="date" v-model="packTo" /></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <base-button text="Download CSV bundle" variant="btn-primary" extra-class="btn-sm" :on-click="() => exportAccountantPack('csv')" />
          <base-button text="Download JSON" variant="btn-secondary" extra-class="btn-sm" :on-click="() => exportAccountantPack('json')" />
        </div>
        <p style="font-size:.72rem;color:var(--text-muted);margin-top:10px">
          Order totals include tips; trading income is total minus tip. Tips are listed separately
          because they are staff money, not sales.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { useAuthStore } from '../stores/auth'
import { API, apiGet, apiPost, isOnline, onOnlineChange, TODAY } from '../api'
import { useButtonState } from '../composables/useButtonState'
import { toCsv, download } from '../lib/csv'

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

// Defaults to the calendar month just gone, which is the period an accountant
// is almost always asking for.
const _now = new Date()
const packFrom = ref(new Date(_now.getFullYear(), _now.getMonth() - 1, 1).toISOString().slice(0, 10))
const packTo = ref(new Date(_now.getFullYear(), _now.getMonth(), 0).toISOString().slice(0, 10))

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

/**
 * Export one table.
 *
 * These buttons used to POST to `/api/export/csv`, an endpoint that has never
 * existed — so every one of them failed, and because the failure was caught and
 * toasted generically, it read as a transient problem rather than a missing
 * feature. The data is already available on the resource endpoints, which carry
 * their own role gating, so nothing new is needed server-side.
 */
async function exportTable(table) {
  try {
    const rows = await apiGet(table)
    const list = Array.isArray(rows) ? rows : (rows && rows.entries) || []
    if (!list.length) { toast(`No ${table} to export`, 'error'); return }
    download(toCsv(list), `${table}-${TODAY()}.csv`, 'text/csv;charset=utf-8')
    toast(`${list.length} ${table} row(s) exported`)
  } catch (e) {
    toast(e.message || 'Export failed', 'error')
    throw e
  }
}

/** §51's month-end hand-over, as CSVs concatenated or as the raw JSON. */
async function exportAccountantPack(format) {
  try {
    const pack = await apiGet(`reports/accountant?from=${packFrom.value}&to=${packTo.value}`)
    const stamp = `${packFrom.value}_to_${packTo.value}`

    if (format === 'json') {
      download(JSON.stringify(pack, null, 2), `fufut-accountant-${stamp}.json`, 'application/json')
      toast('Accountant pack downloaded')
      return
    }

    // One file rather than a zip: the browser can only reliably trigger a
    // single download, and a bundled zip would need a dependency for what a
    // spreadsheet opens fine as sectioned CSV.
    const sections = [
      'sales', 'payments', 'expenses', 'supplierPurchases', 'supplierBalances',
      'tips', 'attendance', 'overtime', 'leave', 'payroll',
    ]
    const parts = [`FU FUT COFFEE — accountant pack,${packFrom.value} to ${packTo.value}`, '']
    for (const key of sections) {
      const rows = pack[key] || []
      parts.push(`## ${key} (${rows.length})`)
      parts.push(rows.length ? toCsv(rows) : '(none)')
      parts.push('')
    }
    for (const note of pack.notes || []) parts.push(`# ${note}`)

    download(parts.join('\r\n'), `fufut-accountant-${stamp}.csv`, 'text/csv;charset=utf-8')
    toast('Accountant pack downloaded')
  } catch (e) {
    toast(e.message || 'Export failed', 'error')
    throw e
  }
}
</script>