<template>
  <div class="sla">
    <div class="sla-toolbar">
      <div>
        <h3>SLA Alerts</h3>
        <span class="sla-sub">Rules engine &middot; evaluated every minute &middot; thresholds owned by management</span>
      </div>
      <button class="btn btn-secondary btn-sm" :disabled="loading" @click="loadAll">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div class="sla-kpis">
      <div class="sla-kpi" :class="{ hot: kpiOpen > 0 }">
        <div class="sla-kpi-num">{{ kpiOpen }}</div>
        <div class="sla-kpi-lbl">Open</div>
      </div>
      <div class="sla-kpi" :class="{ hot: kpiCritical > 0 }">
        <div class="sla-kpi-num">{{ kpiCritical }}</div>
        <div class="sla-kpi-lbl">Critical</div>
      </div>
      <div class="sla-kpi">
        <div class="sla-kpi-num">{{ kpiWarning }}</div>
        <div class="sla-kpi-lbl">Warning</div>
      </div>
      <div class="sla-kpi">
        <div class="sla-kpi-num">{{ acked.length }}</div>
        <div class="sla-kpi-lbl">Acknowledged</div>
      </div>
      <div class="sla-kpi">
        <div class="sla-kpi-num">{{ resolvedToday.length }}</div>
        <div class="sla-kpi-lbl">Resolved today</div>
      </div>
    </div>

    <h4 class="sla-section-title">Rules</h4>
    <div class="sla-rules">
      <div v-for="r in RULE_META" :key="r.id" class="sla-rule" :class="ruleState(r.id)">
        <div class="sla-rule-head">
          <span class="sla-rule-name">{{ r.name }}</span>
          <span class="sla-rule-count">{{ ruleCount(r.id) }} open</span>
        </div>
        <div class="sla-rule-desc">{{ r.watches }}</div>
        <div class="sla-rule-foot">
          <span class="sla-rule-th">{{ r.threshold }}</span>
          <span class="sla-rule-state">{{ ruleState(r.id) }}</span>
        </div>
      </div>
    </div>

    <div class="sla-cols">
      <section class="sla-panel">
        <header class="sla-panel-head">
          <h4>Open <span v-if="open.length">({{ open.length }})</span></h4>
          <button
            v-if="canAcknowledge && open.length"
            class="btn btn-sm btn-outline"
            :disabled="ackingAll"
            @click="ackAll"
          >{{ ackingAll ? '…' : 'Acknowledge all' }}</button>
        </header>
        <div v-if="!loading && !open.length" class="sla-empty">Nothing open — every rule is clear.</div>
        <div v-for="a in openSorted" :key="a.id" class="sla-row" :class="a.severity">
          <span class="sla-dot" aria-hidden="true"></span>
          <div class="sla-row-body">
            <div class="sla-row-msg">{{ a.message }}</div>
            <div class="sla-row-meta">{{ ruleName(a.rule_id) }} &middot; raised {{ ageLabel(a.created) }}</div>
          </div>
          <button
            v-if="canAcknowledge"
            class="btn btn-sm btn-outline sla-ack"
            :disabled="acking === a.id"
            @click="ack(a)"
          >{{ acking === a.id ? '…' : 'Ack' }}</button>
        </div>
      </section>

      <section class="sla-panel">
        <header class="sla-panel-head">
          <h4>Acknowledged <span v-if="acked.length">({{ acked.length }})</span></h4>
        </header>
        <div v-if="!loading && !acked.length" class="sla-empty">Nothing waiting on a person.</div>
        <div v-for="a in acked" :key="a.id" class="sla-row is-quiet">
          <div class="sla-row-body">
            <div class="sla-row-msg">{{ a.message }}</div>
            <div class="sla-row-meta">by {{ a.acknowledged_by || '—' }} &middot; {{ shortTime(a.acknowledged_at) }}</div>
          </div>
        </div>

        <header class="sla-panel-head sla-panel-head-gap">
          <h4>Resolved today <span v-if="resolvedToday.length">({{ resolvedToday.length }})</span></h4>
        </header>
        <div v-if="!loading && !resolvedToday.length" class="sla-empty">Nothing resolved yet today.</div>
        <div v-for="a in resolvedToday" :key="a.id" class="sla-row is-quiet">
          <div class="sla-row-body">
            <div class="sla-row-msg">{{ a.message }}</div>
            <div class="sla-row-meta">cleared {{ shortTime(a.resolved_at) }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
/**
 * SLA rules dashboard — the manager's view of the alerts engine.
 *
 * The banner says "something needs you"; this screen says what the engine is
 * watching, what it found, and what happened to the things it found before.
 * Three lists, one per alert lifecycle: open (someone must act), acknowledged
 * (someone said "I have this" — with their name on it), resolved (the
 * condition cleared on its own, the best kind).
 *
 * All counts are derived from the lists themselves rather than from
 * /api/alerts/summary, because the lists are on screen anyway and a number
 * that disagrees with the table under it is worse than no number.
 *
 * Rule names and thresholds are a mirror of fufut-api/src/lib/rules.js. The
 * server remains the authority: it owns the live thresholds (settings keys
 * alerts.*, tunable without a deploy) and every grant. This file only owns
 * the words.
 */
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import { apiGet, apiPost, TODAY } from '../api'
import { useSSE } from '../composables/useSSE'
import { useAuthStore } from '../stores/auth'

// One entry per rule in RULE_IDS on the server. Renaming a rule id there
// orphans its alerts here — these strings are stored in alerts.rule_id.
const RULE_META = [
  { id: 'order-preparing-too-long', name: 'Preparing too long', watches: 'A ticket sitting in "preparing" past its window', threshold: 'warn 20 min · critical 40 min' },
  { id: 'order-new-unaccepted', name: 'Order unaccepted', watches: 'A new order nobody has accepted yet', threshold: '5 min' },
  { id: 'order-ready-not-served', name: 'Ready, not served', watches: 'Food at the pass going cold', threshold: '10 min' },
  { id: 'delivery-ready-unassigned', name: 'Delivery unassigned', watches: 'A packed delivery order with no driver', threshold: '10 min' },
  { id: 'delivery-in-transit-too-long', name: 'Driver out too long', watches: 'A driver in transit past the outer limit', threshold: '45 min' },
  { id: 'order-served-unpaid', name: 'Served, unpaid', watches: 'Guests who finished eating with an open check', threshold: '30 min' },
  { id: 'reservation-no-show', name: 'Reservation no-show', watches: 'A booking past its time, table never taken', threshold: '15 min' },
  { id: 'table-seated-too-long', name: 'Table occupied', watches: 'A seated party staying past the pace of service', threshold: '90 min' },
]

const ACK_ROLES = new Set(['manager', 'head-chef', 'head-waiter', 'cashier'])
const READ_ROLES = new Set(['manager', 'head-chef', 'assistant-chef', 'head-waiter', 'cashier', 'delivery-staff'])

const open = ref([])
const acked = ref([])
const resolved = ref([])
const loading = ref(false)
const acking = ref(null)
const ackingAll = ref(false)
const auth = useAuthStore()
const toast = inject('toast', () => {})

const canAcknowledge = computed(() => ACK_ROLES.has(auth.roleKey))

const kpiOpen = computed(() => open.value.length)
const kpiCritical = computed(() => open.value.filter((a) => a.severity === 'critical').length)
const kpiWarning = computed(() => open.value.filter((a) => a.severity !== 'critical').length)

// Critical first, then oldest — same order the banner speaks in, so the two
// screens never contradict each other about what to read first.
const openSorted = computed(() =>
  [...open.value].sort((a, b) => {
    if ((a.severity === 'critical') !== (b.severity === 'critical')) return a.severity === 'critical' ? -1 : 1
    return String(a.created || '').localeCompare(String(b.created || ''))
  })
)

// "Resolved today" must be today at the restaurant, not today in UTC. The
// stamps are ISO; slicing them would file everything between midnight and
// 03:00 local under the wrong day, which is the exact bug TODAY() exists for.
function localDay(stamp) {
  const t = Date.parse(String(stamp || ''))
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const resolvedToday = computed(() =>
  resolved.value.filter((a) => localDay(a.resolved_at) === TODAY())
)

function ruleCount(id) {
  return open.value.filter((a) => a.rule_id === id).length
}

function ruleState(id) {
  const rows = open.value.filter((a) => a.rule_id === id)
  if (rows.some((a) => a.severity === 'critical')) return 'critical'
  if (rows.length) return 'warning'
  return 'clear'
}

function ruleName(id) {
  const m = RULE_META.find((r) => r.id === id)
  return m ? m.name : id
}

async function loadAll() {
  loading.value = true
  try {
    const [o, a, r] = await Promise.all([
      apiGet('alerts?status=open&limit=200'),
      apiGet('alerts?status=acknowledged&limit=25'),
      apiGet('alerts?status=resolved&limit=100'),
    ])
    open.value = (o && o.alerts) || []
    acked.value = (a && a.alerts) || []
    resolved.value = (r && r.alerts) || []
  } catch {
    // Refused or offline: keep whatever was last rendered, say nothing — the
    // next poll or SSE push will fill it in.
  } finally {
    loading.value = false
  }
}

async function ack(a) {
  acking.value = a.id
  try {
    await apiPost(`alerts/${a.id}/acknowledge`, {})
    open.value = open.value.filter((x) => x.id !== a.id)
    acked.value = [{ ...a, status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by: auth.name || auth.roleKey }, ...acked.value]
    toast('Alert acknowledged', 'success')
  } catch (e) {
    toast(e && e.status === 403 ? 'Not permitted' : 'Could not acknowledge', 'error')
  } finally {
    acking.value = null
  }
}

async function ackAll() {
  ackingAll.value = true
  try {
    await apiPost('alerts/acknowledge-all', {})
    await loadAll()
    toast('All alerts acknowledged', 'success')
  } catch (e) {
    toast(e && e.status === 403 ? 'Manager only' : 'Could not acknowledge', 'error')
  } finally {
    ackingAll.value = false
  }
}

function shortTime(stamp) {
  const t = Date.parse(stamp)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ageLabel(stamp) {
  const t = Date.parse(stamp)
  if (!Number.isFinite(t)) return ''
  const min = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h} h ${String(m).padStart(2, '0')} min ago`
}

let pollTimer = null
const { connect, disconnect, on } = useSSE()

function onAlertsPush() {
  // The push carries the open list, but the acked/resolved panels age out of
  // it — one quiet reload keeps all three honest.
  loadAll()
}

onMounted(() => {
  if (!READ_ROLES.has(auth.roleKey)) return
  loadAll()
  pollTimer = setInterval(loadAll, 60000)
  connect('alerts')
  on('alerts_update', onAlertsPush)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  disconnect()
})
</script>

<style scoped>
.sla {
  padding: 4px 0 24px;
}
.sla-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.sla-toolbar h3 {
  margin: 0;
  font-size: 17px;
}
.sla-sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted, #6b7280);
}

.sla-kpis {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 18px;
}
.sla-kpi {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
}
.sla-kpi.hot {
  border-color: #b91c1c;
  background: #fef2f2;
}
.sla-kpi-num {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}
.sla-kpi.hot .sla-kpi-num {
  color: #b91c1c;
}
.sla-kpi-lbl {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #6b7280);
  margin-top: 2px;
}

.sla-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #6b7280);
}
.sla-rules {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 18px;
}
.sla-rule {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sla-rule.warning {
  border-color: #b45309;
}
.sla-rule.critical {
  border-color: #b91c1c;
  background: #fef2f2;
}
.sla-rule-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.sla-rule-name {
  font-weight: 700;
  font-size: 12.5px;
}
.sla-rule-count {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  white-space: nowrap;
}
.sla-rule.warning .sla-rule-count,
.sla-rule.critical .sla-rule-count {
  color: inherit;
  font-weight: 700;
}
.sla-rule-desc {
  font-size: 11.5px;
  color: var(--text-muted, #6b7280);
  line-height: 1.35;
  flex: 1;
}
.sla-rule-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.sla-rule-th {
  font-size: 10.5px;
  color: var(--text-muted, #6b7280);
}
.sla-rule-state {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 8px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #374151;
}
.sla-rule.warning .sla-rule-state {
  background: #b45309;
  color: #fff;
}
.sla-rule.critical .sla-rule-state {
  background: #b91c1c;
  color: #fff;
}

.sla-cols {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 14px;
  align-items: start;
}
.sla-panel {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 12px 14px;
}
.sla-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.sla-panel-head h4 {
  margin: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #6b7280);
}
.sla-panel-head-gap {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.sla-empty {
  font-size: 12.5px;
  color: var(--text-muted, #6b7280);
  padding: 8px 0;
}
.sla-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--border, #f3f4f6);
}
.sla-row:first-of-type {
  border-top: 0;
}
.sla-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b45309;
  margin-top: 5px;
  flex: 0 0 auto;
}
.sla-row.critical .sla-dot {
  background: #b91c1c;
}
.sla-row.is-quiet .sla-dot {
  background: #9ca3af;
}
.sla-row-body {
  min-width: 0;
  flex: 1;
}
.sla-row-msg {
  font-size: 12.5px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.sla-row-meta {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  margin-top: 1px;
}
.sla-ack {
  flex: 0 0 auto;
}

@media (max-width: 1100px) {
  .sla-rules {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 900px) {
  .sla-kpis {
    grid-template-columns: repeat(3, 1fr);
  }
  .sla-cols {
    grid-template-columns: 1fr;
  }
}
</style>
