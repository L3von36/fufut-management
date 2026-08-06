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

            <!-- Structured items -->
            <div class="ko-items">
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
              <!-- Fallback: flat string if no structured data -->
              <div v-if="!getOrderLines(o).length" class="ko-fallback">{{ o.items }}</div>
            </div>

            <!-- Order-level notes -->
            <div v-if="o.notes" class="ko-order-notes">
              <span class="ko-notes-icon">📝</span> {{ o.notes }}
            </div>

            <div class="ko-footer">
              <span class="kitchen-timer" :class="timerClass(o)">{{ timerLabel(o) }}</span>
              <base-button text="Start Preparing" variant="btn-primary" extra-class="btn-sm" :on-click="() => updateStatus(o.id, 'preparing')" />
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
              <div v-if="!getOrderLines(o).length" class="ko-fallback">{{ o.items }}</div>
            </div>

            <div v-if="o.notes" class="ko-order-notes">
              <span class="ko-notes-icon">📝</span> {{ o.notes }}
            </div>

            <div class="ko-footer">
              <span class="kitchen-timer" :class="timerClass(o)">{{ timerLabel(o) }}</span>
              <base-button text="Mark Ready" variant="btn-success" extra-class="btn-sm" :on-click="() => updateStatus(o.id, 'ready')" />
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
              <div v-if="!getOrderLines(o).length" class="ko-fallback">{{ o.items }}</div>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiGet, apiPut, getSSEUrl } from '../api'
import { useToast } from '../composables/useToast'
import { useAudioAlerts } from '../composables/useAudioAlerts'
import { useButtonState } from '../composables/useButtonState'
import { useAuthStore } from '../stores/auth'

const { toast } = useToast()
const auth = useAuthStore()
const { muted, enabled, playNewOrder, playOrderReady, playOrderUpdate, toggleMute } = useAudioAlerts()
const orders = ref([])
let sse = null
let timer = null
let clockTimer = null
const now = ref(Date.now())

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
  if (sse) sse.close()
  if (timer) clearInterval(timer)
  if (clockTimer) clearInterval(clockTimer)
})

async function loadOrders() {
  try {
    orders.value = await apiGet('orders')
  } catch (e) { console.error(e) }
}

function connectSSE() {
  sse = new EventSource(getSSEUrl('kitchen'))
  sse.addEventListener('new_order', (e) => {
    try {
      const data = JSON.parse(e.data)
      loadOrders()
      playNewOrder()
      toast(`New order #${data.id?.slice(-4) || 'received'}`, 'info')
    } catch (e) { console.error(e) }
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
    } catch (e) { console.error(e) }
  })
  sse.onerror = () => {}
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
  font-size: .62rem;
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
  font-size: .68rem;
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
  font-size: .68rem;
  font-weight: 500;
  border: 1px solid var(--teal-200, #99F6E4);
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
