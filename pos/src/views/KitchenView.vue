<template>
  <div>
    <div class="table-toolbar">
      <h3>Kitchen Display</h3>
      <div class="kitchen-toolbar-actions">
        <div class="kitchen-stats">
          <span class="ks-stat ks-new">{{ newOrders.length }} new</span>
          <span class="ks-stat ks-prep">{{ preparingOrders.length }} prepping</span>
          <span class="ks-stat ks-ready">{{ readyOrders.length }} ready</span>
        </div>
        <button class="btn btn-sm" :class="muted ? 'btn-danger' : 'btn-outline'" @click="toggleMute" :title="muted ? 'Unmute' : 'Mute'">
          <svg v-if="!muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46A4.5 4.5 0 0 1 18 12c0 1.21-.47 2.31-1.24 3.13l1.44 1.44A6.95 6.95 0 0 0 20 12c0-1.87-.73-3.58-1.93-4.84l-.03.03z"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          <span v-if="muted" style="margin-left:4px">Muted</span>
        </button>
        <base-button text="Refresh" variant="btn-outline" extra-class="btn-sm" :on-click="refresh" />
      </div>
    </div>

    <div class="kitchen-grid">
      <!-- ═══ NEW ORDERS ═══ -->
      <div class="kitchen-column kc-new">
        <div class="kc-col-header">
          <h3>New Orders</h3>
          <span class="kc-count">{{ newOrders.length }}</span>
        </div>
        <div class="kc-col-body">
          <div v-for="o in newOrders" :key="o.id" class="kitchen-order" :class="ageClass(o)">
            <div class="ko-header">
              <div class="ko-header-left">
                <span class="ko-id">#{{ shortId(o.id) }}</span>
                <span class="ko-type-badge" :class="'type-' + (o.order_type || o.type || 'dine-in')">{{ formatType(o.order_type || o.type) }}</span>
                <span v-if="o.table_number || o.tableNum" class="ko-table">T{{ o.table_number || o.tableNum }}</span>
              </div>
              <div class="ko-header-right">
                <span class="ko-customer" v-if="o.customer && o.customer !== 'Walk-in'">{{ o.customer }}</span>
                <span class="ko-time">{{ formatTime(o.created) }}</span>
              </div>
            </div>

            <!-- Tracked lines: each one advances on its own, which is what makes
                 per-dish timing a measurement instead of an estimate. -->
            <div class="ko-items">
              <button
                v-for="line in trackedLines(o)"
                :key="line.id"
                class="ko-line ko-line-tap"
                :class="'st-' + line.status"
                :disabled="busyItems.has(line.id)"
                @click="advanceLine(o, line)"
                :title="`Mark ${line.name} as ${nextStatus(line.status)}`"
              >
                <span class="ko-line-state" :class="'st-' + line.status" aria-hidden="true"></span>
                <span class="ko-line-body">
                  <span class="ko-line-main">
                    <span class="ko-qty">{{ line.qty }}x</span>
                    <span class="ko-name">{{ line.name }}</span>
                    <span v-if="line.course && line.course !== 'main'" class="ko-course-chip">{{ line.course }}</span>
                  </span>
                  <span v-if="line.parsedModifiers.length" class="ko-mods">
                    <span v-for="(mod, mi) in line.parsedModifiers" :key="mi" class="ko-mod-chip">{{ formatModName(mod.name || mod) }}</span>
                  </span>
                  <span v-if="line.notes" class="ko-line-notes">{{ line.notes }}</span>
                </span>
                <span class="ko-line-action">{{ lineActionLabel(line.status) }}</span>
              </button>

              <!-- Orders placed before per-line tracking existed have no rows in
                   order_items, so they keep the original read-only rendering
                   rather than showing an empty ticket. -->
              <template v-if="!trackedLines(o).length">
                <div v-for="(line, li) in getOrderLines(o)" :key="li" class="ko-line">
                  <div class="ko-line-main">
                    <span class="ko-qty">{{ line.qty }}x</span>
                    <span class="ko-name">{{ line.name }}</span>
                  </div>
                  <div v-if="line.modifiers && line.modifiers.length" class="ko-mods">
                    <span v-for="(mod, mi) in line.modifiers" :key="mi" class="ko-mod-chip">{{ formatModName(mod.name) }}</span>
                  </div>
                  <div v-if="line.notes" class="ko-line-notes">{{ line.notes }}</div>
                </div>
                <div v-if="!getOrderLines(o).length" class="ko-fallback">{{ formatOrderItems(o.items) }}</div>
              </template>
            </div>

            <!-- Order-level notes -->
            <div v-if="o.notes" class="ko-order-notes">
              <span class="ko-notes-icon">📝</span> {{ o.notes }}
            </div>

            <div class="ko-footer">
              <span class="kitchen-timer" :class="timerClass(o)">{{ timerLabel(o) }}</span>
              <!-- Kept as one tap for the whole ticket. Per-line marking is an
                   addition, not a replacement: if the granular path were the
                   only path it would be slower than today and staff would stop
                   using the screen during a rush. -->
              <!-- §53. The digital board is the source of truth, but a paper
                   ticket still goes up on the rail in most kitchens, and until
                   now there was no way to produce one. -->
              <button class="btn btn-sm btn-outline" @click="printTicket(o)" title="Print kitchen ticket">🖨</button>
              <base-button text="Start All" variant="btn-primary" extra-class="btn-sm" :on-click="() => updateStatus(o.id, 'preparing')" />
            </div>
          </div>
          <div v-if="!newOrders.length" class="kitchen-empty">
            <div class="ke-icon">📋</div>
            No new orders
          </div>
        </div>
      </div>

      <!-- ═══ PREPARING ═══ -->
      <div class="kitchen-column kc-preparing">
        <div class="kc-col-header">
          <h3>Preparing</h3>
          <span class="kc-count">{{ preparingOrders.length }}</span>
        </div>
        <div class="kc-col-body">
          <div v-for="o in preparingOrders" :key="o.id" class="kitchen-order" :class="ageClass(o)">
            <div class="ko-header">
              <div class="ko-header-left">
                <span class="ko-id">#{{ shortId(o.id) }}</span>
                <span class="ko-type-badge" :class="'type-' + (o.order_type || o.type || 'dine-in')">{{ formatType(o.order_type || o.type) }}</span>
                <span v-if="o.table_number || o.tableNum" class="ko-table">T{{ o.table_number || o.tableNum }}</span>
              </div>
              <div class="ko-header-right">
                <span class="ko-customer" v-if="o.customer && o.customer !== 'Walk-in'">{{ o.customer }}</span>
                <span class="ko-time">{{ formatTime(o.created) }}</span>
              </div>
            </div>

            <div class="ko-items">
              <button
                v-for="line in trackedLines(o)"
                :key="line.id"
                class="ko-line ko-line-tap"
                :class="'st-' + line.status"
                :disabled="busyItems.has(line.id)"
                @click="advanceLine(o, line)"
                :title="`Mark ${line.name} as ${nextStatus(line.status)}`"
              >
                <span class="ko-line-state" :class="'st-' + line.status" aria-hidden="true"></span>
                <span class="ko-line-body">
                  <span class="ko-line-main">
                    <span class="ko-qty">{{ line.qty }}x</span>
                    <span class="ko-name">{{ line.name }}</span>
                    <span v-if="line.course && line.course !== 'main'" class="ko-course-chip">{{ line.course }}</span>
                  </span>
                  <span v-if="line.parsedModifiers.length" class="ko-mods">
                    <span v-for="(mod, mi) in line.parsedModifiers" :key="mi" class="ko-mod-chip">{{ formatModName(mod.name || mod) }}</span>
                  </span>
                  <span v-if="line.notes" class="ko-line-notes">{{ line.notes }}</span>
                </span>
                <span class="ko-line-action">{{ lineActionLabel(line.status) }}</span>
              </button>

              <template v-if="!trackedLines(o).length">
                <div v-for="(line, li) in getOrderLines(o)" :key="li" class="ko-line">
                  <div class="ko-line-main">
                    <span class="ko-qty">{{ line.qty }}x</span>
                    <span class="ko-name">{{ line.name }}</span>
                  </div>
                  <div v-if="line.modifiers && line.modifiers.length" class="ko-mods">
                    <span v-for="(mod, mi) in line.modifiers" :key="mi" class="ko-mod-chip">{{ formatModName(mod.name) }}</span>
                  </div>
                  <div v-if="line.notes" class="ko-line-notes">{{ line.notes }}</div>
                </div>
                <div v-if="!getOrderLines(o).length" class="ko-fallback">{{ formatOrderItems(o.items) }}</div>
              </template>
            </div>

            <div v-if="o.notes" class="ko-order-notes">
              <span class="ko-notes-icon">📝</span> {{ o.notes }}
            </div>

            <div class="ko-footer">
              <span class="kitchen-timer" :class="timerClass(o)">{{ timerLabel(o) }}</span>
              <span v-if="lineProgress(o)" class="ko-progress">{{ lineProgress(o) }}</span>
              <base-button text="All Ready" variant="btn-success" extra-class="btn-sm" :on-click="() => updateStatus(o.id, 'ready')" />
            </div>
          </div>
          <div v-if="!preparingOrders.length" class="kitchen-empty">
            <div class="ke-icon">👨‍🍳</div>
            Nothing in progress
          </div>
        </div>
      </div>

      <!-- ═══ READY ═══ -->
      <div class="kitchen-column kc-ready">
        <div class="kc-col-header">
          <h3>Ready</h3>
          <span class="kc-count">{{ readyOrders.length }}</span>
        </div>
        <div class="kc-col-body">
          <div v-for="o in readyOrders" :key="o.id" class="kitchen-order ko-ready-card">
            <div class="ko-header">
              <div class="ko-header-left">
                <span class="ko-id">#{{ shortId(o.id) }}</span>
                <span class="ko-type-badge" :class="'type-' + (o.order_type || o.type || 'dine-in')">{{ formatType(o.order_type || o.type) }}</span>
                <span v-if="o.table_number || o.tableNum" class="ko-table">T{{ o.table_number || o.tableNum }}</span>
              </div>
              <div class="ko-header-right">
                <span class="ko-time">{{ formatTime(o.created) }}</span>
              </div>
            </div>

            <div class="ko-items">
              <div v-for="(line, li) in getOrderLines(o)" :key="li" class="ko-line">
                <div class="ko-line-main">
                  <span class="ko-qty">{{ line.qty }}x</span>
                  <span class="ko-name">{{ line.name }}</span>
                </div>
                <div v-if="line.modifiers && line.modifiers.length" class="ko-mods">
                  <span v-for="(mod, mi) in line.modifiers" :key="mi" class="ko-mod-chip">{{ formatModName(mod.name) }}</span>
                </div>
              </div>
              <div v-if="!getOrderLines(o).length" class="ko-fallback">{{ formatOrderItems(o.items) }}</div>
            </div>

            <div class="ko-footer">
              <span class="ko-waiting">Waiting {{ waitMinutes(o) }}m</span>
              <base-button text="Served" variant="btn-outline" extra-class="btn-sm" :on-click="() => updateStatus(o.id, 'fulfilled')" />
            </div>
          </div>
          <div v-if="!readyOrders.length" class="kitchen-empty">
            <div class="ke-icon">🍽️</div>
            Nothing ready yet
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { apiGet, apiPut } from '../api'
import { useAudioAlerts } from '../composables/useAudioAlerts'
import { useButtonState } from '../composables/useButtonState'
import { useAuthStore } from '../stores/auth'
import { useSSE } from '../composables/useSSE'
import { kitchenTicket } from '../lib/print'
import { formatOrderItems } from '../lib/formatters'

