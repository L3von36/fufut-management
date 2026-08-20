<template>
  <div class="pipeline-root">
    <!-- Header -->
    <div class="pipeline-header">
      <div class="pipeline-title">
        <span class="pipeline-icon">🚦</span>
        <div>
          <h2>Order Pipeline</h2>
          <p>Drag cards between lanes to update status</p>
        </div>
      </div>
      <div class="pipeline-controls">
        <span class="sse-badge" :class="{ online: sse.connected }">
          <span class="sse-dot"></span>
          {{ sse.connected ? 'Live' : 'Connecting…' }}
        </span>
        <button class="btn btn-sm btn-secondary" @click="loadOrders">↺ Refresh</button>
      </div>
    </div>

    <!-- Kanban Board -->
    <div class="pipeline">
      <div
        v-for="stage in stages"
        :key="stage.key"
        class="pipeline-lane"
        :class="{ 'drag-over': dragOver === stage.key }"
        :style="{ '--accent': stage.accent }"
        :data-stage="stage.key"
        @dragover.prevent="dragOver = stage.key"
        @dragleave="dragOver = null"
        @drop="onDrop($event, stage.key); dragOver = null"
        @touchmove.passive="onTouchMove"
        @touchend="onTouchEnd"
      >
        <!-- Lane header -->
        <div class="lane-header">
          <div class="lane-header-left">
            <span class="lane-icon">{{ stage.icon }}</span>
            <span class="lane-label">{{ stage.label }}</span>
          </div>
          <span class="lane-count">{{ grouped[stage.key]?.length || 0 }}</span>
        </div>

        <!-- Cards -->
        <div class="lane-body">
          <transition-group name="card">
            <div
              v-for="order in (grouped[stage.key] || [])"
              :key="order.id"
              class="order-card"
              :class="{ 'card-urgent': order.timer > 600 }"
              draggable="true"
              @dragstart="onDragStart($event, order)"
              @touchstart="onTouchStart($event, order)"
              @click="selectOrder(order)"
            >
              <div class="card-top">
                <span class="card-id">#{{ order.id?.slice(-5).toUpperCase() }}</span>
                <span class="card-time">{{ order.created ? order.created.slice(11,16) : '—' }}</span>
              </div>

              <div class="card-meta">
                <span v-if="order.table_number || order.tableId" class="meta-chip">🪑 Table {{ order.table_number || order.tableId }}</span>
                <span v-if="order.customer && order.customer !== 'Walk-in'" class="meta-chip">👤 {{ order.customer }}</span>
                <span v-if="order.order_type || order.type" class="meta-chip type-chip">{{ order.order_type || order.type }}</span>
              </div>

              <div class="card-items">
                <template v-if="getStructuredLines(order).length">
                  <div v-for="(line, li) in getStructuredLines(order).slice(0,3)" :key="li" class="item-row">
                    <span class="item-qty">{{ line.qty }}×</span>
                    <span class="item-name">{{ line.name }}</span>
                    <span v-if="line.modifiers.length" class="item-mods">· {{ line.modifiers.join(', ') }}</span>
                  </div>
                  <div v-if="getStructuredLines(order).length > 3" class="item-more">+{{ getStructuredLines(order).length - 3 }} more</div>
                </template>
                <span v-else class="item-fallback">{{ formatOrderItems(order.items) }}</span>
              </div>

              <div v-if="order.timer" class="card-timer" :class="{ urgent: order.timer > 600 }">
                ⏱ {{ formatTimer(order.timer) }}
                <span v-if="order.timer > 600" class="timer-warn">LATE</span>
              </div>

              <div class="card-footer">
                <span class="card-total">ETB {{ parseFloat(order.total||0).toFixed(0) }}</span>
                <span class="card-drag-hint">⠿</span>
              </div>
            </div>
          </transition-group>

          <div v-if="!(grouped[stage.key]?.length)" class="lane-empty">
            <div class="empty-icon">{{ stage.emptyIcon }}</div>
            <div class="empty-text">{{ stage.emptyText }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Order Detail Modal -->
    <transition name="modal">
      <div v-if="selectedOrder" class="modal-overlay" @click.self="selectedOrder = null">
        <div class="detail-modal">
          <div class="detail-header">
            <div>
              <div class="detail-order-id">#{{ selectedOrder.id }}</div>
              <div class="detail-sub">
                <span v-if="selectedOrder.table_number || selectedOrder.tableId">🪑 Table {{ selectedOrder.table_number || selectedOrder.tableId }}</span>
                <span>ETB {{ parseFloat(selectedOrder.total||0).toFixed(0) }}</span>
                <span class="detail-status-badge" :class="'status-' + selectedOrder.status">{{ selectedOrder.status }}</span>
              </div>
            </div>
            <button class="modal-close" @click="selectedOrder = null">✕</button>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Order Items</div>
            <div class="detail-items-box">
              <template v-if="getStructuredLines(selectedOrder).length">
                <div v-for="(line, li) in getStructuredLines(selectedOrder)" :key="li" class="detail-item-row">
                  <span class="detail-qty">{{ line.qty }}×</span>
                  <div class="detail-item-info">
                    <span class="detail-item-name">{{ line.name }}</span>
                    <span v-if="line.modifiers.length" class="detail-item-mods">{{ line.modifiers.join(', ') }}</span>
                  </div>
                </div>
              </template>
              <div v-else class="detail-items-text">{{ formatOrderItems(selectedOrder.items) }}</div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Status Timeline</div>
            <div class="timeline">
              <div
                v-for="(step, i) in orderTimeline"
                :key="i"
                class="tl-step"
                :class="{ done: step.active && i < currentStepIdx, current: i === currentStepIdx, future: step.future }"
              >
                <div class="tl-track">
                  <div class="tl-dot">
                    <span v-if="step.active && !step.future">✓</span>
                    <span v-else>{{ i + 1 }}</span>
                  </div>
                  <div class="tl-line" v-if="i < orderTimeline.length - 1"></div>
                </div>
                <div class="tl-content">
                  <div class="tl-label">{{ step.label }}</div>
                  <div class="tl-time">{{ step.time }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="detail-actions">
            <button v-if="selectedOrder.status === 'new'" class="btn btn-warning" @click="updateStatus('preparing')">Send to Kitchen</button>
            <button v-if="selectedOrder.status === 'preparing'" class="btn btn-primary" @click="updateStatus('ready')">Mark Ready</button>
            <button v-if="selectedOrder.status === 'ready'" class="btn btn-success" @click="updateStatus('fulfilled')">Mark Served</button>
            <button
              v-if="auth.roleKey === 'manager' && selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'fulfilled'"
              class="btn btn-danger btn-sm"
              @click="updateStatus('cancelled')"
            >Cancel</button>
            <button class="btn btn-secondary" @click="selectedOrder = null">Close</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Fix #10: Cancel confirmation dialog -->
    <transition name="modal">
      <div v-if="cancelConfirm" class="modal-overlay" @click.self="dismissCancel">
        <div class="confirm-modal">
          <div class="confirm-icon">⚠️</div>
          <div class="confirm-title">Cancel Order?</div>
          <div class="confirm-text">
            Order #{{ cancelConfirm.id?.slice(-5).toUpperCase() }} will be cancelled.
            This action cannot be undone.
          </div>
          <div class="confirm-actions">
            <button class="btn btn-danger" @click="confirmCancel">Yes, Cancel Order</button>
            <button class="btn btn-secondary" @click="dismissCancel">Keep Order</button>
          </div>
        </div>
      </div>
    </transition>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { apiGet, apiPut } from '../api'
import { useSSE } from '../composables/useSSE'
import { useAuthStore } from '../stores/auth'
import { useAudioAlerts } from '../composables/useAudioAlerts'
import { getStructuredLines, getOrderLines } from '../lib/orderLines'

const toast = inject('toast')
const auth = useAuthStore()
const sse = useSSE()
const { muted: audioMuted, playNewOrder, playOrderReady, playOrderUpdate } = useAudioAlerts()
const orders = ref([])
const activeItems = ref([])
const selectedOrder = ref(null)
const dragOrder = ref(null)
const dragOver = ref(null)
// Fix #10: Cancel confirmation state
const cancelConfirm = ref(null)

const stages = [
  { key: 'new',       label: 'New Orders',     accent: '#3B82F6', icon: '📋', emptyIcon: '📭', emptyText: 'No new orders' },
  { key: 'preparing', label: 'Preparing',      accent: '#F59E0B', icon: '👨‍🍳', emptyIcon: '🍳', emptyText: 'Nothing cooking' },
  { key: 'ready',     label: 'Ready to Serve', accent: '#8B5CF6', icon: '🔔', emptyIcon: '🛎️', emptyText: 'Nothing ready' },
  { key: 'fulfilled', label: 'Served',          accent: '#10B981', icon: '✅', emptyIcon: '🎉', emptyText: 'All served' },
  { key: 'cancelled', label: 'Cancelled',       accent: '#EF4444', icon: '✕',  emptyIcon: '🚫', emptyText: 'None cancelled' }
]

const grouped = computed(() => {
  const g = {}
  stages.forEach(s => { g[s.key] = [] })
  orders.value.forEach(o => {
    const k = o.status || 'new'
    if (g[k]) g[k].push(o)
  })
  Object.values(g).forEach(arr => arr.sort((a, b) => (a.created || '').localeCompare(b.created || '')))
  return g
})

const orderTimeline = computed(() => {
  if (!selectedOrder.value) return []
  const flow = ['new', 'preparing', 'ready', 'fulfilled']
  const labels = { new: 'Order Placed', preparing: 'Preparing', ready: 'Ready to Serve', fulfilled: 'Served' }
  const idx = flow.indexOf(selectedOrder.value.status)
  return flow.map((s, i) => ({
    label: labels[s],
    time: i < idx ? 'Completed' : i === idx ? 'In Progress' : 'Pending',
    active: i <= idx,
    future: i > idx
  }))
})

const currentStepIdx = computed(() => {
  if (!selectedOrder.value) return -1
  return ['new', 'preparing', 'ready', 'fulfilled'].indexOf(selectedOrder.value.status)
})

let timerInterval = null
// Fix #7: Touch drag state
let touchStartCard = null
let touchClone = null
let touchOrderId = null

onMounted(() => {
  loadOrders()
  sse.connect('kitchen')
  sse.on('new_order', (data) => {
    orders.value.push({ ...data, timer: 0 })
    toast(`New order #${data.id}`, 'success')
    playNewOrder()
  })
  sse.on('order_update', (data) => {
    const idx = orders.value.findIndex(o => o.id === data.id)
    if (idx !== -1) orders.value[idx] = { ...orders.value[idx], ...data }
    if (data.status === 'ready') playOrderReady()
    else playOrderUpdate()
  })
  // Fix #9: Timer for all active statuses (new + preparing), not just preparing
  timerInterval = setInterval(() => {
    const now = Date.now()
    orders.value.forEach(o => {
      if (o.created && (o.status === 'preparing' || o.status === 'new')) {
        o.timer = Math.floor((now - new Date(o.created).getTime()) / 1000)
      }
    })
  }, 1000)
})

onUnmounted(() => {
  sse.disconnect()
  if (timerInterval) clearInterval(timerInterval)
})

function formatTimer(s) {
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}



// getStructuredLines and getOrderLines are now imported from lib/orderLines.js (Fix #13)

async function loadOrders() {
  try {
    const [ordersRes, itemsRes] = await Promise.allSettled([
      apiGet('orders'),
      apiGet('orders/items/active')
    ])
    if (ordersRes.status === 'fulfilled') orders.value = ordersRes.value || []
    // Fix #12: Load per-line tracking items for structured rendering
    if (itemsRes.status === 'fulfilled' && Array.isArray(itemsRes.value)) {
      activeItems.value = itemsRes.value
    }
  } catch (e) { console.error(e) }
}

/** Items belonging to one order, from the active tracking feed. */
const itemsByOrder = computed(() => {
  const map = new Map()
  for (const item of activeItems.value) {
    if (!map.has(item.order_id)) map.set(item.order_id, [])
    map.get(item.order_id).push(item)
  }
  return map
})

function onDragStart(e, order) {
  dragOrder.value = order
  e.dataTransfer.effectAllowed = 'move'
}

// Fix #7: Touch drag & drop handlers for mobile
function onTouchStart(e, order) {
  const touch = e.touches[0]
  touchStartCard = { x: touch.clientX, y: touch.clientY, order }
  touchOrderId = order.id
}

function onTouchMove(e) {
  if (!touchStartCard) return
  e.preventDefault()
  const touch = e.touches[0]
  const dx = touch.clientX - touchStartCard.x
  const dy = touch.clientY - touchStartCard.y
  // Start drag after 10px movement
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    if (!touchClone) {
      touchClone = document.createElement('div')
      touchClone.className = 'touch-drag-clone'
      touchClone.textContent = `#${touchStartCard.order.id?.slice(-5).toUpperCase()}`
      touchClone.style.cssText = 'position:fixed;z-index:9999;padding:8px 14px;background:var(--surface);border:2px solid var(--primary);border-radius:10px;font-size:.8rem;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.2);pointer-events:none;transform:rotate(3deg);'
      document.body.appendChild(touchClone)
    }
    touchClone.style.left = `${touch.clientX - 40}px`
    touchClone.style.top = `${touch.clientY - 20}px`
    // Detect lane under touch
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const lane = el?.closest('.pipeline-lane')
    dragOver.value = lane?.dataset?.stage || null
  }
}

function onTouchEnd(e) {
  if (touchClone) {
    document.body.removeChild(touchClone)
    touchClone = null
  }
  if (touchStartCard && dragOver.value) {
    // Find the order object from current state
    const order = orders.value.find(o => o.id === touchOrderId)
    if (order && order.status !== dragOver.value) {
      doStatusUpdate(order.id, dragOver.value)
    }
  }
  touchStartCard = null
  touchOrderId = null
  dragOver.value = null
}

async function onDrop(e, targetStatus) {
  if (!dragOrder.value) return
  const order = dragOrder.value
  if (order.status === targetStatus) { dragOrder.value = null; return }
  dragOrder.value = null
  doStatusUpdate(order.id, targetStatus)
}

// Shared status update function used by drag, touch, and modal
async function doStatusUpdate(id, targetStatus) {
  try {
    await apiPut('orders/' + id, { id, status: targetStatus })
    const o = orders.value.find(x => x.id === id)
    if (o) o.status = targetStatus
    toast(`Order #${id.slice(-5)} → ${targetStatus}`)
    if (targetStatus === 'ready') playOrderReady()
    else playOrderUpdate()
  } catch { toast('Failed to update', 'error') }
}

function selectOrder(order) { selectedOrder.value = order }

async function updateStatus(status) {
  if (!selectedOrder.value) return
  // Fix #10: Confirmation for cancel
  if (status === 'cancelled') {
    cancelConfirm.value = selectedOrder.value
    return
  }
  await doStatusUpdate(selectedOrder.value.id, status)
  selectedOrder.value = null
}

async function confirmCancel() {
  if (!cancelConfirm.value) return
  await doStatusUpdate(cancelConfirm.value.id, 'cancelled')
  cancelConfirm.value = null
  selectedOrder.value = null
}

function dismissCancel() {
  cancelConfirm.value = null
}
</script>

<style scoped>
.pipeline-root { display: flex; flex-direction: column; gap: 20px; }

/* Header */
.pipeline-header {
  display: flex; justify-content: space-between; align-items: center;
}
.pipeline-title { display: flex; align-items: center; gap: 14px; }
.pipeline-icon { font-size: 1.7rem; }
.pipeline-title h2 { font-size: 1.15rem; font-weight: 700; color: var(--text-heading); margin: 0; line-height: 1.2; }
.pipeline-title p { font-size: .73rem; color: var(--text-muted); margin: 2px 0 0; }
.pipeline-controls { display: flex; gap: 10px; align-items: center; }

.sse-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: .71rem; font-weight: 600; padding: 5px 12px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger); border: 1px solid currentColor;
}
.sse-badge.online {
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
}
.sse-dot {
  width: 6px; height: 6px; border-radius: 50%; background: currentColor;
  animation: blink 1.4s ease infinite;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.25} }

