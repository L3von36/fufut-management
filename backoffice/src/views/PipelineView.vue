<template>
  <div>
    <div class="pipeline-header">
      <h3>Order Pipeline</h3>
      <div class="pipeline-controls">
        <span class="sse-badge" :class="{ online: sse.connected.value }">
          {{ sse.connected.value ? '● Live' : '○ Connecting' }}
        </span>
        <base-button text="Refresh" variant="btn-secondary" extra-class="btn-sm" :on-click="loadOrders" />
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
          <base-button v-if="selectedOrder.status === 'new'" text="Send to Kitchen" variant="btn-warning" :on-click="() => updateStatus('preparing')" />
          <base-button v-if="selectedOrder.status === 'preparing'" text="Mark Ready" variant="btn-primary" :on-click="() => updateStatus('ready')" />
          <base-button v-if="selectedOrder.status === 'ready'" text="Mark Served" variant="btn-success" :on-click="() => updateStatus('fulfilled')" />
          <base-button v-if="selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'fulfilled'" text="Cancel" variant="btn-danger" extra-class="btn-sm" :on-click="() => updateStatus('cancelled')" />
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
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const sse = useSSE()
const orders = ref([])
const selectedOrder = ref(null)
const dragOrder = ref(null)
const btnState = useButtonState({ successDuration: 1500 })

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
  sse.connect('http://localhost:3000/api/events/kitchen')
  sse.on('new_order', (data) => {
    orders.value.push({ ...data, timer: 0 })
    toast(`New order #${data.id}`, 'success')
  })
  sse.on('order_update', (data) => {
    const idx = orders.value.findIndex(o => o.id === data.id)
    if (idx !== -1) { orders.value[idx] = { ...orders.value[idx], ...data } }
  })
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
    toast(`Order ${status}`)
    selectedOrder.value.status = status
    loadOrders()
  } catch (e) { toast('Failed to update', 'error'); throw e }
}
</script>