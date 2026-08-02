<template>
  <div>
    <div class="table-toolbar">
      <h3>Orders <span v-if="newCount > 0" class="new-badge">{{ newCount }} new</span></h3>
      <div style="display:flex;gap:8px;align-items:center">
        <select v-model="filter" class="select select-sm">
          <option value="">All Statuses</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
        <span class="badge badge-muted">{{ filtered.length }} order(s)</span>
        <button class="btn btn-outline btn-sm" :class="{ 'btn-muted': soundMuted }" @click="toggleSound" :title="soundMuted ? 'Sound alerts off' : 'Sound alerts on'">
          {{ soundMuted ? '🔇' : '🔔' }} Sound
        </button>
        <base-button text="⟳ Refresh" variant="btn-outline btn-sm" :on-click="loadData" loading-label="Refreshing..." success-label="Updated ✓" error-label="Refresh Failed"></base-button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in filtered" :key="o.id" :class="{ 'row-new': o.status === 'new' && !seenIds.has(o.id) }">
              <td><code class="order-id">{{ o.id }}</code></td>
              <td>
                <span v-if="o.name || o.phone || o.email" class="cust-cell">
                  <strong v-if="o.name">{{ o.name }}</strong>
                  <span v-if="o.phone" class="text-muted">{{ o.phone }}</span>
                  <span v-if="o.email" class="text-muted">{{ o.email }}</span>
                </span>
                <span v-else class="text-muted">Walk-in / Web</span>
              </td>
              <td>{{ formatItems(o.items) }}</td>
              <td><strong>ETB {{ (Number(o.total) || 0).toFixed(0) }}</strong></td>
              <td class="text-muted">{{ formatDate(o.created) }}</td>
              <td>
                <select class="status-select" :class="'status-' + (o.status||'new')" v-model="o.status" @change="updateStatus(o)">
                  <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                </select>
              </td>
              <td>
                <base-button text="Delete" variant="btn-sm btn-ghost" extra-class="btn-danger-text" :on-click="() => handleDelete(o)" loading-label="Deleting..." success-label="Deleted ✓"></base-button>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="7" class="empty-state" style="padding:48px;text-align:center;color:var(--text-muted)">
                <div style="font-size:2rem;margin-bottom:8px">📋</div>
                No orders found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span>{{ filtered.length }} order(s)</span>
        <span v-if="lastChecked" class="text-muted" style="font-size:.75rem">Last updated: {{ lastChecked }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiGet, apiPut, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
const { toast, success: toastOk, error: toastErr, info: toastInfo } = useToast()

const items = ref([])
const filter = ref('')
const statuses = ['new', 'pending', 'confirmed', 'ready', 'completed', 'cancelled']
const seenIds = ref(new Set())
const soundMuted = ref(localStorage.getItem('orders_sound_muted') === 'true')
const lastChecked = ref('')
const newCount = computed(() => items.value.filter(o => o.status === 'new' && !seenIds.value.has(o.id)).length)

// Emit badge count to parent via a custom event on the window
function emitBadge(count) {
  window.dispatchEvent(new CustomEvent('orders-badge', { detail: count }))
}

const filtered = computed(() => {
  const list = !filter.value ? items.value : items.value.filter(o => o.status === filter.value)
  return [...list].sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0))
})

// Web Audio API sound alert
function playAlert() {
  if (soundMuted.value) return
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const chime = (freq, start, duration) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + start)
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }
    chime(880, 0, 0.3)
    chime(1100, 0.18, 0.3)
    chime(1320, 0.36, 0.4)
  } catch (e) {
    // Audio not available
  }
}

function toggleSound() {
  soundMuted.value = !soundMuted.value
  localStorage.setItem('orders_sound_muted', soundMuted.value)
  if (!soundMuted.value) playAlert() // preview sound when enabling
}

let pollTimer = null

