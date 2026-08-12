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
      <base-table
        :columns="columns"
        :rows="entries"
        sticky-first
        caption="System audit trail"
        :empty-title="loaded ? 'No entries for these filters' : 'Loading…'"
        :empty-hint="loaded ? 'Try widening the date range.' : ''"
      >
        <template #cell-at="{ row: entry }">
          <span style="font-family:var(--font-mono);font-size:.75rem;white-space:nowrap">{{ when(entry.at) }}</span>
        </template>
        <template #cell-actor_name="{ row: entry }">
          <strong>{{ entry.actor_name || '—' }}</strong>
          <div v-if="entry.actor_role" style="font-size:.7rem;color:var(--text-muted)">{{ entry.actor_role }}</div>
        </template>
        <template #cell-action="{ row: entry }">
          <span class="badge" :class="actionClass(entry.action)">{{ entry.action }}</span>
        </template>
        <template #cell-entity="{ row: entry }">
          {{ label(entry.entity) }}
          <div v-if="entry.entity_id" style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-muted)">
            {{ entry.entity_id }}
          </div>
        </template>
        <template #cell-changes="{ row: entry }">
              <div class="changes">
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
              </div>
        </template>
      </base-table>
      <!--
        The limit was hardcoded at 200 with nothing saying so, so the 201st
        entry was simply invisible — and on a log, "there is nothing older"
        and "we stopped looking" are very different claims.
      -->
      <div class="pagination">
        <span>
          {{ entries.length }} entr{{ entries.length === 1 ? 'y' : 'ies' }}
          <template v-if="atCeiling"> — the most recent {{ MAX_LIMIT }}. Narrow the dates to see further back.</template>
          <template v-else-if="atLimit"> — showing the most recent {{ limit }}, there may be more</template>
        </span>
        <button v-if="atLimit" class="btn btn-sm btn-secondary" @click="showMore">Show more</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, TODAY } from '../api'
import { localDayStartUtc, localDayEndUtc, localDateTime } from '../lib/datetime'
import { formatValue } from '../lib/formatters'
import BaseButton from '../components/BaseButton.vue'
import BaseTable from '../components/BaseTable.vue'

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

const columns = [
  { key: 'at', label: 'When' },
  { key: 'actor_name', label: 'Who' },
  { key: 'action', label: 'Action' },
  { key: 'entity', label: 'Record' },
  { key: 'changes', label: 'What changed' },
]
const loaded = ref(false)
const limit = ref(200)

// A full page is the only signal the server gives that more may exist — the
// endpoint returns rows, not a total — so this is "there may be more", not
// "there are more", and it is worded that way on screen.
const atLimit = computed(() => entries.value.length >= limit.value && limit.value < MAX_LIMIT)
const atCeiling = computed(() => entries.value.length >= MAX_LIMIT)

// Capped at what the endpoint will actually return (MAX_LIMIT = 500 in
// handlers/audit.js). Asking for more would clamp server-side and the button
// would keep offering to fetch rows that never arrive.
const MAX_LIMIT = 500

function showMore() {
  limit.value = Math.min(limit.value + 200, MAX_LIMIT)
  loadAudit()
}
const entity = ref('')
const action = ref('')
const fromDate = ref(TODAY())
const toDate = ref(TODAY())

function label(e) {
  return String(e || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function when(at) {
  if (!at) return '—'
  // Stored as UTC; shown in the restaurant's local time, or the log reads three
  // hours behind everything else on the screen. Fixed format rather than
  // toLocaleString(), which varies by browser locale and drops seconds — and
  // seconds are what order two entries made in the same minute.
  return localDateTime(at) || at
}

function actionClass(a) {
  if (a === 'void' || a === 'refund') return 'badge-cancelled'
  if (a === 'create') return 'badge-success'
  if (a === 'verify') return 'badge-success'
  return 'badge-pending'
}

function show(v) {
  if (v === null || v === undefined || v === '') return '(empty)'
  return formatValue(v)
}

onMounted(loadAudit)

async function loadAudit() {
  const params = new URLSearchParams()
  if (entity.value) params.set('entity', entity.value)
  if (action.value) params.set('action', action.value)
  // A local calendar day converted to the UTC instants that bracket it. The
  // literal `Z` suffix meant midnight *UTC*, which is 03:00 in Addis — so a
  // filter for "today" silently excluded the first three hours of it, and
  // anything logged just after midnight was invisible.
  if (fromDate.value) params.set('from', localDayStartUtc(fromDate.value))
  if (toDate.value) params.set('to', localDayEndUtc(toDate.value))
  params.set('limit', String(limit.value))

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
