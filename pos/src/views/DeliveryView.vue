<template>
  <div>
    <div class="table-toolbar">
      <h3>Delivery</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="statusFilter" class="select"><option value="">All</option><option value="pending">Pending</option><option value="in-transit">In Transit</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>
    <div class="summary-grid">
      <div class="summary-card"><div class="num" style="color:var(--warning)">{{ pending.length }}</div><div class="lbl">Pending</div></div>
      <div class="summary-card"><div class="num" style="color:var(--info)">{{ inTransit.length }}</div><div class="lbl">In Transit</div></div>
      <div class="summary-card"><div class="num" style="color:var(--success)">{{ delivered.length }}</div><div class="lbl">Delivered</div></div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Address</th><th>Driver</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="d in filteredDeliveries" :key="d.id">
              <td data-label="Order">#{{ d.orderId||d.order_id||d.id }}</td>
              <td data-label="Customer">{{ d.customer||d.name||'—' }}</td>
              <td data-label="Address">{{ d.address||'—' }}</td>
              <td data-label="Driver">{{ d.driver||'—' }}</td>
              <td data-label="Status"><span class="badge" :class="'badge-'+d.status">{{ d.status }}</span></td>
              <td data-label="Actions">
                <button v-if="d.status==='pending'" class="btn btn-sm btn-primary" @click="updateStatus(d,'in-transit')">Dispatch</button>
                <button v-if="d.status==='in-transit'" class="btn btn-sm btn-success" @click="updateStatus(d,'delivered')">Delivered</button>
                <button v-if="d.status==='pending'" class="btn btn-sm btn-ghost danger" @click="updateStatus(d,'cancelled')">Cancel</button>
              </td>
            </tr>
            <tr v-if="!filteredDeliveries.length"><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No deliveries</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredDeliveries.length }} delivery(ies)</span></div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPut } from '../api'
import { useToast } from '../composables/useToast'
const { toast } = useToast()
const deliveries = ref([]); const statusFilter = ref('')
const pending = computed(()=>deliveries.value.filter(d=>d.status==='pending'))
const inTransit = computed(()=>deliveries.value.filter(d=>d.status==='in-transit'))
const delivered = computed(()=>deliveries.value.filter(d=>d.status==='delivered'))
const filteredDeliveries = computed(()=>!statusFilter.value?deliveries.value:deliveries.value.filter(d=>d.status===statusFilter.value))
onMounted(loadData)
async function loadData() { try { deliveries.value = await apiGet('delivery') } catch (e) { console.error(e) } }
async function updateStatus(d,s) { d.status=s; try { await apiPut('delivery/'+d.id,d); toast(s); await loadData() } catch { toast('Failed','error') } }
</script>
