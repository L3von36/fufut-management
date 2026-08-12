<template>
  <div>
    <div class="table-toolbar">
      <h3>Delivery Orders</h3>
      <div style="display:flex;gap:10px">
        <select v-model="statusFilter" class="select select-sm" style="width:auto">
          <option value="">All Status</option><option>pending</option><option>assigned</option><option>in-transit</option><option>delivered</option><option>cancelled</option>
        </select>
        <button class="btn btn-primary" @click="loadDelivery">Filter</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ filtered.length }}</div><div class="lbl">Total</div></div>
      <div class="summary-card"><div class="num">{{ filtered.filter(d => d.status === 'pending').length }}</div><div class="lbl">Pending</div></div>
      <div class="summary-card"><div class="num">{{ filtered.filter(d => d.status === 'in-transit').length }}</div><div class="lbl">In Transit</div></div>
    </div>

    <base-table
      :columns="columns"
      :rows="filtered"
      sticky-first
      caption="Delivery jobs"
      empty-title="No delivery orders"
      empty-hint="Delivery orders taken at the till appear here."
    >
      <template #cell-orderId="{ row }">
        <span style="font-family:var(--font-mono);font-size:.78rem">{{ row.orderId }}</span>
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
      <template #cell-actions="{ row }">
        <button class="btn btn-sm btn-ghost" @click="editDelivery(row)">Status</button>
      </template>
    </base-table>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>Update Delivery Status</h3>
        <form @submit.prevent="saveDelivery">
          <div class="form-group"><label>Status</label><select v-model="form.status" class="select"><option>pending</option><option>assigned</option><option>in-transit</option><option>delivered</option><option>cancelled</option></select></div>
          <div class="form-group"><label>Driver ID</label><input v-model="form.driverId" /></div>
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
import { apiGet, apiPut } from '../api'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
import { formatOrderItems } from '../lib/formatters'
import BaseTable from '../components/BaseTable.vue'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const btnState = useButtonState({ successDuration: 2000 })
const deliveries = ref([])
const statusFilter = ref('')
const showForm = ref(false)
const editing = ref(null)
const form = ref({ status: 'pending', driverId: '' })

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


const filtered = computed(() => deliveries.value.filter(d => !statusFilter.value || d.status === statusFilter.value))

onMounted(loadDelivery)
async function loadDelivery() { try { deliveries.value = await apiGet('delivery') } catch (e) { console.error(e) } }

function editDelivery(d) { editing.value = d; form.value = { status: d.status, driverId: d.driverId || '' }; showForm.value = true }

async function saveDelivery() {
  btnState.setLoading()
  try { await apiPut('delivery', { ...form.value, id: editing.value.id }); toast('Delivery updated'); showForm.value = false; await loadDelivery(); btnState.setSuccess() }
  catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}
</script>