<template>
  <div>
    <div class="table-toolbar">
      <h3>Tables</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="sectionFilter" @change="loadTables" class="select">
          <option value="">All Sections</option>
          <option v-for="s in sections" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="statusFilter" class="select">
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="occupied">Occupied</option>
          <option value="reserved">Reserved</option>
          <option value="cleaning">Cleaning</option>
        </select>
        <button class="btn btn-outline" @click="loadTables">Refresh</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ tables.length }}</div><div class="lbl">Total Tables</div></div>
      <div class="summary-card"><div class="num" style="color:var(--success)">{{ tables.filter(t=>t.status==='available').length }}</div><div class="lbl">Available</div></div>
      <div class="summary-card"><div class="num" style="color:var(--primary)">{{ tables.filter(t=>t.status==='occupied').length }}</div><div class="lbl">Occupied</div></div>
      <div class="summary-card"><div class="num" style="color:var(--warning)">{{ tables.filter(t=>t.status==='reserved').length }}</div><div class="lbl">Reserved</div></div>
    </div>

    <div class="table-grid">
      <div
        v-for="t in filteredTables"
        :key="t.id"
        class="table-card"
        :class="t.status"
        @click="openEdit(t)"
        tabindex="0"
        role="button"
        @keydown.enter="openEdit(t)"
      >
        <div class="table-num">{{ t.name || t.id }}</div>
        <div class="table-cap">{{ t.capacity || '—' }} seats · {{ t.section || '—' }}</div>
        <div class="table-status" :class="'badge-'+t.status">{{ t.status }}</div>
        <div v-if="t.server" style="font-size:.72rem;color:var(--text-muted);margin-top:4px">Server: {{ t.server }}</div>
        <div v-if="t.guests" style="font-size:.72rem;color:var(--text-muted)">Guests: {{ t.guests }}</div>
      </div>
      <div v-if="!filteredTables.length" class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">🪑</div><div>No tables found</div>
      </div>
    </div>

    <!-- Edit Table Modal -->
    <div class="modal-overlay" v-if="editTable" @click.self="editTable=null">
      <div class="modal">
        <h3>Table {{ editTable.name || editTable.id }}</h3>
        <p class="modal-sub">Update table status</p>
        <div class="form-group">
          <label>Status</label>
          <select v-model="editTable.status" class="select">
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
            <option value="cleaning">Cleaning</option>
          </select>
        </div>
        <div class="form-group">
          <label>Assigned Server</label>
          <input v-model="editTable.server" placeholder="Server name" />
        </div>
        <div class="form-group">
          <label>Guest Count</label>
          <input v-model.number="editTable.guests" type="number" placeholder="0" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="editTable=null">Cancel</button>
          <button class="btn btn-primary" @click="saveTable">Update Table</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPut } from '../api'
import { useToast } from '../composables/useToast'

const { toast } = useToast()
const tables = ref([])
const sections = ref(['Patio', 'Main Hall', 'Window', 'VIP Room', 'Bar'])
const sectionFilter = ref('')
const statusFilter = ref('')
const editTable = ref(null)

const filteredTables = computed(() => {
  let t = tables.value
  if (sectionFilter.value) t = t.filter(x => x.section === sectionFilter.value)
  if (statusFilter.value) t = t.filter(x => x.status === statusFilter.value)
  return t
})

onMounted(loadTables)

async function loadTables() {
  try { tables.value = await apiGet('tables') } catch (e) { console.error(e) }
}

function openEdit(t) {
  editTable.value = { ...t }
}

async function saveTable() {
  if (!editTable.value) return
  try {
    await apiPut('tables/' + editTable.value.id, editTable.value)
    toast('Table updated')
    editTable.value = null
    await loadTables()
  } catch { toast('Failed to update', 'error') }
}
</script>
