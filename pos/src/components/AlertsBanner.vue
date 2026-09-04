<template>
  <div v-if="alerts.length" class="alerts-banner" :class="{ critical: hasCritical, expanded }">
    <div class="alerts-top">
      <button class="alerts-summary" @click="expanded = !expanded" :aria-expanded="expanded">
        <span class="alerts-pulse" aria-hidden="true"></span>
        <strong>{{ alerts.length }} operation{{ alerts.length === 1 ? '' : 's' }} need{{ alerts.length === 1 ? 's' : '' }} attention</strong>
        <span class="alerts-critical-count" v-if="criticalCount">{{ criticalCount }} critical</span>
        <span class="alerts-hint">{{ expanded ? 'Hide' : 'Show' }}</span>
      </button>
      <button
        class="alerts-sound"
        :aria-pressed="!opsMuted"
        :title="opsMuted ? 'Alert sound is off' : 'Alert sound is on'"
        @click="toggleOpsMute"
      >
        <span v-if="opsMuted" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
        </span>
        <span v-else aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        </span>
      </button>
    </div>
    <div v-if="expanded" class="alerts-list">
      <div v-for="a in sorted" :key="a.id" class="alert-row" :class="a.severity">
        <span class="alert-dot" aria-hidden="true"></span>
        <div class="alert-body">
          <div class="alert-message">{{ a.message }}</div>
          <div class="alert-meta">Raised {{ shortTime(a.created) }}</div>
        </div>
        <button
          v-if="canAcknowledge"
          class="alert-ack"
          :disabled="acking === a.id"
          @click="ack(a)"
        >{{ acking === a.id ? '…' : 'Ack' }}</button>
      </div>
      <button v-if="canAcknowledgeAll && alerts.length > 1" class="alert-ack-all" @click="ackAll">
        Acknowledge all
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * Operations alerts banner.
 *
 * The cron sweep writes SLA breaches to /api/alerts; this banner is how the
 * floor finds out. It rides the same SSE channel the kitchen board uses, so a
 * ticket crossing its limit appears within seconds of the minute tick, and it
 * falls back to a 60s poll for the tablets where EventSource quietly dies.
 *
 * The server gates who can read alerts at all. Roles without the resource get
 * a refused fetch, which this component swallows and renders nothing for —
 * the cleaner's tablet never asked for the kitchen's clock, and a banner that
 * half-loads is worse than no banner.
 */
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import { apiGet, apiPost } from '../api'
import { useSSE } from '../composables/useSSE'
import { useAudioAlerts } from '../composables/useAudioAlerts'
import { useAuthStore } from '../stores/auth'

const alerts = ref([])
const expanded = ref(false)
const acking = ref(null)
const auth = useAuthStore()
const toast = inject('toast', () => {})

// Sound is for the critical tier only: a warning is the banner's job, a
// critical is the room's. One chime per batch of new criticals — the sweep
// can raise five at once on a cold start, and five sirens is noise, not
// signal.
// The pickup ping ('order-ready-now' — food on the pass for YOUR table) is
// the one warning that gets a sound of its own: the warm order chime, the
// same one the kitchen hears when a ticket goes ready. It is aimed at the
// waiter and it is time-sensitive in a way a breach count is not.
const { playCriticalAlert, playOrderReady, opsMuted, toggleOpsMute } = useAudioAlerts()
const soundedCritical = new Set()
const soundedPings = new Set()
// The first fetch after mount is a baseline, not a transition: an existing
// ping was raised before this tablet opened, and replaying it now tells the
// waiter about food that was already picked up (or already ignored). Only
// pings that ARRIVE after the first load chime.
let soundsArmed = false

function syncSound(list) {
  const fresh = (list || []).filter(
    (a) => a && a.severity === 'critical' && !soundedCritical.has(a.id)
  )
  for (const a of list || []) {
    if (a && a.severity === 'critical') soundedCritical.add(a.id)
  }
  if (fresh.length) playCriticalAlert()
  // A fresh ping means the kitchen just finished your table's food. Ids are
  // tracked separately so the ping does not re-chime on every poll while it
  // sits open — one chime per ready order, not a siren.
  let freshPing = false
  for (const a of list || []) {
    if (!a || a.rule_id !== 'order-ready-now') continue
    if (soundsArmed && !soundedPings.has(a.id)) freshPing = true
    soundedPings.add(a.id)
  }
  if (freshPing) playOrderReady()
  soundsArmed = true
}

