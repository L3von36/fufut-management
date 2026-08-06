<template>
  <div>
    <div class="rv-toolbar">
      <div class="rv-toolbar-left">
        <span class="rv-toolbar-title">Reservations</span>
        <span class="rv-toolbar-count">{{ filteredReservations.length }} result{{ filteredReservations.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="rv-toolbar-actions">
        <div class="rv-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="search" type="text" placeholder="Search guests..." class="rv-search-input" />
          <button v-if="search" class="rv-search-clear" @click="search=''" aria-label="Clear search">&times;</button>
        </div>
        <select v-model="statusFilter" class="select"><option value="">All</option><option value="new">New</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select>
        <button class="btn btn-primary" @click="openAdd">+ New</button>
        <button class="btn btn-ghost btn-sm" @click="loadData" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
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
            <tr v-if="!filteredReservations.length"><td colspan="8">
              <div class="rv-empty">
                <div class="rv-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div class="rv-empty-text">{{ search ? 'No reservations match your search' : 'No reservations' }}</div>
                <div class="rv-empty-hint">{{ search ? 'Try a different name or clear search.' : 'Create a new reservation to get started.' }}</div>
              </div>
            </td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredReservations.length }} reservation(s)</span></div>
    </div>
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal" role="dialog" aria-modal="true" aria-label="New reservation">
        <h3>New Reservation</h3>
        <p class="modal-sub">Add a guest reservation</p>
        <div class="form-row">
          <div class="form-group"><label>Guest Name</label><input v-model="form.name" :class="{ 'input-error': vErrors.name }" /><span v-if="vErrors.name" class="field-error">{{ vErrors.name }}</span></div>
          <div class="form-group"><label>Guests</label><input v-model.number="form.guests" type="number" :class="{ 'input-error': vErrors.guests }" /><span v-if="vErrors.guests" class="field-error">{{ vErrors.guests }}</span></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Date</label><input v-model="form.date" type="date" :class="{ 'input-error': vErrors.date }" /><span v-if="vErrors.date" class="field-error">{{ vErrors.date }}</span></div>
          <div class="form-group"><label>Time</label><input v-model="form.time" type="time" /></div>
        </div>
        <div class="form-group"><label>Table #</label><input v-model="form.tableNum" :class="{ 'input-error': vErrors.tableNum }" /><span v-if="vErrors.tableNum" class="field-error">{{ vErrors.tableNum }}</span></div>
        <div class="form-group"><label>Phone</label><input v-model="form.phone" :class="{ 'input-error': vErrors.phone }" /><span v-if="vErrors.phone" class="field-error">{{ vErrors.phone }}</span></div>
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
import { useFormValidation } from '../composables/useFormValidation'

const { toast } = useToast()
const schema = {
  name: { required: true, label: 'Guest Name', max: 100 },
  guests: { required: true, label: 'Guests', min: 1, maxVal: 50 },
  date: { required: true, label: 'Date' },
  tableNum: { label: 'Table #' },
  phone: { label: 'Phone', pattern: /^\+?\d{8,15}$/ }
}
const { errors: vErrors, validate } = useFormValidation(schema)

const reservations = ref([])
const statusFilter = ref('')
const search = ref('')
const showModal = ref(false)
const form = ref({ name: '', guests: 2, date: '', time: '', tableNum: '', phone: '' })

const filteredReservations = computed(() => {
  let result = !statusFilter.value ? reservations.value : reservations.value.filter(r => r.status === statusFilter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(r =>
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.guest && r.guest.toLowerCase().includes(q)) ||
      (r.phone && r.phone.includes(q))
    )
  }
  return result
})

onMounted(() => {
  const n = new Date()
  form.value.date = n.toISOString().slice(0, 10)
  form.value.time = n.toTimeString().slice(0, 5)
  loadData()
})

async function loadData() {
  try { reservations.value = await apiGet('reservations') } catch (e) { console.error(e) }
}

async function saveItem() {
  if (!validate(form.value)) { toast('Please fix the errors', 'error'); return }
  try {
    await apiPost('reservations', { ...form.value, status: 'new' })
    toast('Created')
    showModal.value = false
    await loadData()
  } catch (e) { console.error(e); toast('Failed', 'error') }
}

async function updateStatus(r, s) {
  r.status = s
  try { await apiPut('reservations/' + r.id, r); toast(s); await loadData() } catch (e) { console.error(e); toast('Failed', 'error') }
}

function openAdd() {
  const n = new Date()
  form.value = { name: '', guests: 2, date: n.toISOString().slice(0, 10), time: n.toTimeString().slice(0, 5), tableNum: '', phone: '' }
  showModal.value = true
}

async function handleDelete(r) {
  if (!confirm('Cancel this reservation?')) return
  try { await apiDelete('reservations/' + r.id); toast('Cancelled'); await loadData() } catch (e) { console.error(e); toast('Failed', 'error') }
}
</script>
<style scoped>
.rv-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}
.rv-toolbar-left { display: flex; align-items: baseline; gap: 10px; }
.rv-toolbar-title { font-size: 1.15rem; font-weight: 700; color: var(--text-heading); }
.rv-toolbar-count { font-size: .78rem; color: var(--text-muted); }
.rv-toolbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.rv-search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  transition: border-color var(--duration-fast) var(--ease);
  min-width: 180px;
}
.rv-search:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(15,123,120,.1); }
.rv-search-input { border: none; background: transparent; padding: 7px 0; font-size: .82rem; color: var(--text-heading); width: 100%; outline: none; font-family: inherit; }
.rv-search-input::placeholder { color: var(--neutral-400); }
.rv-search-clear { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; padding: 0 2px; line-height: 1; }
.rv-search-clear:hover { color: var(--text-heading); }

.rv-empty { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; text-align: center; }
.rv-empty-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--neutral-50); display: flex; align-items: center; justify-content: center; color: var(--neutral-400); margin-bottom: 12px; }
.rv-empty-text { font-size: .88rem; font-weight: 600; color: var(--text-heading); }
.rv-empty-hint { font-size: .78rem; color: var(--text-muted); margin-top: 4px; }

.input-error { border-color: var(--danger, #e74c3c) !important; }
.field-error { display: block; color: var(--danger, #e74c3c); font-size: 0.75rem; margin-top: 2px; }

@media (max-width: 768px) {
  .rv-toolbar { flex-direction: column; align-items: stretch; }
  .rv-toolbar-left { margin-bottom: 4px; }
  .rv-search { min-width: 0; }
}
</style>