const toast = inject('toast')
const auth = useAuthStore()
const { muted, enabled, playNewOrder, playOrderReady, playOrderUpdate, toggleMute } = useAudioAlerts()
const sse = useSSE()
const orders = ref([])
// Tracking rows for every line on the board, fetched in one request rather than
// one per ticket: this screen refreshes on a 15s timer and on every SSE event.
const activeItems = ref([])
// Lines with a request in flight, so a double-tap cannot fire twice.
const busyItems = ref(new Set())
let timer = null
let clockTimer = null
const now = ref(Date.now())

const ITEM_FLOW = ['new', 'preparing', 'ready', 'served']

/** Lines belonging to one order, in ticket order. */
const itemsByOrder = computed(() => {
  const map = new Map()
  for (const item of activeItems.value) {
    if (!map.has(item.order_id)) map.set(item.order_id, [])
    map.get(item.order_id).push({
      ...item,
      // modifiers arrive as a JSON string from D1; parse once here so the
      // template never has to.
      parsedModifiers: parseModifiers(item.modifiers)
    })
  }
  for (const list of map.values()) list.sort((a, b) => (a.line_no || 0) - (b.line_no || 0))
  return map
})

function trackedLines(order) {
  return itemsByOrder.value.get(order.id) || []
}

/**
 * Paper ticket for the rail.
 *
 * Uses the tracked lines where they exist — they carry the modifiers and the
 * per-line notes — and falls back to the order's summary string for an order
 * that predates per-item tracking, so an old ticket still prints something
 * usable rather than a blank.
 */
