<template>
  <div>
    <div class="table-toolbar">
      <h3>Audit Log</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <base-button text="Refresh" variant="btn-outline" :on-click="loadData" />
      </div>
    </div>
    <p class="modal-sub" style="margin-top:-4px;margin-bottom:12px">Read-only trail of every change to orders, payments, stock, staff and pricing — who did what, and when.</p>

    <!-- Filters -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        <div class="form-group">
          <label>Entity</label>
          <select v-model="filters.entity" class="input input-sm">
            <option value="">All entities</option>
            <option v-for="e in entityOptions" :key="e" :value="e">{{ e }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Action</label>
          <select v-model="filters.action" class="input input-sm">
            <option value="">All actions</option>
            <option v-for="a in actionOptions" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Actor</label>
          <input v-model="filters.actor" class="input input-sm" placeholder="Staff id or name" />
        </div>
        <div class="form-group">
          <label>From</label>
          <input v-model="filters.from" type="date" class="input input-sm" />
        </div>
        <div class="form-group">
          <label>To</label>
          <input v-model="filters.to" type="date" class="input input-sm" />
        </div>
        <div class="form-group">
          <label>&nbsp;</label>
          <button class="btn btn-secondary" style="width:100%" @click="applyFilters">Apply</button>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>ID</th><th>Change</th><th>Reason</th></tr>
          </thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td data-label="When">{{ formatTime(e.at) }}</td>
              <td data-label="Actor">{{ e.actor_name || '—' }}</td>
              <td data-label="Role"><span class="badge badge-new">{{ e.actor_role || '—' }}</span></td>
              <td data-label="Action"><span class="badge" :class="actionBadge(e.action)">{{ e.action }}</span></td>
              <td data-label="Entity">{{ e.entity }}</td>
              <td data-label="ID" style="font-family:var(--font-mono)">{{ e.entity_id || '—' }}</td>
              <td data-label="Change">{{ changeSummary(e) }}</td>
              <td data-label="Reason">{{ e.reason || '—' }}</td>
            </tr>
            <tr v-if="!entries.length">
              <td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">{{ loading ? 'Loading…' : 'No audit entries match these filters' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ entries.length }} of {{ total }} matching {{ total === MAX ? '— narrow the date range for more' : 'entry' }}{{ total === 1 ? '' : 's' }}</span></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiGet } from '../api'

const MAX = 500

const loading = ref(false)
const entries = ref([])
const total = ref(0)

const filters = ref({ entity: '', action: '', actor: '', from: '', to: '' })
const applied = ref({ entity: '', action: '', actor: '', from: '', to: '' })

const entityOptions = ['orders', 'payments', 'inventory', 'menu', 'staff', 'timeclock', 'shifts', 'cashdrawer', 'expenses', 'purchases', 'recipes', 'delivery', 'tips', 'leave_requests', 'overtime', 'staff_adjustments']
const actionOptions = ['create', 'update', 'void', 'refund', 'adjust', 'verify', 'delete']

const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d) ? iso : d.toLocaleString()
}

function actionBadge(action) {
  switch (action) {
    case 'create': return 'badge-new'
    case 'update': return 'badge-pending'
    case 'void': return 'badge-danger'
    case 'refund': return 'badge-danger'
    case 'adjust': return 'badge-pending'
    default: return ''
  }
}

function changeSummary(e) {
  const after = e.after
  const before = e.before
  if (!after && !before) return '—'
  if (!after) return 'deleted'
  const parts = Object.keys(after).map((k) => {
    const a = before && before[k] !== undefined ? before[k] : null
    const b = after[k]
    const display = (v) => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : String(v)
    if (a !== null && String(a) !== String(b)) return `${k}: ${display(a)} → ${display(b)}`
    return `${k}: ${display(b)}`
  })
  return parts.join(', ') || '—'
}

async function loadData() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (applied.value.entity) params.set('entity', applied.value.entity)
    if (applied.value.action) params.set('action', applied.value.action)
    if (applied.value.actor) params.set('actor_id', applied.value.actor)
    if (applied.value.from) params.set('from', applied.value.from)
    // `to` is a date-only input; the stored `at` is a full ISO timestamp, so
    // send end-of-day or the lexical compare excludes the to-date's entries.
    if (applied.value.to) params.set('to', /^\d{4}-\d{2}-\d{2}$/.test(applied.value.to) ? `${applied.value.to}T23:59:59` : applied.value.to)
    params.set('limit', String(MAX))
    const qs = params.toString()
    const res = await apiGet(`audit${qs ? '?' + qs : ''}`)
    entries.value = (res && res.entries) || []
    total.value = (res && res.count) || entries.value.length
  } catch (e) {
    console.error(e)
    entries.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  applied.value = { ...filters.value }
  loadData()
}

onMounted(() => {
  filters.value.to = today()
  applied.value.to = today()
  loadData()
})
</script>