onMounted(() => {
  loadData()
  // Restore previously seen IDs from session
  try {
    const saved = JSON.parse(sessionStorage.getItem('orders_seen') || '[]')
    seenIds.value = new Set(saved)
  } catch {}
  // Poll every 15 seconds
  pollTimer = setInterval(pollOrders, 15000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

async function loadData() {
  try {
    const data = await apiGet('orders')
    const list = Array.isArray(data) ? data : []
    // On first load, mark all existing 'new' orders as seen so we don't alert for old ones
    if (items.value.length === 0) {
      list.forEach(o => seenIds.value.add(o.id))
      saveSeen()
    }
    items.value = list
    updateBadge()
    const now = new Date()
    lastChecked.value = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch (e) {
    toastErr('Failed to load orders')
    throw e
  }
}

async function pollOrders() {
  try {
    const data = await apiGet('orders')
    const list = Array.isArray(data) ? data : []
    const currentIds = new Set(items.value.map(o => o.id))
    const incoming = list.filter(o => !currentIds.has(o.id) && o.status === 'new')
    if (incoming.length > 0) {
      playAlert()
      const label = incoming.length === 1
        ? `New order from ${incoming[0].name || 'a customer'}!`
        : `${incoming.length} new orders arrived!`
      toastInfo(label)
      // Browser notification
      if (Notification.permission === 'granted') {
        new Notification('FU FUT COFFEE — New Order', { body: label, icon: '/assets/logo.webp' })
      } else if (Notification.permission === 'default') {
        Notification.requestPermission()
      }
    }
    items.value = list
    updateBadge()
    const now = new Date()
    lastChecked.value = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    // Silent poll failures
  }
}

function updateBadge() {
  const count = items.value.filter(o => o.status === 'new' && !seenIds.value.has(o.id)).length
  emitBadge(count)
}

function saveSeen() {
  try { sessionStorage.setItem('orders_seen', JSON.stringify([...seenIds.value])) } catch {}
}

function formatItems(its) {
  if (!its) return '—'
  // API may return items as a JSON string — parse it first
  let parsed = its
  if (typeof its === 'string') {
    try { parsed = JSON.parse(its) } catch { return its }
  }
  if (Array.isArray(parsed)) {
    return parsed.map(i => (typeof i === 'string' ? i : `${i.name || 'Item'}${i.qty > 1 ? ' ×' + i.qty : ''}`)).join(', ')
  }
  return String(its)
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function updateStatus(o) {
  try {
    // Mark as seen when staff changes status away from 'new'
    if (o.status !== 'new') {
      seenIds.value.add(o.id)
      saveSeen()
      updateBadge()
    }
    await apiPut('orders/' + o.id, { status: o.status })
    toastOk('Status updated to ' + o.status)
  } catch {
    toastErr('Failed to update status')
  }
}

async function handleDelete(o) {
  if (!confirm('Delete order ' + o.id + '?')) return
  try {
    await apiDelete('orders/' + o.id)
    seenIds.value.add(o.id)
    saveSeen()
    toastOk('Order deleted')
    await loadData()
  } catch (e) {
    toastErr('Failed to delete')
    throw e
  }
}
</script>

<style scoped>
.cust-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  font-size: .85rem;
}
.order-id {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: .78rem;
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--text-muted);
}
.status-select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: .78rem;
  font-weight: 600;
  cursor: pointer;
  text-transform: capitalize;
  background: var(--bg);
}
.status-new { color: #2563eb; border-color: #93c5fd; background: #eff6ff; }
.status-pending { color: #d97706; border-color: #fcd34d; background: #fffbeb; }
.status-confirmed { color: #7c3aed; border-color: #c4b5fd; background: #f5f3ff; }
.status-ready { color: #0891b2; border-color: #67e8f9; background: #ecfeff; }
.status-completed { color: #16a34a; border-color: #86efac; background: #f0fdf4; }
.status-cancelled { color: #dc2626; border-color: #fca5a5; background: #fef2f2; }
.text-muted { color: var(--text-muted); font-size: .82rem; }
.new-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ef4444;
  color: #fff;
  font-size: .65rem;
  font-weight: 700;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  margin-left: 8px;
  animation: pulse-badge 1.5s ease-in-out infinite;
}
@keyframes pulse-badge {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: .85; }
}
.row-new {
  background: rgba(37, 99, 235, 0.04);
  border-left: 3px solid #2563eb;
}
.btn-muted { opacity: .55; }
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-size: .82rem;
  color: var(--text-muted);
  border-top: 1px solid var(--border-light, #eee);
}
</style>
