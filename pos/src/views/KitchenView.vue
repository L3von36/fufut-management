<template>
  <div>
    <div class="table-toolbar">
      <h3>Kitchen Display</h3>
      <div class="kitchen-toolbar-actions">
        <!-- Station Filter -->
        <select v-model="stationFilter" class="ks-station-select" title="Filter by station">
          <option value="all">All Stations</option>
          <option value="hot">Hot Kitchen</option>
          <option value="bar">Bar & Drinks</option>
          <option value="pass">Hot Pass Only</option>
        </select>
        <div class="kitchen-stats">
          <span class="ks-stat ks-new">{{ newOrders.length }} new</span>
          <span class="ks-stat ks-prep">{{ preparingOrders.length }} prepping</span>
          <span class="ks-stat ks-ready">{{ readyOrders.length }} ready</span>
        </div>
        <!-- Fix #1: Sort toggle -->
        <div class="ks-sort">
          <button class="ks-sort-btn" :class="{ active: sortBy === 'time' }" @click="sortBy = 'time'" title="Sort by time" aria-label="Sort tickets by time waiting">🕐</button>
          <button class="ks-sort-btn" :class="{ active: sortBy === 'table' }" @click="sortBy = 'table'" title="Sort by table" aria-label="Sort tickets by table">🪑</button>
          <button class="ks-sort-btn" :class="{ active: sortBy === 'size' }" @click="sortBy = 'size'" title="Sort by order size" aria-label="Sort tickets by order size">📏</button>
        </div>
        <button class="btn btn-sm" :class="muted ? 'btn-danger' : 'btn-outline'" @click="toggleMute" :title="muted ? 'Unmute' : 'Mute'">
          <svg v-if="!muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46A4.5 4.5 0 0 1 18 12c0 1.21-.47 2.31-1.24 3.13l1.44 1.44A6.95 6.95 0 0 0 20 12c0-1.87-.73-3.58-1.93-4.84l-.03.03z"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          <span v-if="muted" style="margin-left:4px">Muted</span>
        </button>
        <base-button text="Refresh" variant="btn-outline" extra-class="btn-sm" :on-click="refresh" />
      </div>
    </div>

    <!-- Alert Banner for Critical Overdue Tickets -->
    <div v-if="criticalOverdueCount &gt; 0" class="ks-alert-banner">
      ⚠️ <strong>ALERT:</strong> {{ criticalOverdueCount }} ticket{{ criticalOverdueCount === 1 ? '' : 's' }} exceeded the 15-minute preparation SLA threshold!
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
              <!-- Fix #5: SVG printer icon instead of emoji -->
              <button class="btn btn-sm btn-outline" @click="printTicket(o)" title="Print kitchen ticket">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              </button>
              <!-- Fix #4: Start All with undo -->
              <base-button text="Start All" variant="btn-primary" extra-class="btn-sm" :on-click="() => updateStatus(o.id, 'preparing', { undo: true })" />
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
              <!-- Fix #2: Stale ready warning -->
              <span v-if="isStaleReady(o)" class="ko-stale-badge">⏰ Pick up!</span>
              <span class="ko-waiting">Waiting {{ waitMinutes(o) }}m</span>
              <!-- Fix #6: Bump to Pass -->
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
    <!-- Fix #15: Keyboard shortcut hint -->
    <div class="kitchen-kb-hint">
      <span class="kb-key">1</span> advance next New
      <span class="kb-key">2</span> advance next Preparing
      <span class="kb-key">3</span> serve next Ready
      <span class="kb-key">R</span> refresh
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
import { getOrderLines, formatModName as sharedFormatModName, formatOrderItems } from '../lib/orderLines'

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
const stationFilter = ref('all') // 'all' | 'hot' | 'bar' | 'pass'
const sortBy = ref('time') // 'time' | 'table' | 'size'
// Fix #4: Undo tracking for Start All
const undoTimers = new Map()
let timer = null
let clockTimer = null
const now = ref(Date.now())

const criticalOverdueCount = computed(() => {
  return orders.value.filter(o => o.status !== 'fulfilled' && o.status !== 'cancelled' && ageInMinutes(o) >= 15).length
})

function onDragStart(e, order) {
  e.dataTransfer.setData('text/plain', order.id)
  e.dataTransfer.effectAllowed = 'move'
}

function onDrop(e, targetStatus) {
  const orderId = e.dataTransfer.getData('text/plain')
  if (orderId) {
    updateStatus(orderId, targetStatus)
  }
}

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

/**
 * Station classification, for the filter that shipped as a control that did
 * nothing. A line belongs to the bar when its category — or, for rows written
 * before categories were stamped, its name — reads as a drink; everything
 * else is hot-kitchen work.
 */