/* Board */
.pipeline {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  align-items: start;
}

/* Lane */
.pipeline-lane {
  background: var(--surface);
  border-radius: 14px;
  border: 2px solid var(--border);
  display: flex; flex-direction: column;
  overflow: hidden;
  transition: border-color .18s, box-shadow .18s;
  box-shadow: 0 2px 8px rgba(0,0,0,.05);
}
.pipeline-lane.drag-over {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}

.lane-header {
  padding: 11px 14px;
  display: flex; justify-content: space-between; align-items: center;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-bottom: 2px solid color-mix(in srgb, var(--accent) 18%, transparent);
}
.lane-header-left { display: flex; align-items: center; gap: 8px; }
.lane-icon { font-size: 1rem; }
.lane-label { font-size: .8rem; font-weight: 700; color: var(--accent); letter-spacing: .02em; }
.lane-count {
  background: var(--accent); color: #fff;
  font-size: .68rem; font-weight: 800;
  padding: 2px 9px; border-radius: 99px; min-width: 22px; text-align: center;
}

.lane-body {
  flex: 1; padding: 10px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
  max-height: calc(100vh - 240px);
}
.lane-body::-webkit-scrollbar { width: 3px; }
.lane-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }

/* Order card */
.order-card {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 11px 13px;
  cursor: grab;
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.order-card:hover {
  border-color: var(--primary);
  box-shadow: 0 6px 20px rgba(99,102,241,.16);
  transform: translateY(-2px);
}
.order-card:active { cursor: grabbing; transform: scale(.98); }
.order-card.card-urgent { border-left: 3px solid var(--danger) !important; }

.card-top {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px;
}
.card-id { font-weight: 800; font-size: .8rem; color: var(--text-heading); font-family: var(--font-mono); letter-spacing: .04em; }
.card-time { font-size: .68rem; color: var(--text-muted); font-family: var(--font-mono); }

.card-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; }
.meta-chip {
  font-size: .67rem; font-weight: 500; padding: 2px 7px; border-radius: 5px;
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
  color: var(--text-body);
}
.type-chip {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
}