function printTicket(order) {
  const ok = kitchenTicket(order, trackedLines(order))
  if (!ok) toast('Allow pop-ups for this site to print tickets', 'error')
}

function parseModifiers(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function nextStatus(status) {
  const i = ITEM_FLOW.indexOf(status)
  if (i < 0 || i >= ITEM_FLOW.length - 1) return ITEM_FLOW[ITEM_FLOW.length - 1]
  return ITEM_FLOW[i + 1]
}

function lineActionLabel(status) {
  return { new: 'Start', preparing: 'Ready', ready: 'Served' }[status] || 'Done'
}

/** "2 of 3 ready" — how much of a ticket is actually finished. */
function lineProgress(order) {
  const lines = trackedLines(order)
  if (!lines.length) return ''
  const done = lines.filter(l => l.status === 'ready' || l.status === 'served').length
  return `${done} of ${lines.length} ready`
}

/**
 * Advance one line. The row is moved locally first so the kitchen sees the tap
 * register immediately - on a busy pass the round trip is long enough to make
 * staff tap twice - and reverted if the server rejects it.
 */
async function advanceLine(order, line) {
  if (busyItems.value.has(line.id)) return
  const target = nextStatus(line.status)
  if (target === line.status) return

  const previous = line.status
  busyItems.value = new Set(busyItems.value).add(line.id)
  const row = activeItems.value.find(i => i.id === line.id)
  if (row) row.status = target

  try {
    const res = await apiPut(`orders/${order.id}/items/${line.id}`, { status: target })
    if (res && res.orderStatus) {
      const o = orders.value.find(x => x.id === order.id)
      if (o) o.status = res.orderStatus === 'served' ? 'fulfilled' : res.orderStatus
    }
    if (target === 'ready') playOrderReady()
    else playOrderUpdate()
    await loadOrders()
  } catch {
    if (row) row.status = previous
    toast('Could not update that item', 'error')
  } finally {
    const next = new Set(busyItems.value)
    next.delete(line.id)
    busyItems.value = next
  }
}

const newOrders = computed(() =>
  orders.value
    .filter(o => o.status === 'new')
    .sort((a, b) => (a.created || '').localeCompare(b.created || ''))
)
const preparingOrders = computed(() =>
  orders.value
    .filter(o => o.status === 'preparing')
    .sort((a, b) => (a.created || '').localeCompare(b.created || ''))
)
const readyOrders = computed(() =>
  orders.value
    .filter(o => o.status === 'ready')
    .sort((a, b) => (b.created || '').localeCompare(a.created || '')) // newest first
)

onMounted(() => {
  loadOrders()
  connectSSE()
  timer = setInterval(loadOrders, 15000)
  clockTimer = setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => {
  sse.disconnect()
  if (timer) clearInterval(timer)
  if (clockTimer) clearInterval(clockTimer)
})

async function loadOrders() {
  try {
    // One request each, in parallel. The item feed is allowed to fail on its
    // own: tickets must still render if per-line tracking is unavailable.
    const [ordersRes, itemsRes] = await Promise.allSettled([
      apiGet('orders'),
      apiGet('orders/items/active')
    ])
    if (ordersRes.status === 'fulfilled') orders.value = ordersRes.value
    if (itemsRes.status === 'fulfilled' && Array.isArray(itemsRes.value)) {
      activeItems.value = itemsRes.value
    }
  } catch (e) { console.error(e) }
}

function connectSSE() {
  sse.connect('kitchen')
  sse.on('new_order', (data) => {
    loadOrders()
    playNewOrder()
    toast(`New order #${data.id?.slice(-4) || 'received'}`, 'info')
  })
  sse.on('order_update', (data) => {
    loadOrders()
    if (data.status === 'ready') {
      playOrderReady()
      toast(`Order ${data.id?.slice(-4) || ''} is ready!`, 'success')
    } else {
      playOrderUpdate()
    }
  })
}

async function updateStatus(id, status) {
  const o = orders.value.find(x => x.id === id)
  if (!o) return
  o.status = status
  try {
    await apiPut('orders/' + id, { status })
    toast(`Order ${status}`)
    if (status === 'ready') playOrderReady()
    else playOrderUpdate()
    loadOrders()
  } catch {
    toast('Failed to update', 'error')
  }
}

// ─── Helpers ───
function shortId(id) {
  return id ? '#' + id.slice(-4) : '—'
}

function formatTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatType(type) {
  const m = { 'dine-in': 'Dine In', 'takeaway': 'Takeaway', 'delivery': 'Delivery' }
  return m[type] || type || 'Dine In'
}

function formatModName(mod) {
  return String(mod).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Parse order into structured lines.
 * Uses `order_items` (Phase 1 structured JSON) when available,
 * falls back to flat `items` string.
 */
function getOrderLines(order) {
  // Try structured orderItems first (stored as order_items in DB, parsed by server)
  const structured = order.order_items || order.orderItems
  if (Array.isArray(structured) && structured.length > 0) {
    return structured.map(item => ({
      qty: item.qty || 1,
      name: item.name || 'Unknown',
      modifiers: (item.modifiers || []).map(m => ({
        name: m.name || m,
        priceDelta: m.priceDelta || 0
      })),
      notes: item.notes || ''
    }))
  }
  // Fallback: parse flat string like "2x Latte [oat-milk, vanilla], 1x Espresso"
  const flat = order.items
  if (!flat || typeof flat !== 'string') return []
  return parseFlatItems(flat)
}

/**
 * Parse flat item string into structured lines.
 * Handles: "2x Latte [oat-milk, vanilla] (extra hot), 1x Espresso"
 */
function parseFlatItems(flat) {
  if (!flat) return []
  if (typeof flat === 'string' && (flat.trim().startsWith('[') || flat.trim().startsWith('{'))) {
    try {
      const parsed = JSON.parse(flat.trim())
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      return arr.map(i => {
        if (typeof i === 'string') return { qty: 1, name: i, modifiers: [], notes: '' }
        return {
          qty: i.qty || i.quantity || 1,
          name: i.name || i.title || 'Item',
          modifiers: Array.isArray(i.modifiers) ? i.modifiers.map(m => ({ name: typeof m === 'string' ? m : m.name, priceDelta: 0 })) : [],
          notes: i.notes || ''
        }
      })
    } catch {}
  }
  const lines = []
  // Split by comma, but be careful with brackets and parens
  const parts = flat.split(/,(?=\s*\d+x)/)
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    // Match: "2x Item Name [mod1, mod2] (notes)"
    const qtyMatch = trimmed.match(/^(\d+)x\s*(.*)/)
    if (!qtyMatch) continue
    const qty = parseInt(qtyMatch[1], 10)
    const rest = qtyMatch[2].trim()
    // Extract modifiers in brackets
    const modMatch = rest.match(/\[([^\]]*)\]/)
    const mods = modMatch
      ? modMatch[1].split(',').map(m => ({ name: m.trim(), priceDelta: 0 })).filter(m => m.name)
      : []
    // Extract notes in parens
    const noteMatch = rest.match(/\(([^)]*)\)/)
    const notes = noteMatch ? noteMatch[1].trim() : ''
    // Clean name: remove mod brackets and note parens
    let name = rest
      .replace(/\[[^\]]*\]/, '').trim()
      .replace(/\([^)]*\)/, '').trim()
    if (name) {
      lines.push({ qty, name, modifiers: mods, notes })
    }
  }
  return lines
}

