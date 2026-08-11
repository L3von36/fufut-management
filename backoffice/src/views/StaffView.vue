<template>
  <div>
    <div class="table-toolbar">
      <h3>Staff Management</h3>
      <div style="display:flex;gap:10px">
        <input v-model="search" placeholder="Search..." class="input input-sm" />
        <button class="btn btn-secondary" @click="openAdd">+ Add Staff</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ staff.length }}</div><div class="lbl">Total Staff</div></div>
      <div class="summary-card"><div class="num">{{ activeStaff.length }}</div><div class="lbl">Active</div></div>
      <div class="summary-card"><div class="num">{{ roleCounts }}</div><div class="lbl">Roles</div></div>
    </div>

    <base-table
      :columns="columns"
      :rows="filtered"
      caption="Staff accounts and their roles"
      empty-title="No staff found"
      :empty-hint="search ? 'Try a different search.' : ''"
    >
      <template #cell-id="{ row }">
        <span style="font-family:var(--font-mono);font-size:.78rem">{{ row.id }}</span>
      </template>
      <template #cell-name="{ row }"><strong>{{ row.firstName }} {{ row.lastName }}</strong></template>
      <!--
        Sign-in is by email, so an account without one cannot log in at all. It
        used to be absent from this screen entirely, which made that failure
        invisible until the person tried.
      -->
      <template #cell-email="{ row }">
        <span v-if="row.email">{{ row.email }}</span>
        <span v-else class="badge badge-cancelled" title="This account cannot sign in">no email — cannot sign in</span>
      </template>
      <!--
        Changed in place. Opening a modal to alter one field is the slow path,
        and the modal's dropdown was the thing that appeared broken. Bound to
        canonical values, which is what the server stores and what both
        permission matrices key on.
      -->
      <template #cell-role="{ row }">
        <select
          class="select select-sm role-select"
          :value="canonical(row.role)"
          :disabled="savingRole === row.id"
          @change="changeRole(row, $event.target.value)"
        >
          <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
        <span v-if="savingRole === row.id" class="hint">saving…</span>
      </template>
      <template #cell-status="{ row }">
        <span class="badge" :class="statusBadgeClass(row.status || 'active')">{{ row.status || 'active' }}</span>
      </template>
      <template #cell-actions="{ row }">
        <button class="btn btn-sm btn-ghost" @click="editStaff(row)">Edit</button>
        <button class="btn btn-sm btn-ghost" @click="openPassword(row)">Set password</button>
      </template>
    </base-table>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit Staff' : 'Add Staff' }}</h3>
        <form @submit.prevent="saveStaff">
          <div class="form-row">
            <div class="form-group"><label>First Name</label><input v-model="form.firstName" required /></div>
            <div class="form-group"><label>Last Name</label><input v-model="form.lastName" required /></div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Email <span style="color:var(--danger)">*</span></label>
              <input v-model="form.email" type="email" required placeholder="name@fufut.coffee" />
              <span class="hint">This is what they sign in with. Without it the account cannot log in.</span>
            </div>
            <div class="form-group"><label>Phone</label><input v-model="form.phone" /></div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Role</label>
              <select v-model="form.role" class="select">
                <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select v-model="form.status" class="select"><option value="active">active</option><option value="inactive">inactive</option></select>
            </div>
          </div>
          <!--
            Optional on creation. Left blank the server generates one and it is
            shown once afterwards; typed here the manager already knows it.
            Either way the person must change it at first sign-in.
          -->
          <div class="form-group" v-if="!editing">
            <label>Password (optional)</label>
            <input v-model="form.password" type="text" autocomplete="off" placeholder="Leave blank to generate one" />
            <span class="hint">They will be asked to choose their own the first time they sign in.</span>
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

    <!-- ─── Set password ─── -->
    <div v-if="pwTarget" class="modal-overlay" @click.self="closePassword">
      <div class="modal">
        <h3>Password for {{ pwTarget.firstName }} {{ pwTarget.lastName }}</h3>

        <template v-if="!issued">
          <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px">
            They will be asked to choose their own the first time they sign in, so whatever is set
            here works exactly once. Every existing session of theirs ends immediately.
          </p>
          <div class="form-group">
            <label>New password</label>
            <input v-model="pwValue" type="text" autocomplete="off" placeholder="Leave blank to generate one" @keyup.enter="submitPassword" />
            <span class="hint">Type one you can tell them, or leave blank and the system will make one.</span>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closePassword">Cancel</button>
            <button class="btn btn-primary" @click="submitPassword">{{ pwValue ? 'Set password' : 'Generate one' }}</button>
          </div>
        </template>

        <!--
          The generated password is returned exactly once and cannot be
          retrieved. This screen used to discard it and toast "Password reset to
          default" — there is no default, so the account was locked until the
          next reset. It is now shown until explicitly dismissed.
        -->
        <template v-else>
          <div class="pw-issued">
            <div class="pw-label">{{ issued.generated ? 'Generated password — shown once' : 'Password set' }}</div>
            <div v-if="issued.temporaryPassword" class="pw-value">{{ issued.temporaryPassword }}</div>
            <div v-else class="pw-value pw-known">the one you typed</div>
          </div>
          <p v-if="issued.generated" style="font-size:.8rem;color:var(--danger);margin:10px 0 0">
            Write this down or copy it now. It cannot be shown again — the only way back is another reset.
          </p>
          <p style="font-size:.8rem;color:var(--text-muted);margin:6px 0 0">{{ issued.note }}</p>
          <div class="modal-actions">
            <button v-if="issued.temporaryPassword" class="btn btn-secondary" @click="copyPassword">{{ copied ? 'Copied ✓' : 'Copy' }}</button>
            <button class="btn btn-primary" @click="closePassword">Done</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut } from '../api'
