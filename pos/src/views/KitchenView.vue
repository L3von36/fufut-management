<template>
  <div>
    <div class="table-toolbar">
      <h3>Kitchen Display</h3>
      <div class="kitchen-toolbar-actions">
        <button class="btn btn-sm" :class="muted ? 'btn-danger' : 'btn-outline'" @click="toggleMute" :title="muted ? 'Unmute kitchen alerts' : 'Mute kitchen alerts'">
          <svg v-if="!muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46A4.5 4.5 0 0 1 18 12c0 1.21-.47 2.31-1.24 3.13l1.44 1.44A6.95 6.95 0 0 0 20 12c0-1.87-.73-3.58-1.93-4.84l-.03.03z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46A4.5 4.5 0 0 1 18 12c0 1.21-.47 2.31-1.24 3.13l1.44 1.44A6.95 6.95 0 0 0 20 12c0-1.87-.73-3.58-1.93-4.84l-.03.03z"/></svg>
          <span v-if="muted" style="margin-left:4px">Muted</span>
        </button>
        <button class="btn btn-sm btn-outline" @click="refresh">Refresh</button>
      </div>
    </div>
    <div class="kitchen-grid">
      <div class="kitchen-column new">
        <h3>New Orders ({{ newOrders.length }})</h3>
        <div v-for="o in newOrders" :key="o.id" class="kitchen-order" :class="ageClass(o)">
          <div class="ko-header">
            <span class="ko-id">#{{ o.id }}</span>
            <span class="ko-time">{{ formatTime(o.created) }} | <span class="kitchen-timer" :class="timerClass(o)">{{ timerLabel(o) }}</span></span>
          </div>
          <div class="ko-items"><strong>{{ o.items }}</strong></div>
          <div class="ko-actions">
            <button class="btn btn-sm btn-primary" @click="updateStatus(o.id, 'preparing')">Start Preparing</button>
          </div>
        </div>
        <div v-if="!newOrders.length" class="kitchen-empty">No new orders</div>
      </div>
      <div class="kitchen-column preparing">
        <h3>Preparing ({{ preparing.length }})</h3>
        <div v-for="o in preparing" :key="o.id" class="kitchen-order" :class="ageClass(o)">
          <div class="ko-header">
            <span class="ko-id">#{{ o.id }}</span>
            <span class="ko-time">{{ formatTime(o.created) }} | <span class="kitchen-timer" :class="timerClass(o)">{{ timerLabel(o) }}</span></span>
          </div>
          <div class="ko-items"><strong>{{ o.items }}</strong></div>
          <div class="ko-actions">
            <button class="btn btn-sm btn-success" @click="updateStatus(o.id, 'ready')">Mark Ready</button>
          </div>
        </div>
        <div v-if="!preparing.length" class="kitchen-empty">Nothing in progress</div>
      </div>
      <div class="kitchen-column ready">
        <h3>Ready ({{ ready.length }})</h3>
        <div v-for="o in ready" :key="o.id" class="kitchen-order">
          <div class="ko-header">
            <span class="ko-id">#{{ o.id }}</span>
            <span class="ko-time">{{ formatTime(o.created) }}</span>
          </div>
          <div class="ko-items"><strong>{{ o.items }}</strong></div>
          <div class="ko-actions">
            <button class="btn btn-sm btn-outline" @click="updateStatus(o.id, 'fulfilled')">Fulfilled</button>
          </div>
        </div>
        <div v-if="!ready.length" class="kitchen-empty">Nothing ready yet</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiGet, apiPut } from '../api'
import { useToast } from '../composables/useToast'
import { useAudioAlerts } from '../composables/useAudioAlerts'

const { toast } = useToast()
const { muted, enabled, playNewOrder, playOrderReady, playOrderUpdate, toggleMute } = useAudioAlerts()
const orders = ref([])
let sse = null
let timer = null

const newOrders = computed(() => orders.value.filter(o => o.status === 'new'))
const preparing = computed(() => orders.value.filter(o => o.status === 'preparing'))
const ready = computed(() => orders.value.filter(o => o.status === 'ready'))

onMounted(() => {
  loadOrders()
  connectSSE()
  timer = setInterval(loadOrders, 15000)
})

onUnmounted(() => {
  if (sse) sse.close()
  if (timer) clearInterval(timer)
})

async function loadOrders() {
  try { orders.value = await apiGet('orders') } catch {}
}

function connectSSE() {
  const proto = window.location.protocol === 'https:' ? 'https' : 'http'
  sse = new EventSource(`${proto}://${window.location.host}/api/events/kitchen`)
  
  // Listen for specific event types for audio alerts
  sse.addEventListener('new_order', (e) => {
    try {
      const data = JSON.parse(e.data)
      loadOrders()
      playNewOrder()
      toast(`New order #${data.id?.slice(-4) || 'received'}`, 'info')
    } catch {}
  })

  sse.addEventListener('order_update', (e) => {
    try {
      const data = JSON.parse(e.data)
      loadOrders()
      if (data.status === 'ready') {
        playOrderReady()
        toast(`Order ${data.id?.slice(-4) || ''} is ready!`, 'success')
      } else {
        playOrderUpdate()
      }
    } catch {}
  })

  sse.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      loadOrders()
    } catch {}
  }
  sse.onerror = () => {}
}

async function updateStatus(id, status) {
  const o = orders.value.find(x => x.id === id)
  if (!o) return
  o.status = status
  try {
    await apiPut('orders', o)
    toast(`Order ${status}`)
    if (status === 'ready') {
      playOrderReady()
    } else {
      playOrderUpdate()
    }
    loadOrders()
  } catch { toast('Failed to update', 'error') }
}

function formatTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString()
}

function ageInMinutes(o) {
  if (!o.created) return 0
  return (Date.now() - new Date(o.created).getTime()) / 60000
}

function ageClass(o) {
  const m = ageInMinutes(o)
  if (m >= 10) return 'age-critical'
  if (m >= 5) return 'age-warning'
  return 'age-normal'
}

function timerClass(o) {
  const m = ageInMinutes(o)
  if (m >= 10) return 'timer-critical'
  if (m >= 5) return 'timer-warning'
  return ''
}

function timerLabel(o) {
  const m = Math.round(ageInMinutes(o))
  if (m >= 10) return `${m}m CRITICAL`
  if (m >= 5) return `${m}m WARNING`
  return `${m}m`
}

function refresh() { loadOrders() }
</script>

<style scoped>
.kitchen-timer{font-size:.7rem;font-family:var(--font-mono)}
.timer-warning{color:var(--warning);font-weight:600}
.timer-critical{color:var(--danger);font-weight:700}
.kitchen-toolbar-actions{display:flex;gap:8px;align-items:center}
.kitchen-order{position:relative;transition:transform .2s,box-shadow .2s}
.kitchen-order.age-warning{animation: pulse-warning 2s infinite;}
.kitchen-order.age-critical{animation: pulse-critical 1s infinite;}
@keyframes pulse-warning{0%,100%{box-shadow:0 0 0 0 rgba(217,119,6,0)}50%{box-shadow:0 0 0 8px rgba(217,119,6,.2)}}
@keyframes pulse-critical{0%,100%{box-shadow:0 0 0 0 rgba(211,47,47,0)}50%{box-shadow:0 0 0 8px rgba(211,47,47,.3)}}
@media(prefers-reduced-motion:reduce){.kitchen-order{animation:none!important}}
</style>
