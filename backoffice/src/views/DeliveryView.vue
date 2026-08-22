<template>
  <div>
    <div class="table-toolbar">
      <h3>Delivery Orders</h3>
      <div style="display:flex;gap:10px">
        <select v-model="statusFilter" class="select select-sm" style="width:auto">
          <option value="">All Status</option>
          <option v-for="s in ALL_STATUSES" :key="s" :value="s">{{ statusLabel(s) }}</option>
        </select>
        <button class="btn btn-primary" @click="loadDelivery">Filter</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ filtered.length }}</div><div class="lbl">Total</div></div>
      <div class="summary-card"><div class="num">{{ filtered.filter(d => ['ready','assigned'].includes(normalise(d.status))).length }}</div><div class="lbl">To Collect</div></div>
      <div class="summary-card"><div class="num">{{ filtered.filter(d => ['picked_up','out_for_delivery'].includes(normalise(d.status))).length }}</div><div class="lbl">On The Way</div></div>
    </div>

    <base-table
      :columns="columns"
      :rows="filtered"
      sticky-first
      stack-on-mobile
      caption="Delivery jobs"
      empty-title="No delivery orders"
      empty-hint="Delivery orders taken at the till appear here."
    >
      <template #cell-orderId="{ row }">
        <span style="font-family:var(--font-mono);font-size:.78rem" :title="row.orderId">{{ shortId(row.orderId) }}</span>
      </template>
      <template #cell-customerName="{ row }"><strong>{{ row.customerName || row.customer }}</strong></template>
      <!-- title, so a truncated address can still be read rather than simply
           being cut off with no way to recover it -->
      <template #cell-address="{ row }">
        <span class="truncate" :title="row.address">{{ row.address }}</span>
      </template>
      <template #cell-items="{ row }">
        <span class="truncate" :title="formatOrderItems(row.items)">{{ formatOrderItems(row.items) }}</span>
      </template>
      <template #cell-total="{ row }">
        <span style="font-weight:600;font-family:var(--font-mono)">ETB {{ parseFloat(row.total||0).toFixed(0) }}</span>
      </template>
      <template #cell-status="{ row }">
        <span class="badge" :class="statusBadgeClass(row.status)">{{ statusLabel(row.status) }}</span>
      </template>
      <!-- The row carries driver_id and the resolved driver name; `driverId`
           was never a column, so this column was always blank. -->
      <template #cell-driverId="{ row }">
        {{ row.driver || driverName(row.driver_id) || '—' }}
      </template>
      <template #cell-actions="{ row }">
        <button class="btn btn-sm btn-ghost" @click="editDelivery(row)">Status</button>
      </template>
    </base-table>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>Update Delivery Status</h3>
        <form @submit.prevent="saveDelivery">
          <p class="dv-current">
            Currently <span class="badge" :class="statusBadgeClass(editing?.status)">{{ statusLabel(editing?.status) }}</span>
          </p>

          <div class="form-group">
            <label>Move to</label>
            <!-- Only the moves the server will accept from this state, so a
                 refusal is not something you discover after pressing Update. -->
            <select v-model="form.status" class="select">
              <option value="">Choose…</option>
              <option v-for="s in nextStates" :key="s" :value="s">{{ statusLabel(s) }}</option>
            </select>
            <span v-if="!nextStates.length" class="dv-hint">
              This delivery is {{ statusLabel(editing?.status).toLowerCase() }} — there is nowhere left to move it.
            </span>
          </div>

          <div class="form-group" v-if="form.status === 'assigned'">
            <label>Driver</label>
            <select v-model="form.driverId" class="select">
              <option value="">Choose a driver…</option>
              <option v-for="d in drivers" :key="d.id" :value="d.id">{{ d.firstName }} {{ d.lastName }}</option>
            </select>
            <span v-if="!drivers.length" class="dv-hint">No active delivery staff to assign to.</span>
          </div>

          <div class="form-group" v-if="form.status === 'cancelled'">
            <label>Reason</label>
            <input v-model="form.reason" placeholder="Why is this delivery being cancelled?" />
            <span class="dv-hint">The server requires a reason, and it is kept with the job.</span>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showForm=false">Cancel</button>
            <button type="submit" class="btn btn-primary" :class="{'btn-loading': btnState.isBusy(), 'btn-success-state': btnState.isSuccess(), 'btn-error-state': btnState.isError()}" :disabled="btnState.isBusy()" :aria-busy="btnState.isBusy() ? 'true' : undefined">
              <span v-if="btnState.isBusy()" class="btn-spinner" aria-hidden="true"></span>
              <span v-else-if="btnState.isSuccess()" class="btn-check" aria-hidden="true">✓</span>
              <span v-else-if="btnState.isError()" class="btn-error-icon" aria-hidden="true">!</span>
              {{ btnState.isBusy() ? 'Updating...' : btnState.isSuccess() ? 'Updated ✓' : btnState.isError() ? 'Try Again' : 'Update' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost } from '../api'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
// statusLabel already renders "out_for_delivery" as "Out for delivery", and
// statusBadgeClass already colours every state in the machine.
import { formatOrderItems, shortId } from '../lib/formatters'
import BaseTable from '../components/BaseTable.vue'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const btnState = useButtonState({ successDuration: 2000 })
const deliveries = ref([])
const drivers = ref([])
const driverMap = ref({})
const statusFilter = ref('')
const showForm = ref(false)
const editing = ref(null)
const form = ref({ status: '', driverId: '', reason: '' })

/**
 * Mirrors TRANSITIONS in fufut-api/src/handlers/delivery.js.
 *
 * This screen offered 'pending' and 'in-transit', which the API does not have,
 * and omitted most of the states it does: new, confirmed, preparing, ready,
 * picked_up and out_for_delivery. It was written against the free-text column
 * the state machine replaced.
 */
const TRANSITIONS = {
  new: ['confirmed', 'preparing'],
  confirmed: ['preparing'],
  preparing: ['ready'],
  ready: ['assigned'],
  assigned: ['picked_up'],
  picked_up: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
}

const ALL_STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled']

/** The server normalises the same way, so a legacy "in-transit" row still matches. */
function normalise(status) {
  return String(status || 'new').toLowerCase().replace(/[\s-]+/g, '_')
}

/**
 * Where this job may go next, plus cancelling — which the server allows from
 * any state except delivered and cancelled.
 */
const nextStates = computed(() => {
  if (!editing.value) return []
  const from = normalise(editing.value.status)
  const moves = [...(TRANSITIONS[from] || [])]
  if (from !== 'delivered' && from !== 'cancelled') moves.push('cancelled')
  return moves
})

const columns = [
  { key: 'orderId', label: 'Order ID' },
  { key: 'customerName', label: 'Customer' },
  { key: 'address', label: 'Address' },
  { key: 'items', label: 'Items' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' },
  { key: 'driverId', label: 'Driver' },
  { key: 'actions', label: 'Actions' },
]


const filtered = computed(() =>
  deliveries.value.filter(d => !statusFilter.value || normalise(d.status) === statusFilter.value)
)

onMounted(loadDelivery)

async function loadDelivery() {
  try { deliveries.value = await apiGet('delivery') } catch (e) { console.error(e) }
  // Who a job can be handed to. Assigning by typing an id was guesswork, and
  // the id it wrote never reached the database anyway.
  try {
    const staff = await apiGet('staff')
    const active = (Array.isArray(staff) ? staff : []).filter(
      s => String(s.role || '').toLowerCase().replace(/[\s_]+/g, '-') === 'delivery-staff' &&
           (s.status || 'active') === 'active'
    )
    drivers.value = active
    driverMap.value = Object.fromEntries(active.map(s => [s.id, (s.firstName || '') + ' ' + (s.lastName || '')]))
  } catch { drivers.value = []; driverMap.value = {} }
}

function editDelivery(d) {
  editing.value = d
  form.value = { status: '', driverId: d.driver_id || '', reason: '' }
  showForm.value = true
}

/**
 * Move a job along.
 *
 * Goes through POST /delivery/:id/status, which validates the transition,
 * stamps assigned_at and picked_up_at, resolves the driver's name and closes
 * the order once a delivered job is paid. This used to PUT to /api/delivery
 * with the id in the body: the generic resource handler accepts that, so the
 * write appeared to succeed while skipping every one of those steps — and the
 * driverId it sent was dropped on the floor, because the column is driver_id.
 */
function driverName(id) {
  if (!id) return ''
  return driverMap.value[id] || ''
}

async function saveDelivery() {
  if (!form.value.status) { toast('Choose what to change it to', 'error'); return }
  if (form.value.status === 'assigned' && !form.value.driverId) {
    toast('Choose a driver — the server will not assign a job to nobody', 'error')
    return
  }
  if (form.value.status === 'cancelled' && !form.value.reason.trim()) {
    toast('A reason is required to cancel a delivery', 'error')
    return
  }

  btnState.setLoading()
  const body = { status: form.value.status }
  if (form.value.status === 'assigned') body.driverId = form.value.driverId
  if (form.value.status === 'cancelled') body.reason = form.value.reason.trim()

  try {
    await apiPost(`delivery/${editing.value.id}/status`, body)
    toast(`Delivery ${statusLabel(form.value.status).toLowerCase()}`)
    showForm.value = false
    await loadDelivery()
    btnState.setSuccess()
  } catch (e) {
    // The refusal names the moves that are legal from here, which is worth
    // showing rather than replacing with a generic failure.
    toast(e.message || 'Could not update that delivery', 'error')
    btnState.setError(e.message)
  }
}
</script>

<style scoped>
.dv-current { font-size: .84rem; color: var(--text-muted); margin-bottom: 14px; }
.dv-hint { display: block; font-size: .72rem; color: var(--text-muted); margin-top: 4px; }
</style>