import { useButtonState } from '../composables/useButtonState'
import BaseTable from '../components/BaseTable.vue'
import { statusBadgeClass } from '../composables/useStatusBadge'

const toast = inject('toast')
const btnState = useButtonState({ successDuration: 2000 })
const staff = ref([])
const search = ref('')
const showForm = ref(false)
const editing = ref(null)
const form = ref(blankForm())
const pwTarget = ref(null)
const pwValue = ref('')
const issued = ref(null)
const copied = ref(false)
const savingRole = ref(null)

/**
 * Canonical value, readable label.
 *
 * The value is what the server stores and what both permission matrices key on;
 * the label is what a manager should be reading. Previously the options were
 * raw canonical strings and the stored roles were title case, so nothing
 * matched and every dropdown rendered blank.
 */
const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'head-chef', label: 'Head Chef' },
  { value: 'assistant-chef', label: 'Assistant Chef' },
  { value: 'head-waiter', label: 'Head Waiter' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'delivery-staff', label: 'Delivery Staff' },
  { value: 'cleaner', label: 'Cleaner' },
  { value: 'accountant', label: 'Accountant' },
]

/**
 * Tolerate whatever is stored. The server normalises on write now, but rows
 * written before that still hold "Head Chef", and a dropdown that cannot
 * display an existing value is the bug this replaces.
 */
function canonical(role) {
  const key = String(role || '').trim().toLowerCase().replace(/[\s_]+/g, '-')
  return ROLES.some(r => r.value === key) ? key : ''
}

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email (sign-in)' },
  { key: 'role', label: 'Role' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions' },
]

function blankForm() {
  return { firstName: '', lastName: '', email: '', role: 'cashier', phone: '', status: 'active', password: '' }
}

const filtered = computed(() => staff.value.filter(s => !search.value || s.firstName?.toLowerCase().includes(search.value.toLowerCase()) || s.lastName?.toLowerCase().includes(search.value.toLowerCase())))
const activeStaff = computed(() => staff.value.filter(s => s.active !== false))
const roleCounts = computed(() => {
  const c = {}; staff.value.forEach(s => { c[s.role] = (c[s.role]||0) + 1 })
  return Object.entries(c).map(([k,v]) => `${k}:${v}`).join(' ')
})

onMounted(loadStaff)

async function loadStaff() { try { staff.value = await apiGet('staff') } catch (e) { console.error(e) } }

