<template>
  <div>
    <div class="table-toolbar">
      <h3>Reservations</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="statusFilter" class="select"><option value="">All</option><option value="new">New</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select>
        <button class="btn btn-primary" @click="openAdd">+ New Reservation</button>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Guest</th><th>Date</th><th>Time</th><th>Guests</th><th>Table</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="r in filteredReservations" :key="r.id">
              <td data-label="Guest"><strong>{{ r.name||r.guest }}</strong></td>
              <td data-label="Date">{{ r.date||'—' }}</td>
              <td data-label="Time">{{ r.time||'—' }}</td>
              <td data-label="Guests">{{ r.guests||'-' }}</td>
              <td data-label="Table">{{ r.tableNum||r.table||'—' }}</td>
              <td data-label="Contact">{{ r.phone||r.contact||'—' }}</td>
              <td data-label="Status"><span class="badge" :class="'badge-'+r.status">{{ r.status }}</span></td>
              <td data-label="Actions">
                <button v-if="r.status==='new'" class="btn btn-sm btn-success" @click="updateStatus(r,'confirmed')">Confirm</button>
                <button v-if="r.status==='confirmed'" class="btn btn-sm btn-primary" @click="updateStatus(r,'completed')">Complete</button>
                <button class="btn btn-sm btn-ghost danger" @click="handleDelete(r)">Cancel</button>
              </td>
            </tr>
            <tr v-if="!filteredReservations.length"><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">No reservations</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredReservations.length }} reservation(s)</span></div>
    </div>
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>New Reservation</h3>
        <p class="modal-sub">Add a guest reservation</p>
        <div class="form-row">
          <div class="form-group"><label>Guest Name</label><input v-model="form.name" /></div>
          <div class="form-group"><label>Guests</label><input v-model.number="form.guests" type="number" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Date</label><input v-model="form.date" type="date" /></div>
          <div class="form-group"><label>Time</label><input v-model="form.time" type="time" /></div>
        </div>
        <div class="form-group"><label>Table #</label><input v-model="form.tableNum" /></div>
        <div class="form-group"><label>Phone</label><input v-model="form.phone" /></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button class="btn btn-primary" @click="saveItem">Create</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
const { toast } = useToast()
const reservations = ref([]); const statusFilter = ref(''); const showModal = ref(false)
const form = ref({ name:'', guests:2, date:'', time:'', tableNum:'', phone:'' })
const filteredReservations = computed(() => !statusFilter.value ? reservations.value : reservations.value.filter(r=>r.status===statusFilter.value))
onMounted(()=>{const n=new Date(); form.value.date=n.toISOString().slice(0,10); form.value.time=n.toTimeString().slice(0,5); loadData()})
async function loadData() { try { reservations.value = await apiGet('reservations') } catch {} }
async function saveItem() { try { await apiPost('reservations',{...form.value,status:'new'}); toast('Created'); showModal.value=false; await loadData() } catch { toast('Failed','error') } }
async function updateStatus(r,s) { r.status=s; try { await apiPut('reservations/'+r.id,r); toast(s); await loadData() } catch { toast('Failed','error') } }
function openAdd() { const n=new Date(); form.value={name:'',guests:2,date:n.toISOString().slice(0,10),time:n.toTimeString().slice(0,5),tableNum:'',phone:''}; showModal.value=true }
async function handleDelete(r) { if(!confirm('Cancel?'))return; try { await apiDelete('reservations/'+r.id); toast('Cancelled'); await loadData() } catch { toast('Failed','error') } }
</script>
