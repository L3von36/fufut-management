<template>
  <div>
    <div class="table-toolbar">
      <h3>Leave, Overtime &amp; Adjustments</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="statusFilter" class="select select-sm" style="width:auto">
          <option value="pending">Awaiting decision</option>
          <option value="">All</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button class="btn btn-secondary" @click="openNew">+ New</button>
        <base-button text="Refresh" variant="btn-primary" :on-click="load" loading-label="Loading..." success-label="Loaded ✓" />
      </div>
    </div>

    <div class="tabs">
      <button v-for="t in TABS" :key="t.key" class="tab" :class="{ active: tab === t.key }" @click="select(t.key)">
        {{ t.label }}
        <span v-if="pendingCount(t.key)" class="tab-badge">{{ pendingCount(t.key) }}</span>
      </button>
    </div>

    <!--
      Approval is the control these records exist for, so the rule is stated
      where the buttons are rather than only enforced on the server.
    -->
    <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:16px">
      You cannot approve your own request — somebody else has to. Rejecting requires a reason.
    </p>

    <!--
      One table, three shapes. All three tabs are row-per-record with the same
      staff / reason / status / decide columns; only the middle differs. Three
      near-identical copies is how the reject button ended up wired to a
      different resource per copy, so the columns vary by tab and the markup
      does not.
    -->
    <base-table
      :columns="columns"
      :rows="rows"
      stack-on-mobile
      :caption="`${TABS.find(t => t.key === tab).label} requests`"
      :empty-title="emptyText"
    >
      <template #cell-staff_name="{ row }"><strong>{{ row.staff_name || row.staff_id }}</strong></template>
      <template #cell-kind="{ row }">{{ (row.kind || 'normal').replace('_', ' ') }}</template>
      <template #cell-paid="{ row }">{{ row.paid ? 'Paid' : 'Unpaid' }}</template>
      <template #cell-taxable="{ row }">{{ row.taxable ? 'Yes' : 'No' }}</template>
      <template #cell-rate="{ row }">
        <span style="font-size:.78rem;color:var(--text-muted)">
          {{ row.hourly_rate ? 'ETB ' + Math.round(row.hourly_rate) + ' × ' + row.multiplier : '—' }}
        </span>
      </template>
      <template #cell-otAmount="{ row }"><strong>ETB {{ Math.round(row.amount || 0) }}</strong></template>
      <!-- Sign carries the meaning: a deduction is stored negative. -->
      <template #cell-amount="{ row }">
        <strong :style="{ color: row.amount < 0 ? 'var(--danger)' : 'var(--success)' }">
          {{ row.amount < 0 ? '−' : '+' }}ETB {{ Math.abs(Math.round(row.amount || 0)) }}
        </strong>
      </template>
      <template #cell-reason="{ row }">
        <span class="truncate" :title="row.reason" style="font-size:.78rem">{{ row.reason || '—' }}</span>
      </template>
      <template #cell-status="{ row }">
        <span class="badge" :class="statusBadgeClass(row.status)">{{ statusLabel(row.status) }}</span>
      </template>
      <template #cell-actions="{ row }">
        <div style="display:flex;gap:4px" v-if="row.status === 'pending'">
          <button class="btn btn-sm btn-primary" @click="decide(tab, row, true)">Approve</button>
          <button class="btn btn-sm btn-ghost" @click="openReject(tab, row)">Reject</button>
        </div>
      </template>
    </base-table>

    <!-- ─── New request ─── -->
    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>New {{ TABS.find(t => t.key === tab).singular }}</h3>
        <div class="form-group">
          <label>Staff</label>
          <select v-model="form.staffId" class="select">
            <option value="">Choose…</option>
            <option v-for="s in staff" :key="s.id" :value="s.id">{{ s.firstName }} {{ s.lastName }}</option>
          </select>
        </div>

        <template v-if="tab === 'leave'">
          <div class="form-row">
            <div class="form-group">
              <label>Type</label>
              <select v-model="form.type" class="select">
                <option value="annual">Annual</option><option value="sick">Sick</option>
                <option value="unpaid">Unpaid</option><option value="maternity">Maternity</option>
                <option value="bereavement">Bereavement</option>
              </select>
            </div>
            <div class="form-group">
              <label>Paid</label>
              <select v-model="form.paid" class="select">
                <option :value="true">Paid</option><option :value="false">Unpaid</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>From</label><input type="date" v-model="form.startDate" /></div>
            <div class="form-group"><label>To</label><input type="date" v-model="form.endDate" /></div>
          </div>
        </template>

        <template v-if="tab === 'overtime'">
          <div class="form-row">
            <div class="form-group"><label>Date</label><input type="date" v-model="form.date" /></div>
            <div class="form-group"><label>Hours</label><input type="number" step="0.25" min="0" v-model.number="form.hours" /></div>
          </div>
          <div class="form-group">
            <label>Kind</label>
            <select v-model="form.kind" class="select">
              <option value="normal">Normal</option><option value="night">Night</option>
              <option value="rest_day">Rest day</option><option value="public_holiday">Public holiday</option>
            </select>
            <span class="hint">The multiplier is taken from Settings and stored on the claim, so a later rate change cannot alter it.</span>
          </div>
        </template>

        <template v-if="tab === 'adjustments'">
          <div class="form-row">
            <div class="form-group">
              <label>Type</label>
              <select v-model="form.type" class="select">
                <option value="bonus">Bonus</option><option value="deduction">Deduction</option>
                <option value="advance">Salary advance</option><option value="reimbursement">Reimbursement</option>
                <option value="penalty">Penalty</option>
              </select>
            </div>
            <div class="form-group"><label>Amount (ETB)</label><input type="number" step="any" min="0" v-model.number="form.amount" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Date</label><input type="date" v-model="form.date" /></div>
            <div class="form-group">
              <label>Taxable</label>
              <select v-model="form.taxable" class="select">
                <option :value="true">Taxable</option><option :value="false">Not taxable</option>
              </select>
            </div>
          </div>
          <p class="hint">
            Enter a positive amount. Deductions, advances and penalties are stored as negative
            automatically — the sign comes from the type, not from what is typed.
          </p>
        </template>

        <div class="form-group"><label>Reason</label><input v-model="form.reason" :placeholder="tab === 'adjustments' ? 'Required' : 'Optional'" /></div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showForm=false">Cancel</button>
          <button class="btn btn-primary" @click="save">Submit</button>
        </div>
      </div>
    </div>

    <!-- ─── Reject ─── -->
    <div v-if="rejecting" class="modal-overlay" @click.self="rejecting=null">
      <div class="modal">
        <h3>Reject</h3>
        <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px">
          {{ rejecting.row.staff_name }} — a reason is recorded against the decision and is required.
        </p>
        <div class="form-group"><label>Reason</label><input v-model="rejectReason" /></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="rejecting=null">Cancel</button>
          <button class="btn btn-primary" :disabled="!rejectReason" @click="confirmReject">Reject</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, TODAY } from '../api'