function editStaff(s) {
  editing.value = s
  form.value = {
    ...blankForm(),
    firstName: s.firstName, lastName: s.lastName, email: s.email || '',
    // Canonicalised, or a row still holding "Head Chef" selects nothing and the
    // dropdown reads blank — the defect that made this look like no feature.
    role: canonical(s.role) || 'cashier',
    phone: s.phone || '', status: s.status || 'active',
  }
  showForm.value = true
}

function openAdd() { editing.value = null; form.value = blankForm(); showForm.value = true }

/**
 * Change one person's role from the table.
 *
 * Sends only the id and the role, so an inline change cannot carry stale values
 * for the other fields from whenever this list was loaded. Reverts the row on
 * failure rather than leaving the screen showing a change the server refused.
 */
async function changeRole(s, role) {
  const previous = canonical(s.role)
  if (!role || role === previous) return
  savingRole.value = s.id
  try {
    await apiPut('staff', { id: s.id, role })
    s.role = role
    const label = ROLES.find(r => r.value === role)?.label || role
    toast(`${s.firstName} is now ${label}`)
  } catch (e) {
    s.role = previous
    toast(e.message || 'Could not change the role', 'error')
    await loadStaff()
  } finally {
    savingRole.value = null
  }
}

async function saveStaff() {
  if (!form.value.email) { toast('An email is required — it is what they sign in with', 'error'); return }
  btnState.setLoading()
  try {
    if (editing.value) {
      // The server refuses a password on a staff update; there is exactly one
      // path to a credential and it is the reset endpoint, which is audited.
      const { password, ...fields } = form.value
      await apiPut('staff', { ...fields, id: editing.value.id })
      toast('Staff updated')
      showForm.value = false
    } else {
      const res = await apiPost('staff', form.value)
      showForm.value = false
      // A generated password comes back exactly once. Show it rather than
      // toasting past it, or the account is unusable from the moment it exists.
      if (res && res.temporaryPassword) {
        pwTarget.value = { firstName: form.value.firstName, lastName: form.value.lastName, id: res.id }
        issued.value = { temporaryPassword: res.temporaryPassword, generated: true, note: 'Give this to them in person. They will choose their own at first sign-in.' }
      } else {
        toast('Staff added')
      }
    }
    editing.value = null
    form.value = blankForm()
    await loadStaff()
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}

function openPassword(s) { pwTarget.value = s; pwValue.value = ''; issued.value = null; copied.value = false }

function closePassword() { pwTarget.value = null; pwValue.value = ''; issued.value = null; copied.value = false }

/**
 * Either set a chosen password or have one generated.
 *
 * The result is held on screen until dismissed. The previous version awaited
 * this call and threw the response away, so the one-time password the server
 * returned was lost the instant it arrived — leaving the person unable to sign
 * in, with a toast claiming it had been "reset to default".
 */
async function submitPassword() {
  try {
    const res = await apiPost('auth/reset-password', {
      staffId: pwTarget.value.id,
      newPassword: pwValue.value || undefined,
    })
    issued.value = res
    await loadStaff()
  } catch (e) { toast(e.message, 'error') }
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(issued.value.temporaryPassword)
    copied.value = true
  } catch { toast('Could not copy — write it down instead', 'error') }
}
</script>

<style scoped>
.hint { display: block; font-size: .72rem; color: var(--text-muted); margin-top: 3px; }
.role-select { width: auto; min-width: 140px; }
.pw-issued {
  margin: 12px 0; padding: 16px; border-radius: 8px; text-align: center;
  background: var(--surface-2, rgba(0,0,0,.05)); border: 1px solid var(--border, #ddd);
}
.pw-label { font-size: .74rem; color: var(--text-muted); margin-bottom: 6px; }
/* Monospace and spaced: this gets read aloud across a room and typed on a
   tablet, so l/1 and O/0 have to be distinguishable. */
.pw-value {
  font-family: var(--font-mono, monospace); font-size: 1.5rem; font-weight: 700;
  letter-spacing: .12em; word-break: break-all;
}
.pw-known { font-size: 1rem; font-weight: 400; color: var(--text-muted); letter-spacing: normal; }
</style>