function ageInMinutes(o) {
  if (!o.created) return 0
  return (now.value - new Date(o.created).getTime()) / 60000
}

function ageClass(o) {
  const m = ageInMinutes(o)
  if (m >= 15) return 'age-critical'
  if (m >= 8) return 'age-warning'
  return 'age-normal'
}

function timerClass(o) {
  const m = ageInMinutes(o)
  if (m >= 15) return 'timer-critical'
  if (m >= 8) return 'timer-warning'
  return ''
}

function timerLabel(o) {
  const totalSec = Math.floor((now.value - new Date(o.created || 0).getTime()) / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  const mStr = m >= 15 ? `${m}m CRITICAL` : m >= 8 ? `${m}m` : `${m}:${s.toString().padStart(2, '0')}`
  return mStr
}

function waitMinutes(o) {
  if (!o.updated || !o.created) return '—'
  // For ready orders, show time since they were last updated (became ready)
  const m = Math.round((now.value - new Date(o.updated).getTime()) / 60000)
  return m <= 0 ? '<1' : m
}

function refresh() { loadOrders() }
</script>

<style scoped>
/* ─── Toolbar Stats ─── */
.kitchen-toolbar-actions { display:flex; gap:10px; align-items:center; }
.kitchen-stats { display:flex; gap:6px; }
.ks-stat {
  padding: 3px 10px;
  border-radius: 99px;
  font-size: .7rem;
  font-weight: 600;
  font-family: var(--font-mono);
}
/* ═══ TAPPABLE ORDER LINES ═══
   Each line is its own control, so a cook can mark the coffee done while the
   food is still on. 44px minimum because this is now the most-tapped target on
   the kitchen screen and it is used with wet or gloved hands. */
.ko-line-tap {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  margin-bottom: 4px;
  text-align: left;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
  transition: border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease);
}
.ko-line-tap:hover { border-color: var(--primary); }
.ko-line-tap:active { transform: scale(.99); }
.ko-line-tap:disabled { opacity: .55; cursor: progress; }
.ko-line-tap:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