import BaseTable from '../components/BaseTable.vue'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
import BaseButton from '../components/BaseButton.vue'

const toast = inject('toast')

/** One shape, three record types — the approval flow is identical for each. */
const TABS = [
  { key: 'leave', label: 'Leave', singular: 'leave request' },
  { key: 'overtime', label: 'Overtime', singular: 'overtime claim' },
  { key: 'adjustments', label: 'Bonuses & Deductions', singular: 'adjustment' },
]

const tab = ref('leave')
const rows = ref([])
const staff = ref([])
const statusFilter = ref('pending')
const loaded = ref(false)
const showForm = ref(false)
const rejecting = ref(null)
const rejectReason = ref('')
const pending = ref({ leave: 0, overtime: 0, adjustments: 0 })
const form = ref(blank())

/**
 * Columns per tab. The three record types share staff, reason, status and the
 * decide buttons; only the middle columns differ, so the shape is data rather
 * than three copies of the same markup.
 */
const COLUMNS = {
  leave: [
    { key: 'staff_name', label: 'Staff' },
    { key: 'type', label: 'Type' },
    { key: 'start_date', label: 'From' },
    { key: 'end_date', label: 'To' },
    { key: 'days', label: 'Days' },
    { key: 'paid', label: 'Paid' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
  ],
  overtime: [
    { key: 'staff_name', label: 'Staff' },
    { key: 'date', label: 'Date' },
    { key: 'hours', label: 'Hours' },
    { key: 'kind', label: 'Kind' },
    { key: 'rate', label: 'Rate' },
    { key: 'otAmount', label: 'Amount' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
  ],
  adjustments: [
    { key: 'staff_name', label: 'Staff' },
    { key: 'date', label: 'Date' },
    { key: 'type', label: 'Type' },
    { key: 'amount', label: 'Amount' },
    { key: 'taxable', label: 'Taxable' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
  ],
}
const columns = computed(() => COLUMNS[tab.value] || COLUMNS.leave)

function blank() {
  return {
    staffId: '', type: 'annual', paid: true,
    startDate: TODAY(), endDate: TODAY(),
    date: TODAY(), hours: null, kind: 'normal',
    amount: null, taxable: true, reason: '',
  }
}

const emptyText = computed(() =>
  loaded.value
    ? (statusFilter.value === 'pending' ? 'Nothing awaiting a decision' : 'No records')
    : 'Loading…'
)


function pendingCount(key) {
  return pending.value[key] || 0
}

onMounted(() => { load(); loadStaff(); refreshCounts() })

function select(key) { tab.value = key; load() }

async function loadStaff() {
  try { staff.value = await apiGet('staff') } catch { staff.value = [] }
}

async function load() {
  loaded.value = false
  const params = new URLSearchParams()
  if (statusFilter.value) params.set('status', statusFilter.value)
  try {
    const res = await apiGet(`${tab.value}?${params.toString()}`)
    rows.value = Array.isArray(res) ? res : []
  } catch (e) {
    console.error(e)
    rows.value = []
    toast(e.message || 'Could not load', 'error')
  } finally {
    loaded.value = true
  }
}

/** Badge counts, so a pending claim on another tab is not missed. */
async function refreshCounts() {
  for (const t of TABS) {
    try {
      const res = await apiGet(`${t.key}?status=pending`)
      pending.value[t.key] = Array.isArray(res) ? res.length : 0
    } catch { pending.value[t.key] = 0 }
  }
}

function openNew() {
  form.value = blank()
  showForm.value = true
}

async function save() {
  if (!form.value.staffId) { toast('Choose a member of staff', 'error'); return }
  const f = form.value
  let body
  if (tab.value === 'leave') {
    body = { staffId: f.staffId, type: f.type, startDate: f.startDate, endDate: f.endDate, paid: f.paid, reason: f.reason || undefined }
  } else if (tab.value === 'overtime') {
    if (!f.hours) { toast('Enter the hours worked', 'error'); return }
    body = { staffId: f.staffId, date: f.date, hours: f.hours, kind: f.kind, reason: f.reason || undefined }
  } else {
    if (!f.amount) { toast('Enter an amount', 'error'); return }
    if (!f.reason) { toast('A reason is required', 'error'); return }
    body = { staffId: f.staffId, date: f.date, type: f.type, amount: f.amount, taxable: f.taxable, reason: f.reason }
  }

  try {
    await apiPost(tab.value, body)
    toast('Submitted')
    showForm.value = false
    await load()
    await refreshCounts()
  } catch (e) {
    toast(e.message || 'Could not submit', 'error')
  }
}

async function decide(resource, row, approve) {
  try {
    await apiPost(`${resource}/${row.id}/decide`, { approve })
    toast(approve ? 'Approved' : 'Rejected')
    await load()
    await refreshCounts()
  } catch (e) {
    // The server refuses self-approval; that message is the useful one to show.
    toast(e.message || 'Could not record the decision', 'error')
  }
}

function openReject(resource, row) {
  rejecting.value = { resource, row }
  rejectReason.value = ''
}

async function confirmReject() {
  try {
    await apiPost(`${rejecting.value.resource}/${rejecting.value.row.id}/decide`, {
      approve: false,
      reason: rejectReason.value,
    })
    toast('Rejected')
    rejecting.value = null
    await load()
    await refreshCounts()
  } catch (e) {
    toast(e.message || 'Could not reject', 'error')
  }
}
</script>

<style scoped>
.tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 14px; }
.tab {
  padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border, #ddd);
  background: transparent; cursor: pointer; font-size: .82rem; color: var(--text-muted);
  min-height: 38px; display: inline-flex; align-items: center; gap: 6px;
}
.tab.active { background: var(--primary); color: #fff; border-color: var(--primary); font-weight: 600; }
.tab-badge {
  background: var(--danger, #e74c3c); color: #fff; border-radius: 999px;
  padding: 1px 7px; font-size: .68rem; font-weight: 700;
}
</style>
