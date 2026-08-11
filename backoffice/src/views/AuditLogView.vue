<template>
  <div>
    <div class="table-toolbar">
      <h3>Audit Log</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="entity" class="select select-sm" style="width:auto">
          <option value="">All records</option>
          <option v-for="e in ENTITIES" :key="e" :value="e">{{ label(e) }}</option>
        </select>
        <select v-model="action" class="select select-sm" style="width:auto">
          <option value="">All actions</option>
          <option v-for="a in ACTIONS" :key="a" :value="a">{{ a }}</option>
        </select>
        <input type="date" v-model="fromDate" class="input input-sm" style="width:auto" />
        <input type="date" v-model="toDate" class="input input-sm" style="width:auto" />
        <base-button text="Filter" variant="btn-primary" :on-click="loadAudit" loading-label="Filtering..." success-label="Filtered ✓" />
      </div>
    </div>

    <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:16px">
      Orders, payments, refunds, price changes, stock adjustments and staff changes are recorded here.
      Entries are written by the system and cannot be edited or removed.
    </p>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>What changed</th></tr></thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.id">
              <td style="font-family:var(--font-mono);font-size:.75rem;white-space:nowrap">{{ when(entry.at) }}</td>
              <td>
                <strong>{{ entry.actor_name || '—' }}</strong>
                <div v-if="entry.actor_role" style="font-size:.7rem;color:var(--text-muted)">{{ entry.actor_role }}</div>
              </td>
              <td><span class="badge" :class="actionClass(entry.action)">{{ entry.action }}</span></td>
              <td>
                {{ label(entry.entity) }}
                <div v-if="entry.entity_id" style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-muted)">
                  {{ entry.entity_id }}
                </div>
              </td>
              <td class="changes">
                <!--
                  before/after hold only the fields that moved, so this renders a
                  readable diff rather than a wall of JSON. That is the whole
                  question an audit log is asked: what changed, from what, to what.
                -->
                <div v-for="(to, field) in (entry.after || {})" :key="field" class="change">
                  <span class="field">{{ field }}</span>
                  <span v-if="entry.before && entry.before[field] !== undefined" class="from">{{ show(entry.before[field]) }}</span>
                  <span v-if="entry.before && entry.before[field] !== undefined" class="arrow">→</span>
                  <span class="to">{{ show(to) }}</span>
                </div>
                <div v-if="entry.reason" class="reason">{{ entry.reason }}</div>
                <span v-if="!entry.after && !entry.reason" style="color:var(--text-muted)">—</span>
              </td>
            </tr>
            <tr v-if="!entries.length">
              <td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">
                {{ loaded ? 'No entries for these filters' : 'Loading…' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ entries.length }} entr{{ entries.length === 1 ? 'y' : 'ies' }}</span></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiGet, TODAY } from '../api'
import BaseButton from '../components/BaseButton.vue'

/**
 * This screen existed before the audit log did: it called `apiGet('audit')`,
 * which returned 404, and read fields — `timestamp`, `user`, `details` — that
 * no endpoint ever produced. So it always rendered empty and looked like a
 * quiet day rather than a missing feature.
 *
 * It now reads the real shape: `{ok, count, entries:[…]}` with `at`,
 * `actor_name`, `action`, `entity`, `entity_id`, `before`, `after`, `reason`.
 * Filtering is done server-side, because the log grows without bound and
 * fetching everything to filter in the browser stops working within months.
 */

const ENTITIES = ['orders', 'payments', 'tips', 'inventory', 'recipes', 'purchases', 'suppliers', 'delivery', 'waste', 'stock_counts', 'staff', 'menu']
const ACTIONS = ['create', 'update', 'void', 'refund', 'adjust', 'verify']

const entries = ref([])
const loaded = ref(false)
const entity = ref('')
const action = ref('')
const fromDate = ref(TODAY())
const toDate = ref(TODAY())

function label(e) {
  return String(e || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function when(at) {
  if (!at) return '—'
  // Stored as ISO UTC; shown in the restaurant's local time, or the log reads
  // three hours behind everything else on the screen.
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString()
}

function actionClass(a) {
  if (a === 'void' || a === 'refund') return 'badge-cancelled'
  if (a === 'create') return 'badge-success'
  if (a === 'verify') return 'badge-success'
  return 'badge-pending'
}

function show(v) {
  if (v === null || v === undefined || v === '') return '(empty)'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

onMounted(loadAudit)

async function loadAudit() {
  const params = new URLSearchParams()
  if (entity.value) params.set('entity', entity.value)
  if (action.value) params.set('action', action.value)
  // The column is a full ISO timestamp, so a bare date would exclude everything
  // after midnight on the closing day.
  if (fromDate.value) params.set('from', `${fromDate.value}T00:00:00.000Z`)
  if (toDate.value) params.set('to', `${toDate.value}T23:59:59.999Z`)
  params.set('limit', '200')

  try {
    const res = await apiGet(`audit?${params.toString()}`)
    entries.value = Array.isArray(res) ? res : (res.entries || [])
  } catch (e) {
    console.error(e)
    entries.value = []
  } finally {
    loaded.value = true
  }
}
</script>

<style scoped>
.changes { max-width: 380px; }
.change { display: flex; gap: 6px; align-items: baseline; font-size: .75rem; padding: 1px 0; flex-wrap: wrap; }
.change .field { font-weight: 600; min-width: 90px; }
.change .from { color: var(--text-muted); text-decoration: line-through; }
.change .arrow { color: var(--text-muted); }
.change .to { font-weight: 600; }
.reason { font-size: .72rem; color: var(--text-muted); font-style: italic; margin-top: 3px; }
</style>