const DRINK_WORDS = /drink|coffee|beverage|juice|water|soda|\bbar\b|\btea\b|latte|espresso|cappuccino|macchiato|americano|mocha|smoothie|shake|lemonade/i

function lineIsDrink(line) {
  if (DRINK_WORDS.test(String(line.category || ''))) return true
  return DRINK_WORDS.test(String(line.name || ''))
}

/**
 * Tickets visible under the current station filter. A mixed ticket stays on
 * both the hot and the bar board — each station still has work on it — and
 * Hot Pass Only narrows to what is sitting ready for pickup. A ticket with no
 * readable lines (corrupt row, empty round) is never hidden: a blank board is
 * a worse failure than an unfiltered one.
 */
function stationVisible(order) {
  if (stationFilter.value === 'all') return true
  if (stationFilter.value === 'pass') return order.status === 'ready'
  const lines = trackedLines(order)
  const known = lines.length ? lines : getOrderLines(order)
  if (!known.length) return true
  const wantDrink = stationFilter.value === 'bar'
  return known.some((l) => (wantDrink ? lineIsDrink(l) : !lineIsDrink(l)))
}

function sortFn(a, b) {
  if (sortBy.value === 'table') {
    const ta = a.table_number || a.tableNum || 'zzz'
    const tb = b.table_number || b.tableNum || 'zzz'
    return String(ta).localeCompare(String(tb), undefined, { numeric: true })
  }
  if (sortBy.value === 'size') {
    const sa = getOrderLines(a).length || (a.items ? String(a.items).split(',').length : 0)
    const sb = getOrderLines(b).length || (b.items ? String(b.items).split(',').length : 0)
    return sb - sa // largest first
  }
  // default: oldest first
  return (a.created || '').localeCompare(b.created || '')
}
const newOrders = computed(() =>
  orders.value
    .filter(o => o.status === 'new' && stationVisible(o))
    .sort(sortFn)
)
const preparingOrders = computed(() =>
  orders.value
    .filter(o => o.status === 'preparing' && stationVisible(o))
    .sort(sortFn)
)
const readyOrders = computed(() =>
  orders.value
    .filter(o => o.status === 'ready' && stationVisible(o))
    .sort((a, b) => {
      if (sortBy.value === 'time') return String(readySince(b) || b.created || '').localeCompare(String(readySince(a) || a.created || ''))
      return sortFn(a, b)
    })
)

