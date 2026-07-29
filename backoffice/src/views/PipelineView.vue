<template>
  <div>
    <div class="pipeline-header">
      <h3>Order Pipeline</h3>
      <div class="pipeline-controls">
        <span class="sse-badge" :class="{ online: sse.connected.value }">
          {{ sse.connected.value ? '● Live' : '○ Connecting' }}
        </span>
        <button class="btn btn-sm btn-secondary" @click="loadOrders">Refresh</button>
      </div>
    </div>

    <!-- Pipeline lanes -->
    <div class="pipeline">
      <div v-for="stage in stages" :key="stage.key" class="pipeline-lane"
        @dragover.prevent
        @drop="onDrop($event, stage.key)"
      >
        <div class="lane-header" :style="{ background: stage.color }">
          <span>{{ stage.label }}</span>
          <span class="lane-count">{{ grouped[stage.key]?.length || 0 }}</span>
        </div>
        <div class="lane-body">
          <transition-group name="order-card">
            <div v-for="order in (grouped[stage.key] || [])" :key="order.id"
              class="order-card"
              draggable="true"
              @dragstart="onDragStart($event, order)"
              @click="selectOrder(order)"
            >
              <div class="order-card-top">
                <span class="order-id">#{{ order.id }}</span>
                <span class="order-time">{{ order.created ? order.created.slice(11, 19) : '' }}</span>
              </div>
              <div class="order-table">Table {{ order.tableId || '—' }}</div>
              <div class="order-items">{{ order.items }}</div>
              <div v-if="order.timer" class="order-timer" :class="{ urgent: order.timer > 600 }">
                ⏱ {{ formatTimer(order.timer) }}
              </div>
              <div class="order-card-footer">
                <span class="order-total">ETB {{ parseFloat(order.total||0).toFixed(0) }}</span>
              </div>
            </div>
          </transition-group>
          <div v-if="!(grouped[stage.key]?.length)" class="lane-empty">
            <div class="lane-empty-icon">{{ stage.emptyIcon }}</div>
            <div>{{ stage.emptyText }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Order Timeline Modal -->
    <div v-if="selectedOrder" class="modal-overlay" @click.self="selectedOrder=null">
      <div class="modal timeline-modal">
        <h3>Order #{{ selectedOrder.id }}</h3>
        <div class="modal-sub">Table {{ selectedOrder.tableId || '—' }} • ETB {{ parseFloat(selectedOrder.total||0).toFixed(0) }}</div>

        <div class="timeline">
          <div v-for="(step, i) in orderTimeline" :key="i" class="timeline-step"
            :class="{ active: step.active, future: step.future }"
          >
            <div class="tl-dot">
              <span v-if="step.active">✓</span>
              <span v-else-if="step.future">{{ i + 1 }}</span>
              <span v-else>✓</span>
            </div>
            <div class="tl-content">
              <div class="tl-title">{{ step.label }}</div>
              <div class="tl-time">{{ step.time }}</div>
            </div>
          </div>
        </div>

        <div class="timeline-actions">
          <button v-if="selectedOrder.status === 'new'" class="btn btn-warning" @click="updateStatus('preparing')">Send to Kitchen</button>
          <button v-if="selectedOrder.status === 'preparing'" class="btn btn-primary" @click="updateStatus('ready')">Mark Ready</button>
          <button v-if="selectedOrder.status === 'ready'" class="btn btn-success" @click="updateStatus('fulfilled')">Mark Served</button>
          <button v-if="selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'fulfilled'" class="btn btn-danger btn-sm" @click="updateStatus('cancelled')">Cancel</button>
          <button class="btn btn-secondary" @click="selectedOrder=null">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { apiGet, apiPut } from '../api'
import { useSSE } from '../composables/useSSE'

const toast = inject('toast')
const sse = useSSE()
const orders = ref([])
const selectedOrder = ref(null)
const dragOrder = ref(null)

const stages = [
  { key: 'new', label: 'New Orders', color: 'linear-gradient(135deg,#2563EB,#60A5FA)', emptyIcon: '📋', emptyText: 'No new orders' },
  { key: 'preparing', label: 'Preparing', color: 'linear-gradient(135deg,#D97706,#FBBF24)', emptyIcon: '👨‍🍳', emptyText: 'Nothing cooking' },
  { key: 'ready', label: 'Ready to Serve', color: 'linear-gradient(135deg,#7C3AED,#A78BFA)', emptyIcon: '🍽️', emptyText: 'Nothing ready' },
  { key: 'fulfilled', label: 'Served', color: 'linear-gradient(135deg,#16A34A,#86EFAC)', emptyIcon: '✅', emptyText: 'All served' },
  { key: 'cancelled', label: 'Cancelled', color: 'linear-gradient(135deg,#DC2626,#FCA5A5)', emptyIcon: '❌', emptyText: 'None cancelled' }
]

const grouped = computed(() => {
  const g = {}
  stages.forEach(s => { g[s.key] = [] })
  orders.value.forEach(o => {
    const k = o.status || 'new'
    if (g[k]) g[k].push(o)
  })
  // Sort each lane by time
  Object.values(g).forEach(arr => arr.sort((a, b) => (a.created || '').localeCompare(b.created || '')))
  return g
})

const orderTimeline = computed(() => {
  if (!selectedOrder.value) return []
  const o = selectedOrder.value
  const statusFlow = ['new', 'preparing', 'ready', 'fulfilled']
  const statusLabels = { new: 'Order Placed', preparing: 'Preparing', ready: 'Ready to Serve', fulfilled: 'Served' }
  const currentIdx = statusFlow.indexOf(o.status)
  return statusFlow.map((s, i) => ({
    label: statusLabels[s],
    time: i < currentIdx ? `Completed` : i === currentIdx ? 'Current' : '—',
    active: i <= currentIdx,
    future: i > currentIdx
  }))
})

let timerInterval = null

onMounted(() => {
  loadOrders()
  // Connect SSE to backend directly (bypass Vite proxy for long-lived connections)
  sse.connect('http://localhost:3000/api/events/kitchen')
  sse.on('new_order', (data) => {
    // Add to orders list
    orders.value.push({ ...data, timer: 0 })
    toast(`New order #${data.id}`, 'success')
  })
  sse.on('order_update', (data) => {
    const idx = orders.value.findIndex(o => o.id === data.id)
    if (idx !== -1) {
      orders.value[idx] = { ...orders.value[idx], ...data }
    }
  })
  // Timer for orders in progress
  timerInterval = setInterval(() => {
    const now = Date.now()
    orders.value.forEach(o => {
      if (o.status === 'preparing' && o.created) {
        const created = new Date(o.created).getTime()
        o.timer = Math.floor((now - created) / 1000)
      }
    })
  }, 1000)
})

onUnmounted(() => {
  sse.disconnect()
  if (timerInterval) clearInterval(timerInterval)
})

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function loadOrders() {
  try { orders.value = (await apiGet('orders')).filter(o => o.status !== 'fulfilled' && o.status !== 'cancelled') } catch (e) { console.error(e) }
}

function onDragStart(e, order) {
  dragOrder.value = order
  e.dataTransfer.effectAllowed = 'move'
}

async function onDrop(e, targetStatus) {
  if (!dragOrder.value) return
  const order = dragOrder.value
  if (order.status === targetStatus) { dragOrder.value = null; return }
  dragOrder.value = null
  try {
    await apiPut('orders', { id: order.id, status: targetStatus })
    order.status = targetStatus
    toast(`Order #${order.id} → ${targetStatus}`)
  } catch (err) {
    toast('Failed to update', 'error')
  }
}

function selectOrder(order) { selectedOrder.value = order }

async function updateStatus(status) {
  if (!selectedOrder.value) return
  try {
    await apiPut('orders', { id: selectedOrder.value.id, status })
    selectedOrder.value.status = status
    toast(`Order #${selectedOrder.value.id} → ${status}`)
  } catch (err) {
    toast('Failed to update', 'error')
  }
}
</script>

<style scoped>
.pipeline-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.pipeline-header h3{font-size:1.05rem;color:var(--text-heading);font-weight:600}
.pipeline-controls{display:flex;gap:10px;align-items:center}
.sse-badge{font-size:.72rem;padding:4px 10px;border-radius:99px;background:var(--red-50);color:var(--danger);font-weight:600}
.sse-badge.online{background:var(--green-50);color:var(--success)}

.pipeline{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;min-height:60vh}

.pipeline-lane{background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow-sm)}
.lane-header{padding:10px 14px;color:#fff;font-weight:600;font-size:.82rem;display:flex;justify-content:space-between;align-items:center}
.lane-count{background:rgba(255,255,255,.25);padding:1px 8px;border-radius:99px;font-size:.7rem}
.lane-body{flex:1;padding:8px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;min-height:200px;max-height:calc(100vh - 240px)}
.lane-empty{padding:32px 16px;text-align:center;color:var(--text-muted);font-size:.78rem;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center}
.lane-empty-icon{font-size:1.8rem;margin-bottom:6px}

.order-card{background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;cursor:grab;transition:all var(--duration-fast) var(--ease);box-shadow:var(--shadow-xs)}
.order-card:hover{border-color:var(--primary);box-shadow:var(--shadow-md);transform:translateY(-2px)}
.order-card:active{cursor:grabbing}
.order-card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.order-id{font-weight:700;font-size:.85rem;color:var(--text-heading);font-family:var(--font-mono)}
.order-time{font-size:.68rem;color:var(--text-muted);font-family:var(--font-mono)}
.order-table{font-size:.72rem;color:var(--primary);font-weight:500;margin-bottom:2px}
.order-items{font-size:.78rem;color:var(--text-body);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px}
.order-timer{font-size:.7rem;font-weight:600;color:var(--warning);font-family:var(--font-mono);margin-bottom:2px}
.order-timer.urgent{color:var(--danger);animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.order-card-footer{display:flex;justify-content:space-between;align-items:center;padding-top:4px;border-top:1px solid var(--border)}
.order-total{font-size:.78rem;font-weight:600;font-family:var(--font-mono);color:var(--text-heading)}

/* Transition group animations */
.order-card-move{transition:transform .3s var(--ease)}
.order-card-enter-active{transition:all .3s var(--ease-out)}
.order-card-leave-active{transition:all .2s var(--ease);position:absolute}
.order-card-enter-from{opacity:0;transform:translateY(-12px) scale(.95)}
.order-card-leave-to{opacity:0;transform:scale(.9)}

/* Timeline modal */
.timeline-modal{width:420px}
.timeline{padding:20px 0;position:relative}
.timeline::before{content:'';position:absolute;left:19px;top:20px;bottom:20px;width:2px;background:var(--border)}
.timeline-step{display:flex;gap:14px;padding:8px 0;position:relative;align-items:flex-start}
.tl-dot{width:40px;height:40px;border-radius:50%;background:var(--neutral-100);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.82rem;color:var(--text-muted);border:2px solid var(--border);flex-shrink:0;z-index:1;transition:all var(--duration-base) var(--ease)}
.timeline-step.active .tl-dot{background:var(--primary);border-color:var(--primary);color:#fff}
.timeline-step.future .tl-dot{background:var(--surface);border-color:var(--border-strong);color:var(--text-muted)}
.tl-content{padding-top:8px}
.tl-title{font-size:.88rem;font-weight:600;color:var(--text-heading)}
.tl-time{font-size:.72rem;color:var(--text-muted);margin-top:2px}
.timeline-actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--border);margin-top:8px}

@media(max-width:900px){.pipeline{grid-template-columns:repeat(3,1fr)}}
@media(max-width:600px){.pipeline{grid-template-columns:1fr 1fr}}
</style>