// Roles the server grants alerts write (ack) to. Read is wider; a role that
// can read but not ack simply sees the list without the buttons.
// Per-alert Ack is allowed for manager, head-chef, head-waiter, cashier —
// each of those roles can act on a single alert relevant to them.
const ACK_ROLES = new Set(['manager', 'head-chef', 'head-waiter', 'cashier'])
// Bulk Ack-all is manager-only: the server's /api/alerts/acknowledge-all
// endpoint refuses every other role with "Manager only", so the button
// should not render for non-managers. Without this guard the button showed
// for head-chef/cashier/etc. and they got a 403 toast when they clicked it.
const ACK_ALL_ROLES = new Set(['manager'])
// Barista reads the banner (a drink ticket going late is theirs to rescue)
// but cannot ack — same read-only treatment the assistant-chef gets. Server
// side: ROLE_ACCESS.barista read includes 'alerts', write does not.
const READ_ROLES = new Set(['manager', 'head-chef', 'assistant-chef', 'head-waiter', 'cashier', 'delivery-staff', 'barista'])
const canAcknowledge = computed(() => ACK_ROLES.has(auth.roleKey))
const canAcknowledgeAll = computed(() => ACK_ALL_ROLES.has(auth.roleKey))

const criticalCount = computed(() => alerts.value.filter((a) => a.severity === 'critical').length)
const hasCritical = computed(() => criticalCount.value > 0)
// Critical first, then oldest first — the thing about to be lost is the thing
// to read first, and within a severity the oldest breach waited longest.
const sorted = computed(() =>
  [...alerts.value].sort((a, b) => {
    if ((a.severity === 'critical') !== (b.severity === 'critical')) return a.severity === 'critical' ? -1 : 1
    return String(a.created || '').localeCompare(String(b.created || ''))
  })
)

let pollTimer = null
const { connect, disconnect, on } = useSSE()

async function load() {
  try {
    const res = await apiGet('alerts')
    alerts.value = Array.isArray(res) ? res : (res && res.alerts) || []
    syncSound(alerts.value)
  } catch {
    // Refused or offline: silence, not an error banner on an error banner.
    alerts.value = []
  }
}

function onAlertsPush(data) {
  if (data && Array.isArray(data.alerts)) {
    alerts.value = data.alerts
    syncSound(alerts.value)
  }
}

async function ack(a) {
  acking.value = a.id
  try {
    await apiPost(`alerts/${a.id}/acknowledge`, {})
    alerts.value = alerts.value.filter((x) => x.id !== a.id)
    toast('Alert acknowledged', 'success')
  } catch (e) {
    toast(e && e.status === 403 ? 'Not permitted' : 'Could not acknowledge', 'error')
  } finally {
    acking.value = null
  }
}

async function ackAll() {
  try {
    await apiPost('alerts/acknowledge-all', {})
    alerts.value = []
    toast('All alerts acknowledged', 'success')
  } catch (e) {
    toast(e && e.status === 403 ? 'Manager only' : 'Could not acknowledge', 'error')
  }
}

function shortTime(stamp) {
  const t = Date.parse(stamp)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  if (!READ_ROLES.has(auth.roleKey)) return
  load()
  pollTimer = setInterval(load, 60000)
  connect('alerts')
  on('alerts_update', onAlertsPush)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  disconnect()
})
</script>

<style scoped>
.alerts-banner {
  margin: 0 16px;
  border-radius: 10px;
  overflow: hidden;
  background: #b45309;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
.alerts-banner.critical {
  background: #b91c1c;
}
.alerts-top {
  display: flex;
  align-items: stretch;
}
.alerts-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.alerts-pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #fff;
  animation: alerts-pulse 1.2s ease-in-out infinite;
  flex: 0 0 auto;
}
@keyframes alerts-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
}
.alerts-sound {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  border: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.25);
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.85;
}
.alerts-sound:hover {
  background: rgba(255, 255, 255, 0.12);
  opacity: 1;
}
.alerts-sound span {
  display: flex;
}
.alerts-sound svg {
  width: 15px;
  height: 15px;
}
.alerts-critical-count {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.alerts-hint {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.85;
}
.alerts-list {
  border-top: 1px solid rgba(255, 255, 255, 0.25);
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 0;
}
.alert-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
}
.alert-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fbbf24;
  flex: 0 0 auto;
}
.alert-row.critical .alert-dot {
  background: #fecaca;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
}
.alert-body {
  min-width: 0;
  flex: 1;
}
.alert-message {
  font-size: 12.5px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.alert-meta {
  font-size: 10.5px;
  opacity: 0.8;
  margin-top: 1px;
}
.alert-ack {
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.alert-ack:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
}
.alert-ack:disabled {
  opacity: 0.6;
  cursor: default;
}
.alert-ack-all {
  display: block;
  margin: 4px 14px 6px;
  border: 0;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.alert-ack-all:hover {
  background: rgba(255, 255, 255, 0.28);
}
</style>
