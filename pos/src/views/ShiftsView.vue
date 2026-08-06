<template>
  <div>
    <div class="sv-toolbar">
      <div class="sv-toolbar-left">
        <span class="sv-toolbar-title">Shifts</span>
        <span class="sv-toolbar-count">{{ filteredShifts.length }} result{{ filteredShifts.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="sv-toolbar-actions">
        <div class="sv-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="search" type="text" placeholder="Search staff..." class="sv-search-input" />
          <button v-if="search" class="sv-search-clear" @click="search=''" aria-label="Clear search">&times;</button>
        </div>
        <select v-model="filter" class="select"><option value="">All</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select>
        <button class="btn btn-primary" @click="openAdd">+ Add</button>
        <button class="btn btn-ghost btn-sm" @click="loadData" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Staff</th><th>Role</th><th>Shift</th><th>Date</th><th>Start</th><th>End</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="s in filteredShifts" :key="s.id">
              <td data-label="Staff"><strong>{{ s.staffName||s.staff||'—' }}</strong></td>
              <td data-label="Role">{{ s.role||'—' }}</td>
              <td data-label="Shift"><span class="badge" :class="'badge-'+(s.shift||s.type||'')">{{ s.shift||s.type||'—' }}</span></td>
              <td data-label="Date">{{ s.date||'—' }}</td>
              <td data-label="Start">{{ s.start||'—' }}</td>
              <td data-label="End">{{ s.end||'—' }}</td>
              <td data-label="Actions"><button class="btn btn-sm btn-ghost" @click="openEdit(s)">Edit</button><button class="btn btn-sm btn-ghost danger" @click="handleDelete(s)">Delete</button></td>
            </tr>
            <tr v-if="!filteredShifts.length"><td colspan="7">
              <div class="sv-empty">
                <div class="sv-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div class="sv-empty-text">{{ search ? 'No shifts match your search' : 'No shifts scheduled' }}</div>
                <div class="sv-empty-hint">{{ search ? 'Try a different name.' : 'Add a shift to get started.' }}</div>
              </div>
            </td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredShifts.length }} shift(s)</span></div>
    </div>
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="editing ? 'Edit shift' : 'Add shift'">
        <h3>{{ editing ? 'Edit' : 'Add' }} Shift</h3>
        <p class="modal-sub">{{ editing ? 'Update shift' : 'Schedule a shift' }}</p>
        <div class="form-group"><label>Staff Name</label><input v-model="form.staffName" :class="{ 'input-error': vErrors.staffName }" /><span v-if="vErrors.staffName" class="field-error">{{ vErrors.staffName }}</span></div>
        <div class="form-row">
          <div class="form-group">
            <label>Shift Type</label>
            <select v-model="form.shift" class="select" :class="{ 'input-error': vErrors.shift }"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select>
          </div>
          <div class="form-group"><label>Date</label><input v-model="form.date" type="date" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Start</label><input v-model="form.start" type="time" :class="{ 'input-error': vErrors.start }" /><span v-if="vErrors.start" class="field-error">{{ vErrors.start }}</span></div>
          <div class="form-group"><label>End</label><input v-model="form.end" type="time" :class="{ 'input-error': vErrors.end }" /><span v-if="vErrors.end" class="field-error">{{ vErrors.end }}</span></div>
        </div>
        <div class="modal-actions"><button class="btn btn-secondary" @click="showModal=false">Cancel</button><button class="btn btn-primary" @click="saveItem">{{ editing ? 'Update' : 'Add' }}</button></div>
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
  staffName: { required: true, label: 'Staff Name', max: 100 },
  shift: { required: true, label: 'Shift Type' },
  start: { required: true, label: 'Start Time' },
  end: { required: true, label: 'End Time' }
}
const { errors: vErrors, validate } = useFormValidation(schema)

const shifts = ref([])
const filter = ref('')
const search = ref('')
const showModal = ref(false)
const editing = ref(null)
const form = ref({ staffName: '', shift: 'morning', date: '', start: '09:00', end: '17:00' })

const filteredShifts = computed(() => {
  let result = !filter.value ? shifts.value : shifts.value.filter(s => (s.shift || s.type) === filter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(s =>
      (s.staffName && s.staffName.toLowerCase().includes(q)) ||
      (s.staff && s.staff.toLowerCase().includes(q)) ||
      (s.role && s.role.toLowerCase().includes(q))
    )
  }
  return result
})

onMounted(() => {
  form.value.date = new Date().toISOString().slice(0, 10)
  loadData()
})

async function loadData() {
  try { shifts.value = await apiGet('shifts') } catch (e) { console.error(e) }
}

function openAdd() {
  editing.value = null
  form.value = { staffName: '', shift: 'morning', date: new Date().toISOString().slice(0, 10), start: '09:00', end: '17:00' }
  showModal.value = true
}

function openEdit(s) {
  editing.value = s
  form.value = { ...s }
  showModal.value = true
}

async function saveItem() {
  if (!validate(form.value)) { toast('Please fix the errors', 'error'); return }
  try {
    if (editing.value) {
      await apiPut('shifts/' + editing.value.id, form.value)
      toast('Updated')
    } else {
      await apiPost('shifts', form.value)
      toast('Added')
    }
    showModal.value = false
    await loadData()
  } catch (e) { console.error(e); toast('Failed', 'error') }
}

async function handleDelete(s) {
  if (!confirm('Delete this shift?')) return
  try { await apiDelete('shifts/' + s.id); toast('Deleted'); await loadData() } catch (e) { console.error(e); toast('Failed', 'error') }
}
</script>
<style scoped>
.sv-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}
.sv-toolbar-left { display: flex; align-items: baseline; gap: 10px; }
.sv-toolbar-title { font-size: 1.15rem; font-weight: 700; color: var(--text-heading); }
.sv-toolbar-count { font-size: .78rem; color: var(--text-muted); }
.sv-toolbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.sv-search {
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
.sv-search:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(15,123,120,.1); }
.sv-search-input { border: none; background: transparent; padding: 7px 0; font-size: .82rem; color: var(--text-heading); width: 100%; outline: none; font-family: inherit; }
.sv-search-input::placeholder { color: var(--neutral-400); }
.sv-search-clear { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; padding: 0 2px; line-height: 1; }
.sv-search-clear:hover { color: var(--text-heading); }

.sv-empty { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; text-align: center; }
.sv-empty-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--neutral-50); display: flex; align-items: center; justify-content: center; color: var(--neutral-400); margin-bottom: 12px; }
.sv-empty-text { font-size: .88rem; font-weight: 600; color: var(--text-heading); }
.sv-empty-hint { font-size: .78rem; color: var(--text-muted); margin-top: 4px; }

.input-error { border-color: var(--danger, #e74c3c) !important; }
.field-error { display: block; color: var(--danger, #e74c3c); font-size: 0.75rem; margin-top: 2px; }

@media (max-width: 768px) {
  .sv-toolbar { flex-direction: column; align-items: stretch; }
  .sv-toolbar-left { margin-bottom: 4px; }
  .sv-search { min-width: 0; }
}
</style>
