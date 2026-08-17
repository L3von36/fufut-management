<template>
  <div class="oc">
    <div class="oc-toolbar">
      <div>
        <h3>Open Checks</h3>
        <span class="oc-sub">Money owed right now &middot; oldest first</span>
      </div>
      <button class="btn btn-secondary btn-sm" :disabled="loading" @click="load">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div class="oc-summary">
      <div class="oc-card">
        <div class="oc-num">{{ checks.length }}</div>
        <div class="oc-lbl">Open checks</div>
      </div>
      <div class="oc-card">
        <div class="oc-num">ETB {{ totalOwed.toFixed(0) }}</div>
        <div class="oc-lbl">Total owed</div>
      </div>
      <div class="oc-card">
        <div class="oc-num">{{ oldestLabel }}</div>
        <div class="oc-lbl">Oldest</div>
      </div>
    </div>

    <div v-if="!loading && !checks.length" class="oc-empty">
      <div class="oc-empty-title">Nothing outstanding</div>
      <div class="oc-empty-hint">Every check has been settled.</div>
    </div>

    <div class="oc-list">
      <article v-for="c in checks" :key="c.id" class="oc-check" :class="{ 'is-stale': ageMinutes(c) >= STALE_MIN }">
        <header class="oc-check-head">
          <span class="oc-where">{{ whereLabel(c) }}</span>
          <span class="oc-age" :title="c.created">{{ ageLabel(c) }}</span>
        </header>

        <div class="oc-lines">{{ itemSummary(c) }}</div>

        <footer class="oc-check-foot">
          <div class="oc-money">
            <span class="oc-total">ETB {{ Number(c.total || 0).toFixed(0) }}</span>
            <span class="badge" :class="'badge-' + (c.payment_status || 'unpaid')">{{ c.payment_status || 'unpaid' }}</span>
          </div>
          <div class="oc-actions">
            <button class="btn btn-sm btn-outline" @click="openMove(c)">Move</button>
            <button class="btn btn-sm btn-primary" @click="settle(c)">Settle</button>
          </div>
        </footer>
      </article>
    </div>

    <!-- ─── Move a check to another table ─── -->
    <div v-if="moving" class="modal-overlay" @click.self="closeMove">
      <div class="modal">
        <h3>Move {{ moving.table_number ? 'Table ' + moving.table_number : 'check' }}</h3>
        <p class="oc-modal-sub">
          The check moves with the guests. The table they leave goes back on the floor
          only if nothing else is owed on it.
        </p>

        <div class="form-group">
          <label>Move to</label>
          <select v-model="moveTarget" class="select">
            <option value="">Choose a table…</option>
            <option v-for="t in moveTargets" :key="t.id" :value="String(t.number)">
              Table {{ t.number }}{{ t.name ? ' — ' + t.name : '' }} ({{ t.capacity }} seats){{ t.status !== 'available' ? ' · ' + t.status : '' }}
            </option>
          </select>
          <span class="oc-hint">
            A table with a party on it, or one held by a booking, is refused unless a manager moves it.
          </span>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeMove">Cancel</button>
          <button class="btn btn-primary" :disabled="!moveTarget || movingBusy" @click="confirmMove">
            {{ movingBusy ? 'Moving…' : 'Move check' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { useRouter } from 'vue-router'
import { apiGet, apiPost } from '../api'
import { useOrderStore } from '../stores/order'
import { useSSE } from '../composables/useSSE'
import { formatOrderItems, titleCase } from '../lib/formatters'

const router = useRouter()
const toast = inject('toast')
const orderStore = useOrderStore()
const { connect: sseConnect, disconnect: sseDisconnect, on: sseOn } = useSSE()

/** A check open this long is worth looking at rather than scrolling past. */
const STALE_MIN = 90

const checks = ref([])
const tables = ref([])
const loading = ref(false)
const moving = ref(null)
const moveTarget = ref('')
const movingBusy = ref(false)

const totalOwed = computed(() =>
  checks.value.reduce((sum, c) => sum + (Number(c.total) || 0), 0)
)

const oldestLabel = computed(() => {
  if (!checks.value.length) return '—'
  // The server sorts oldest first, but sorting here too means a stale sort
  // order cannot quietly misreport the headline number.
  const oldest = checks.value.reduce((a, b) => (ageMinutes(a) >= ageMinutes(b) ? a : b))
  return ageLabel(oldest)
})

/**
 * Somewhere to move a check to. The occupied ones are offered rather than
 * hidden, because a manager may legitimately merge onto a busy table and the
 * server is what decides — hiding the option would make a permitted action look
 * impossible.
 */
const moveTargets = computed(() => {
  const current = moving.value ? String(moving.value.table_number || '') : ''
  return tables.value
    .filter(t => String(t.number) !== current)
    .slice()
    .sort((a, b) => Number(a.number) - Number(b.number))
})

function ageMinutes(c) {
  const started = Date.parse(c.created || '')
  if (!Number.isFinite(started)) return 0
  return Math.max(0, Math.round((Date.now() - started) / 60000))
}

function ageLabel(c) {
  const mins = ageMinutes(c)
  if (mins < 60) return mins + 'm'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Where the money is owed: a table if there is one, otherwise the order type. */
function whereLabel(c) {
  if (c.table_number) return 'Table ' + c.table_number
  return titleCase(c.type) || 'Order'
}

function itemSummary(c) {
  const text = formatOrderItems(c.items)
  return typeof text === 'string' && text ? text : '—'
}

async function load() {
  loading.value = true
  try {
    const [open, tbl] = await Promise.all([
      apiGet('orders?open=1'),
      apiGet('tables').catch(() => []),
    ])
    checks.value = Array.isArray(open) ? open : []
    tables.value = Array.isArray(tbl) ? tbl : []
  } catch (e) {
    toast(e.message || 'Could not load open checks', 'error')
  } finally {
    loading.value = false
  }
}

function settle(c) {
  // Hand the checkout the existing order so it settles that bill rather than
  // creating a second one for the same food.
  orderStore.activeOpenOrderId = c.id
  orderStore.tableNum = String(c.table_number || '')
  orderStore.orderType = c.type || 'dine-in'
  router.push('/app/checkout')
}

function openMove(c) {
  moving.value = c
  moveTarget.value = ''
}

function closeMove() {
  moving.value = null
  moveTarget.value = ''
}

async function confirmMove() {
  if (!moving.value || !moveTarget.value) return
  movingBusy.value = true
  try {
    const res = await apiPost(`orders/${moving.value.id}/transfer`, { tableNumber: moveTarget.value })
    if (res && res.moved === false) {
      toast('That check is already on that table')
    } else {
      toast(`Moved to table ${moveTarget.value}` + (res && res.sourceFreed ? ' · old table freed' : ''))
    }
    closeMove()
    await load()
  } catch (e) {
    toast(e.message || 'Could not move the check', 'error')
  } finally {
    movingBusy.value = false
  }
}

onMounted(() => {
  load()
  // Someone else settling a bill or seating a table changes this list.
  sseConnect('tables')
  sseOn('table_update', () => load())
})

onUnmounted(() => sseDisconnect())
</script>

<style scoped>
.oc-toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.oc-toolbar h3 { font-size: 1rem; font-weight: 600; color: var(--text-heading); }
.oc-sub { font-size: .74rem; color: var(--text-muted); }

.oc-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
.oc-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; text-align: center; }
.oc-num { font-size: 1.3rem; font-weight: 700; color: var(--text-heading); font-family: var(--font-mono, monospace); }
.oc-lbl { font-size: .68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-top: 3px; }

.oc-list { display: grid; gap: 10px; }
.oc-check { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; }
/* A check open past the stale mark is the one that walks out unpaid. */
.oc-check.is-stale { border-left: 3px solid var(--danger); }
.oc-check-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.oc-where { font-weight: 600; color: var(--text-heading); }
.oc-age { font-size: .74rem; color: var(--text-muted); font-family: var(--font-mono, monospace); white-space: nowrap; }
.oc-lines { font-size: .8rem; color: var(--text-body); margin: 8px 0 12px; overflow-wrap: anywhere; }
.oc-check-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.oc-money { display: flex; align-items: center; gap: 8px; }
.oc-total { font-weight: 700; font-family: var(--font-mono, monospace); }
.oc-actions { display: flex; gap: 8px; }

.oc-empty { text-align: center; padding: 40px 16px; color: var(--text-muted); }
.oc-empty-title { font-weight: 600; margin-bottom: 2px; }
.oc-empty-hint { font-size: .82rem; }

.oc-modal-sub { font-size: .8rem; color: var(--text-muted); margin-bottom: 14px; }
.oc-hint { display: block; font-size: .72rem; color: var(--text-muted); margin-top: 4px; }

@media (max-width: 768px) {
  .oc-check-foot { align-items: stretch; }
  .oc-actions { flex: 1 1 100%; }
  .oc-actions .btn { flex: 1; justify-content: center; }
}
</style>
