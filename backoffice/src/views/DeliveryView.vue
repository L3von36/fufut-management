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

    <div class="table-wrap">
      <div class="table-scroll table-sticky-first">
        <table>
          <thead><tr><th>Order ID</th><th>Customer</th><th>Address</th><th>Items</th><th>Total</th><th>Status</th><th>Driver</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="d in filtered" :key="d.id">
              <td style="font-family:var(--font-mono);font-size:.78rem">{{ d.orderId }}</td>
              <td><strong>{{ d.customerName }}</strong></td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.address }}</td>
              <td>{{ d.items }}</td><td style="font-weight:600;font-family:var(--font-mono)">ETB {{ parseFloat(d.total||0).toFixed(0) }}</td>
              <td><span class="badge" :class="statusBadgeClass(d.status)">{{ statusLabel(d.status) }}</span></td>
              <td>{{ d.driverId || '-' }}</td>
              <td><button class="btn btn-sm btn-ghost" @click="editDelivery(d)">Status</button></td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No delivery orders</td></tr>
          </tbody>
        </table>
      </div>
    </div>

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
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const btnState = useButtonState({ successDuration: 2000 })
const deliveries = ref([])
const statusFilter = ref('')
const showForm = ref(false)
const editing = ref(null)
const form = ref({ status: 'pending', driverId: '' })

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