.card-items { margin-bottom: 6px; }
.item-row { display: flex; align-items: baseline; gap: 4px; line-height: 1.65; }
.item-qty { font-family: var(--font-mono); font-weight: 700; color: var(--primary); font-size: .7rem; min-width: 20px; }
.item-name { font-size: .77rem; color: var(--text-body); font-weight: 500; }
.item-mods { font-size: .67rem; color: var(--text-muted); font-style: italic; }
.item-more { font-size: .67rem; color: var(--text-muted); padding-left: 22px; }
.item-fallback {
  font-size: .74rem; color: var(--text-body); line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}

.card-timer {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: .68rem; font-weight: 700; font-family: var(--font-mono);
  color: var(--warning); margin-bottom: 6px;
}
.card-timer.urgent { color: var(--danger); }
.timer-warn {
  font-size: .58rem; background: var(--danger); color: #fff;
  padding: 1px 5px; border-radius: 4px; font-weight: 800; letter-spacing: .05em;
  animation: pulse 1s ease infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

.card-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding-top: 7px; border-top: 1px solid var(--border);
}
.card-total { font-size: .78rem; font-weight: 700; font-family: var(--font-mono); color: var(--text-heading); }
.card-drag-hint { font-size: 1.1rem; color: var(--border); opacity: .7; }