onMounted(() => {
  loadOrders()
  connectSSE()
  timer = setInterval(loadOrders, 15000)
  clockTimer = setInterval(() => {
    now.value = Date.now()
    // Fix #3: Audio alert when any order crosses the 15-minute critical threshold
    for (const o of orders.value) {
      if (!o.created) continue
      const ageMin = (Date.now() - new Date(o.created).getTime()) / 60000
      if (ageMin >= 15 && !o._criticalAlerted) {
        o._criticalAlerted = true
        if (!muted.value) playOrderUpdate()
      }
    }
  }, 1000)
  // Fix #15: Keyboard navigation
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  sse.disconnect()
  if (timer) clearInterval(timer)
  if (clockTimer) clearInterval(clockTimer)
  document.removeEventListener('keydown', handleKeydown)
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

async function updateStatus(id, status, { undo = false } = {}) {
  const o = orders.value.find(x => x.id === id)
  if (!o) return
  const previousStatus = o.status
  o.status = status
  try {
    await apiPut('orders/' + id, { status })
    toast(`Order ${status}`)
    if (status === 'ready') playOrderReady()
    else playOrderUpdate()
    loadOrders()

    // Fix #4: 3-second undo toast for Start All
    if (undo && previousStatus === 'new' && status === 'preparing') {
      const toastId = toast(`Order #${shortId(id)} started — 3s to undo`, 'info', {
        action: {
          label: 'Undo',
          onClick: async () => {
            o.status = 'new'
            try {
              await apiPut('orders/' + id, { status: 'new' })
              toast('Reverted to new', 'success')
              loadOrders()
            } catch { toast('Undo failed', 'error') }
          }
        },
        duration: 3000
      })
    }
  } catch {
    o.status = previousStatus
    toast('Failed to update', 'error')
  }
}

// ─── Helpers ───
// Returns the bare short id; the three templates that use it supply the '#'
// themselves, as TablesView and DashboardView do. Adding one here too printed
// every ticket on the pass as "##1003".
function shortId(id) {
  return id ? id.slice(-4) : '—'
}

function formatTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatType(type) {
  const m = { 'dine-in': 'Dine In', 'takeaway': 'Takeaway', 'delivery': 'Delivery' }
  return m[type] || type || 'Dine In'
}

// Use shared formatModName from lib/orderLines.js (Fix #14)
const formatModName = sharedFormatModName

// getOrderLines and parseFlatItems are now imported from lib/orderLines.js (Fix #13)

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

/**
 * When this order last came up — what "Waiting Nm" on the pass measures.
 *
 * Stamps are write-once (a re-tap must not rewind recorded durations), which
 * cuts both ways: on a ticket that was re-opened by a later round, the
 * order-level ready_at still holds the FIRST round's time, and coffee that
 * came up seconds ago reads as a 14-minute wait. The most recent dish to come
 * up is what the pass actually cares about, so line-level stamps win when they
 * exist; the order-level columns cover rows without line data, and `updated`
 * was the name this screen read before any of those columns existed — a field
 * that has never been on a row, which is why waiting used to show "—".
 */
function readySince(o) {
  const lines = itemsByOrder.value.get(o.id) || []
  let latest = null
  for (const l of lines) {
    const stamp = l && (l.ready_at || l.updated_at)
    if (stamp && (!latest || String(stamp) > String(latest))) latest = stamp
  }
  return latest || o.ready_at || o.updated_at || o.updated || null
}

function waitMinutes(o) {
  const since = readySince(o) || o.created
  if (!since) return '—'
  // For ready orders, show time since they were last updated (became ready)
  const m = Math.round((now.value - new Date(since).getTime()) / 60000)
  return m <= 0 ? '<1' : m
}

function refresh() { loadOrders() }

// Fix #15: Keyboard navigation — 1/2/3 advance next item in New/Preparing/Ready columns
function handleKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  const key = e.key
  if (key === '1') {
    const o = newOrders.value[0]
    if (o) {
      const lines = trackedLines(o)
      const next = lines.find(l => l.status !== 'served')
      if (next) advanceLine(o, next)
    }
  } else if (key === '2') {
    const o = preparingOrders.value[0]
    if (o) {
      const lines = trackedLines(o)
      const next = lines.find(l => l.status !== 'served')
      if (next) advanceLine(o, next)
    }
  } else if (key === '3') {
    const o = readyOrders.value[0]
    if (o) updateStatus(o.id, 'fulfilled')
  } else if (key === 'r' && !e.ctrlKey && !e.metaKey) {
    refresh()
  }
}

// Fix #2: Check if a ready order has been waiting > 5 minutes
function isStaleReady(o) {
  const since = readySince(o)
  if (!since) return false
  const waitMin = (now.value - new Date(since).getTime()) / 60000
  return waitMin >= 5
}
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

/* Fix #1: Sort toggle */
.ks-sort { display: flex; gap: 2px; background: var(--neutral-50); border-radius: var(--radius-sm); padding: 2px; }
.ks-sort-btn {
  padding: 4px 8px; border: none; border-radius: 6px;
  background: transparent; cursor: pointer; font-size: .85rem;
  transition: background .15s, transform .1s;
}
.ks-sort-btn.active { background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,.1); }
.ks-sort-btn:hover { background: var(--neutral-100); }

/* Fix #2: Stale ready badge */
.ko-stale-badge {
  font-size: .72rem; font-weight: 700; color: var(--danger);
  background: var(--red-50, #FEF2F2); padding: 2px 8px;
  border-radius: 99px; border: 1px solid var(--danger);
  animation: pulse-critical 1s infinite;
  margin-right: 8px;
}

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

/* Fix #15: Keyboard hint */
.kitchen-kb-hint {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 16px; margin-top: 12px;
  font-size: .7rem; color: var(--text-muted);
  background: var(--neutral-50); border-radius: var(--radius-sm);
}
.kb-key {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 5px;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: 4px; font-family: var(--font-mono); font-size: .7rem;
  font-weight: 700; color: var(--text-heading);
  box-shadow: 0 1px 2px rgba(0,0,0,.08);
}

/* Station selector */
.ks-station-select {
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-body);
  font-size: .8rem;
  font-weight: 600;
}

/* Alert banner for overdue items */
.ks-alert-banner {
  background: #FEF2F2;
  border: 1.5px solid var(--danger);
  color: #991B1B;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: .85rem;
  margin-bottom: 14px;
  animation: pulse-critical 1.5s infinite;
}

/* QR Guest Order chip */
.ko-qr-chip {
  background: #EEF2FF;
  color: #4F46E5;
  border: 1px solid #C7D2FE;
  padding: 1px 6px;
  border-radius: 99px;
  font-size: .68rem;
  font-weight: 700;
}
</style>