.ko-line-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }

/* State is carried by a colour bar rather than a word, so a cook reads the
   ticket at arm's length without parsing text. */
.ko-line-state {
  width: 4px;
  align-self: stretch;
  min-height: 28px;
  border-radius: 2px;
  flex-shrink: 0;
  background: var(--neutral-300);
}
.ko-line-state.st-preparing { background: var(--warning); }
.ko-line-state.st-ready     { background: var(--success); }
.ko-line-state.st-served    { background: var(--neutral-400); }

.ko-line-tap.st-ready  { background: var(--green-50); border-color: var(--success); }
.ko-line-tap.st-served { opacity: .6; }
.ko-line-tap.st-served .ko-name { text-decoration: line-through; }

.ko-line-action {
  flex-shrink: 0;
  font-size: .78rem;
  font-weight: 700;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.ko-line-tap.st-served .ko-line-action { color: var(--text-muted); }

.ko-progress {
  font-size: .78rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-right: auto;
  margin-left: 8px;
}

.ks-new { background: var(--blue-50, #EFF6FF); color: var(--primary); }
.ks-prep { background: var(--gold-50, #FFFBEB); color: var(--warning); }
.ks-ready { background: var(--green-50, #F0FDF4); color: var(--success); }

/* ─── Column Layout ─── */
.kitchen-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  min-height: calc(100vh - 160px);
}

.kitchen-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.kc-col-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
 background: var(--neutral-100);
  border-bottom: 2px solid var(--border);
  flex-shrink: 0;
}
.kc-new .kc-col-header { border-bottom-color: var(--primary); background: var(--teal-50); }
.kc-preparing .kc-col-header { border-bottom-color: var(--warning); background: var(--gold-50); }
.kc-ready .kc-col-header { border-bottom-color: var(--success); background: var(--green-50); }

.kc-col-header h3 {
  font-size: .85rem;
  font-weight: 700;
  color: var(--text-heading);
}
.kc-count {
  width: 26px; height: 26px;
  border-radius: 50%;
  background: var(--border-strong);
  color: var(--text-heading);
  font-size: .72rem;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.kc-new .kc-count { background: var(--primary); color: #fff; }
.kc-preparing .kc-count { background: var(--warning); color: #fff; }
.kc-ready .kc-count { background: var(--success); color: #fff; }

.kc-col-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--neutral-25);
}

/* ─── Order Card ─── */
.kitchen-order {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
  transition: transform .2s, box-shadow .2s, border-color .2s;
  position: relative;
}
.kitchen-order:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
.kc-ready .kitchen-order {
  border-left: 4px solid var(--success);
}
.kc-preparing .kitchen-order {
  border-left: 4px solid var(--warning);
}
.kc-new .kitchen-order {
  border-left: 4px solid var(--primary);
}

/* Age animations */
.kitchen-order.age-warning { animation: pulse-warning 2s infinite; }
.kitchen-order.age-critical { animation: pulse-critical 1s infinite; }
@keyframes pulse-warning { 0%,100%{box-shadow:0 0 0 0 rgba(217,119,6,0)} 50%{box-shadow:0 0 0 6px rgba(217,119,6,.15)} }
@keyframes pulse-critical { 0%,100%{box-shadow:0 0 0 0 rgba(211,47,47,0)} 50%{box-shadow:0 0 0 8px rgba(211,47,47,.25)} }
@media(prefers-reduced-motion:reduce) { .kitchen-order { animation:none!important; } }

/* ─── Order Header ─── */
.ko-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  gap: 8px;
}
.ko-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.ko-header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}
.ko-id {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: .88rem;
  color: var(--text-heading);
}
.ko-type-badge {
  padding: 2px 8px;
  border-radius: 99px;
  font-size: .72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.type-dine-in { background: var(--teal-50); color: var(--primary); }
.type-takeaway { background: var(--gold-50); color: var(--warning); }
.type-delivery { background: #F3E8FF; color: #7C3AED; }
.ko-table {
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--neutral-100);
  color: var(--text-heading);
  font-size: .72rem;
  font-weight: 700;
  font-family: var(--font-mono);
}
.ko-customer {
  font-size: .72rem;
  color: var(--text-muted);
  font-weight: 500;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ko-time {
  font-size: .72rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* ─── Order Items ─── */
.ko-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.ko-line {
  padding: 8px 10px;
  background: var(--neutral-50);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.ko-line-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.ko-qty {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: .95rem;
  color: var(--primary);
  min-width: 28px;
}
.ko-name {
  font-weight: 600;
  font-size: .88rem;
  color: var(--text-heading);
}
.ko-mods {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
  margin-left: 34px;
}
.ko-mod-chip {
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--teal-50);
  color: var(--primary);
  font-size: .72rem;
  font-weight: 500;
  border: 1px solid var(--teal-200, #99F6E4);
}
.ko-course-chip {
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--warning, #f59e0b);
  color: #fff;
  font-size: .68rem;
  font-weight: 700;
  text-transform: capitalize;
  margin-left: 6px;
  flex-shrink: 0;
}
:global([data-theme="dark"]) .ko-course-chip {
  background: #b45309;
}
:global([data-theme="dark"]) .ko-mod-chip {
  background: rgba(15,123,120,.15);
  border-color: rgba(15,123,120,.3);
}
.ko-line-notes {
  margin-top: 4px;
  margin-left: 34px;
  font-size: .72rem;
  color: var(--warning);
  font-style: italic;
}
.ko-fallback {
  font-size: .82rem;
  color: var(--text-body);
  font-weight: 500;
}
.ko-order-notes {
  padding: 6px 10px;
  background: var(--gold-50);
  border-radius: var(--radius-sm);
  border: 1px solid #FDE68A;
  font-size: .78rem;
  color: var(--text-body);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ko-notes-icon { font-size: .85rem; }

/* ─── Order Footer ─── */
.ko-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  margin-top: auto;
}
.kitchen-timer {
  font-size: .78rem;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-body);
}
.timer-warning { color: var(--warning); font-weight: 700; }
.timer-critical { color: var(--danger); font-weight: 700; animation: blink 1s infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }
.ko-waiting {
  font-size: .78rem;
  color: var(--success);
  font-family: var(--font-mono);
  font-weight: 600;
}

/* ─── Empty State ─── */
.kitchen-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text-muted);
  font-size: .82rem;
  flex: 1;
}
.ke-icon { font-size: 2rem; margin-bottom: 8px; opacity: .5; }

/* ─── Responsive ─── */
@media (max-width: 1024px) {
  .kitchen-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 640px) {
  .kitchen-grid { grid-template-columns: 1fr; }
}
</style>