/* Card transitions */
.card-move { transition: transform .28s ease; }
.card-enter-active { transition: all .22s cubic-bezier(.34,1.56,.64,1); }
.card-leave-active { transition: all .16s ease; position: absolute; width: calc(100% - 20px); }
.card-enter-from { opacity: 0; transform: translateY(-10px) scale(.96); }
.card-leave-to { opacity: 0; transform: scale(.9); }

/* Empty state */
.lane-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 36px 16px; text-align: center;
}
.empty-icon { font-size: 2rem; margin-bottom: 8px; opacity: .4; }
.empty-text { font-size: .73rem; color: var(--text-muted); }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  backdrop-filter: blur(4px); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.modal-enter-active, .modal-leave-active { transition: opacity .2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.detail-modal {
  background: var(--surface);
  border-radius: 18px;
  width: 100%; max-width: 460px;
  padding: 0;
  box-shadow: 0 24px 60px rgba(0,0,0,.22);
  border: 1px solid var(--border);
  max-height: 90vh; overflow-y: auto;
  display: flex; flex-direction: column;
}

.detail-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--border);
}
.detail-order-id { font-size: 1.3rem; font-weight: 800; font-family: var(--font-mono); color: var(--text-heading); }
.detail-sub { display: flex; align-items: center; gap: 10px; margin-top: 5px; flex-wrap: wrap; font-size: .78rem; color: var(--text-muted); }
.detail-status-badge {
  font-size: .68rem; font-weight: 700; padding: 2px 10px; border-radius: 99px; text-transform: capitalize;
}
.status-new { background: #dbeafe; color: #1d4ed8; }
.status-preparing { background: #fef3c7; color: #92400e; }
.status-ready { background: #ede9fe; color: #5b21b6; }
.status-fulfilled { background: #d1fae5; color: #065f46; }
.status-cancelled { background: #fee2e2; color: #991b1b; }

.modal-close {
  width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border);
  background: transparent; cursor: pointer; font-size: .85rem; color: var(--text-muted);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: background .15s, color .15s;
}
.modal-close:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); }

.detail-section { padding: 18px 24px; border-bottom: 1px solid var(--border); }
.detail-section:last-of-type { border-bottom: none; }
.detail-section-title {
  font-size: .68rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 12px;
}

.detail-items-box {
  background: color-mix(in srgb, var(--text-muted) 5%, transparent);
  border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.detail-item-row { display: flex; gap: 10px; align-items: flex-start; }
.detail-qty { font-family: var(--font-mono); font-weight: 700; color: var(--primary); font-size: .82rem; min-width: 24px; padding-top: 1px; }
.detail-item-info { display: flex; flex-direction: column; }
.detail-item-name { font-size: .85rem; font-weight: 600; color: var(--text-heading); }
.detail-item-mods { font-size: .72rem; color: var(--text-muted); font-style: italic; margin-top: 1px; }
.detail-items-text { font-size: .82rem; color: var(--text-body); line-height: 1.6; }

/* Timeline */
.timeline { display: flex; flex-direction: column; }
.tl-step { display: flex; gap: 14px; }
.tl-track { display: flex; flex-direction: column; align-items: center; }
.tl-dot {
  width: 30px; height: 30px; border-radius: 50%;
  border: 2px solid var(--border);
  background: var(--surface); color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  font-size: .72rem; font-weight: 700; flex-shrink: 0; z-index: 1;
  transition: all .2s ease;
}
.tl-step.done .tl-dot { background: var(--success); border-color: var(--success); color: #fff; }
.tl-step.current .tl-dot {
  background: var(--primary); border-color: var(--primary); color: #fff;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 20%, transparent);
}
.tl-line { flex: 1; width: 2px; background: var(--border); min-height: 18px; margin: 3px 0; }
.tl-step.done .tl-line { background: var(--success); }
.tl-content { padding: 4px 0 18px; }
.tl-label { font-size: .84rem; font-weight: 600; color: var(--text-heading); }
.tl-time { font-size: .7rem; color: var(--text-muted); margin-top: 2px; }

.detail-actions {
  display: flex; gap: 8px; flex-wrap: wrap;
  padding: 20px 24px;
  border-top: 1px solid var(--border);
}

/* Responsive */
/* Fix #10: Cancel confirmation modal */
.confirm-modal {
  background: var(--surface); border-radius: 16px; padding: 28px;
  max-width: 380px; width: 100%; text-align: center;
  box-shadow: 0 24px 60px rgba(0,0,0,.25); border: 1px solid var(--border);
}
.confirm-icon { font-size: 2.5rem; margin-bottom: 12px; }
.confirm-title { font-size: 1.1rem; font-weight: 700; color: var(--text-heading); margin-bottom: 8px; }
.confirm-text { font-size: .82rem; color: var(--text-muted); margin-bottom: 20px; line-height: 1.5; }
.confirm-actions { display: flex; gap: 10px; justify-content: center; }

/* Fix #8: Horizontal scroll on tablet for 5 columns */
@media (max-width: 1100px) {
  .pipeline { grid-template-columns: repeat(3, minmax(220px, 1fr)); overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 8px; }
}
@media (max-width: 700px)  { .pipeline { grid-template-columns: repeat(2, minmax(200px, 1fr)); } }
@media (max-width: 460px)  { .pipeline { grid-template-columns: 1fr; } }
</style>
