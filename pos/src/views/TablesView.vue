<template>
  <div class="tm-page" style="position:relative">
    <!-- Loading -->
    <div v-if="loading" class="loading-overlay"><div class="spinner"></div></div>

    <!-- ═══ TOOLBAR ═══ -->
    <div class="tm-toolbar">
      <div class="tm-toolbar-left">
        <span class="tm-toolbar-title">Floor Plan</span>
        <span class="tm-toolbar-sub">{{ tables.length }} tables &middot; {{ occupancyPercent }}% occupied</span>
      </div>
      <div class="tm-toolbar-actions">
        <button class="btn btn-sm" :class="sseConnected ? 'btn-success' : 'btn-outline'" @click="toggleSSE" :title="sseConnected ? 'Live updates active' : 'Connect live updates'">
          <span class="tm-sse-dot" :class="{ active: sseConnected }"></span>
          <span>{{ sseConnected ? 'Live' : 'Go Live' }}</span>
        </button>
        <button v-if="authStore?.role === 'manager'" class="btn btn-primary btn-sm" @click="openAddTable">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Table
        </button>
        <button class="btn btn-ghost btn-sm tm-refresh-btn" @click="refreshAll" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
    </div>

    <!-- ═══ SECTION TABS ═══ -->
    <div class="tm-section-tabs">
      <button v-for="s in allSections" :key="s" class="tm-tab" :class="{ active: activeSection === s }" @click="activeSection = s">{{ s }}</button>
    </div>

    <!-- ═══ KPI ROW ═══ -->
    <div class="kpi-grid tm-kpi">
      <div class="kpi-card">
        <div class="kpi-bar teal"></div>
        <div class="kpi-icon-wrap teal-bg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>
        <div class="kpi-label">Available</div>
        <div class="kpi-value" style="color:var(--success)">{{ availableCount }}</div>
        <div class="kpi-sub">{{ availableSeats }} seats free</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar blue"></div>
        <div class="kpi-icon-wrap blue-bg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="kpi-label">Occupied</div>
        <div class="kpi-value" style="color:var(--info)">{{ occupiedCount }}</div>
        <div class="kpi-sub">{{ occupiedGuests }} guests seated</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar gold"></div>
        <div class="kpi-icon-wrap gold-bg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="kpi-label">Reserved</div>
        <div class="kpi-value" style="color:var(--warning)">{{ reservedCount }}</div>
        <div class="kpi-sub">Today's bookings</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-bar neutral"></div>
        <div class="kpi-icon-wrap neutral-bg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>
        <div class="kpi-label">Cleaning</div>
        <div class="kpi-value" style="color:var(--neutral-500)">{{ cleaningCount }}</div>
        <div class="kpi-sub">Needs attention</div>
      </div>
    </div>

    <!-- ═══ FLOOR PLAN ═══ -->
    <div v-for="section in visibleSections" :key="section" class="tm-section">
      <div class="tm-section-header">
        <h4>{{ section }}</h4>
        <span class="tm-section-count">{{ sectionTables(section).length }} tables</span>
      </div>
      <div class="tm-floor-grid">
        <div
          v-for="t in sectionTables(section)"
          :key="t.id"
          class="tm-card"
          :class="[t.status, 'shape-' + (t.shape || 'square')]"
          @click="openDetail(t)"
          tabindex="0"
          role="button"
          @keydown.enter="openDetail(t)"
        >
          <!-- Status ring -->
          <div class="tm-card-ring"></div>
          <div class="tm-card-body">
            <!-- Header -->
            <div class="tm-card-top">
              <span class="tm-table-num">{{ t.number }}</span>
              <span class="tm-table-name">{{ t.name || ('Table ' + t.number) }}</span>
            </div>

            <!-- Shape + capacity -->
            <div class="tm-card-meta">
              <span class="tm-shape-icon" :title="(t.shape || 'square') + ' table'">
                <svg v-if="(t.shape || 'square') === 'round'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>
                <svg v-else-if="t.shape === 'long'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="10" rx="3"/></svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
              </span>
              <span class="tm-capacity">{{ t.capacity }} seats</span>
            </div>

            <!-- Status badge -->
            <div class="tm-status-badge" :class="'tsb-' + t.status">{{ t.status }}</div>

            <!-- Occupied info -->
            <template v-if="t.status === 'occupied'">
              <div class="tm-timer">{{ occupancyTimer(t) }}</div>
              <div v-if="tableOrderCounts[t.id]" class="tm-order-hint">
                {{ tableOrderCounts[t.id] }} order{{ tableOrderCounts[t.id] > 1 ? 's' : '' }}
                <span v-if="tableOrderTotals[t.id]"> &middot; {{ formatETB(tableOrderTotals[t.id]) }}</span>
              </div>
              <div v-if="t.guests" class="tm-guests">{{ t.guests }} guest{{ t.guests > 1 ? 's' : '' }}</div>
              <div v-if="t.server" class="tm-server">{{ t.server }}</div>
            </template>

            <!-- Reserved info -->
            <template v-if="t.status === 'reserved'">
              <div v-if="t.guests" class="tm-guests">{{ t.guests }} guest{{ t.guests > 1 ? 's' : '' }} reserved</div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!filteredTables.length && !loading" class="tm-empty-section">
      <div class="empty-state-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
      </div>
      <div class="empty-state-text">No tables in {{ activeSection === 'All' ? 'any section' : activeSection }}</div>
      <div class="empty-state-hint">{{ activeSection === 'All' ? 'Tables will appear here once they are added.' : 'Try selecting a different section.' }}</div>
    </div>

    <!-- ═══ TABLE DETAIL PANEL ═══ -->
    <div class="modal-overlay" v-if="detailTable" @click.self="closeDetail">
      <div class="tm-detail-modal" role="dialog" aria-modal="true" :aria-label="`Table ${detailTable.number} details`">
        <!-- Header -->
        <div class="tm-detail-header">
          <div>
            <h3>Table {{ detailTable.number }} &mdash; {{ detailTable.name || ('Table ' + detailTable.number) }}</h3>
            <p class="modal-sub">{{ detailTable.section }} &middot; {{ detailTable.capacity }} seats &middot; {{ detailTable.shape || 'square' }}</p>
          </div>
          <button class="btn-icon tm-detail-close" @click="closeDetail" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Quick status buttons -->
        <div class="tm-quick-status">
          <button v-for="s in statuses" :key="s" class="tm-qs-btn" :class="[detailTable.status === s ? 'active' : '', 'qs-' + s]" @click="quickStatus(s)">{{ s }}</button>
        </div>

        <!-- Detail form -->
        <div class="tm-detail-grid">
          <div class="form-group">
            <label>Assigned Server</label>
            <input v-model="detailTable.server" placeholder="Server name" />
          </div>
          <div class="form-group">
            <label>Guest Count</label>
            <input v-model.number="detailTable.guests" type="number" min="0" placeholder="0" />
          </div>
          <div class="form-group">
            <label>Table Notes</label>
            <input v-model="detailTable.notes" placeholder="Special requests, preferences..." />
          </div>
        </div>

        <!-- Active orders for this table -->
        <div class="tm-orders-section" v-if="detailTable.status === 'occupied'">
          <h4>Active Orders</h4>
          <div v-if="detailOrders.length" class="tm-orders-list">
            <div v-for="o in detailOrders" :key="o.id" class="tm-order-card">
              <div class="tm-order-header">
                <span class="tm-order-id">#{{ shortId(o.id) }}</span>
                <span class="badge" :class="'badge-' + o.status.replace(' ', '-')">{{ o.status }}</span>
                <span class="tm-order-total">{{ formatETB(o.total) }}</span>
              </div>
              <div class="tm-order-items">
                <span v-for="(line, li) in getOrderLines(o)" :key="li" class="tm-order-line">
                  {{ line.qty }}x {{ line.name }}<span v-if="line.modifiers && line.modifiers.length"> ({{ line.modifiers.map(m => m.name).join(', ') }})</span>
                </span>
                <span v-if="!getOrderLines(o).length" class="tm-order-line">{{ o.items }}</span>
              </div>
              <div class="tm-order-footer">
                <span class="tm-order-time">{{ formatTime(o.created) }}</span>
                <span v-if="o.customer && o.customer !== 'Walk-in'" class="tm-order-customer">{{ o.customer }}</span>
              </div>
            </div>
          </div>
          <div v-else class="tm-no-orders">No active orders for this table</div>
        </div>

        <!-- Occupancy info -->
        <div v-if="detailTable.status === 'occupied' && detailTable.seated_at" class="tm-occupancy-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Seated {{ occupancyTimer(detailTable) }} ago</span>
        </div>

        <!-- Actions -->
        <div class="modal-actions tm-detail-actions">
          <button v-if="detailTable.status !== 'occupied'" class="btn btn-primary btn-sm" @click="newOrderForTable">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Order
          </button>
          <button v-else class="btn btn-outline btn-sm" @click="goToCheckout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Go to Checkout
          </button>
          <div class="tm-actions-spacer"></div>
          <button v-if="authStore?.role === 'manager'" class="btn btn-danger btn-sm" @click="deleteTable">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>
          <button class="btn btn-secondary" @click="closeDetail">Close</button>
          <button class="btn btn-primary" @click="saveDetail">Save Changes</button>
        </div>
      </div>
    </div>

    <!-- ═══ ADD TABLE MODAL ═══ -->
    <div class="modal-overlay" v-if="showAddModal" @click.self="showAddModal = false">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Add new table">
        <h3>Add New Table</h3>
        <p class="modal-sub">Configure a new table for the floor plan</p>
        <div class="form-row">
          <div class="form-group">
            <label>Table Number</label>
            <input v-model.number="newTable.number" type="number" min="1" placeholder="e.g. 16" />
          </div>
          <div class="form-group">
            <label>Table Name</label>
            <input v-model="newTable.name" placeholder="e.g. Patio 4" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Capacity (seats)</label>
            <input v-model.number="newTable.capacity" type="number" min="1" placeholder="4" />
          </div>
          <div class="form-group">
            <label>Section</label>
            <select v-model="newTable.section" class="select">
              <option v-for="s in sections" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Shape</label>
          <div class="tm-shape-picker">
            <button v-for="sh in ['round', 'square', 'long']" :key="sh" class="tm-shape-opt" :class="{ active: newTable.shape === sh }" @click="newTable.shape = sh" type="button">
              <svg v-if="sh === 'round'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>
              <svg v-else-if="sh === 'long'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="10" rx="3"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
              <span>{{ sh }}</span>
            </button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showAddModal = false">Cancel</button>
          <button class="btn btn-primary" @click="addTable">Add Table</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { apiGet, apiPut, apiPost, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
import { useSSE } from '../composables/useSSE'
import { useAuthStore } from '../stores/auth'

const router = useRouter()

const { toast } = useToast()
const authStore = useAuthStore()
const { connected: sseConnected, connect: sseConnect, disconnect: sseDisconnect, on: sseOn } = useSSE()

const tables = ref([])
const orders = ref([])
const loading = ref(true)
const sections = ref(['Patio', 'Main Hall', 'Window', 'VIP Room', 'Bar'])
const allSections = computed(() => ['All', ...sections.value])
const activeSection = ref('All')
const detailTable = ref(null)
const detailOrders = ref([])
const showAddModal = ref(false)
const statuses = ['available', 'occupied', 'reserved', 'cleaning']
let timerInterval = null

const newTable = ref({ number: '', name: '', capacity: 4, section: 'Main Hall', shape: 'square' })

// ─── Computed ───

const filteredTables = computed(() => {
  let t = tables.value
  if (activeSection.value !== 'All') t = t.filter(x => x.section === activeSection.value)
  return t
})

const visibleSections = computed(() => {
  if (activeSection.value !== 'All') return [activeSection.value]
  return sections.value
})

function sectionTables(section) {
  return filteredTables.value.filter(t => t.section === section)
}

const availableCount = computed(() => tables.value.filter(t => t.status === 'available').length)
const occupiedCount = computed(() => tables.value.filter(t => t.status === 'occupied').length)
const reservedCount = computed(() => tables.value.filter(t => t.status === 'reserved').length)
const cleaningCount = computed(() => tables.value.filter(t => t.status === 'cleaning').length)
const occupancyPercent = computed(() => {
  if (!tables.value.length) return 0
  return Math.round((occupiedCount.value / tables.value.length) * 100)
})
const availableSeats = computed(() => tables.value.filter(t => t.status === 'available').reduce((s, t) => s + (t.capacity || 0), 0))
const occupiedGuests = computed(() => tables.value.filter(t => t.status === 'occupied').reduce((s, t) => s + (t.guests || 0), 0))

// ─── Table order data (computed from all orders) ───

const tableOrderCounts = computed(() => {
  const map = {}
  const active = orders.value.filter(o => !['completed', 'cancelled'].includes(o.status))
  for (const o of active) {
    const tn = o.table_number || o.tableNum || ''
    if (!tn) continue
    const tbl = tables.value.find(t => String(t.number) === String(tn))
    if (!tbl) continue
    map[tbl.id] = (map[tbl.id] || 0) + 1
  }
  return map
})

const tableOrderTotals = computed(() => {
  const map = {}
  const active = orders.value.filter(o => !['completed', 'cancelled'].includes(o.status))
  for (const o of active) {
    const tn = o.table_number || o.tableNum || ''
    if (!tn) continue
    const tbl = tables.value.find(t => String(t.number) === String(tn))
    if (!tbl) continue
    map[tbl.id] = (map[tbl.id] || 0) + (o.total || 0)
  }
  return map
})

// ─── Timer ───

function occupancyTimer(t) {
  if (!t.seated_at) return ''
  const seated = new Date(t.seated_at).getTime()
  const now = Date.now()
  const diff = Math.max(0, Math.floor((now - seated) / 1000))
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return 'just now'
}

// ─── Helpers ───

function formatETB(n) {
  return (n || 0).toLocaleString() + ' ETB'
}

function shortId(id) {
  return id ? id.slice(-5).toUpperCase() : '?'
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getOrderLines(o) {
  if (o.order_items && Array.isArray(o.order_items) && o.order_items.length) return o.order_items
  if (o.orderItems && Array.isArray(o.orderItems) && o.orderItems.length) return o.orderItems
  return []
}

// ─── Data loading ───

async function loadTables() {
  try { tables.value = await apiGet('tables') } catch (e) { console.error('Failed to load tables', e) }
}

async function loadOrders() {
  try {
    const all = await apiGet('orders') || []
    orders.value = all.filter(o => !['completed', 'cancelled', 'fulfilled'].includes(o.status))
  } catch (e) { console.error('Failed to load orders', e) }
}

async function refreshAll() {
  await Promise.all([loadTables(), loadOrders()])
  toast('Refreshed', 'info')
}

// ─── SSE ───

function toggleSSE() {
  if (sseConnected.value) {
    sseDisconnect()
  } else {
    sseConnect('tables')
  }
}

function setupSSE() {
  sseConnect('tables')
  sseOn('table_update', () => loadTables())
  sseOn('new_order', () => loadOrders())
  sseOn('order_update', () => loadOrders())
}

// ─── Detail panel ───

async function openDetail(t) {
  detailTable.value = { ...t }
  // Load orders for this specific table
  const tn = String(t.number)
  try {
    detailOrders.value = await apiGet(`orders?table_number=${tn}`) || []
    detailOrders.value = detailOrders.value.filter(o => !['completed', 'cancelled'].includes(o.status))
  } catch {
    detailOrders.value = []
  }
}

function closeDetail() {
  detailTable.value = null
  detailOrders.value = []
}

function quickStatus(status) {
  if (!detailTable.value) return
  const prev = detailTable.value.status
  detailTable.value.status = status
  // Auto-set/clear seated_at
  if (status === 'occupied' && prev !== 'occupied') {
    detailTable.value.seated_at = new Date().toISOString()
  } else if (status !== 'occupied') {
    detailTable.value.seated_at = ''
    if (status === 'available') {
      detailTable.value.guests = 0
      detailTable.value.server = ''
    }
  }
}

async function saveDetail() {
  if (!detailTable.value) return
  try {
    await apiPut('tables/' + detailTable.value.id, detailTable.value)
    toast('Table updated')
    closeDetail()
    await loadTables()
  } catch { toast('Failed to update', 'error') }
}

async function deleteTable() {
  if (!detailTable.value) return
  if (!confirm(`Delete Table ${detailTable.value.number}? This cannot be undone.`)) return
  try {
    await apiDelete('tables', detailTable.value.id)
    toast('Table deleted')
    closeDetail()
    await loadTables()
  } catch { toast('Failed to delete', 'error') }
}

// ─── New Order / Checkout for table ───

function newOrderForTable() {
  if (!detailTable.value) return
  closeDetail()
 router.push('/app/menu-view?table=' + detailTable.value.number)
}

function goToCheckout() {
  closeDetail()
  router.push('/app/checkout')
}

// ─── Add table ───

function openAddTable() {
  const maxNum = tables.value.reduce((m, t) => Math.max(m, t.number || 0), 0)
  newTable.value = { number: maxNum + 1, name: '', capacity: 4, section: 'Main Hall', shape: 'square' }
  showAddModal.value = true
}

async function addTable() {
  if (!newTable.value.number) { toast('Table number is required', 'error'); return }
  try {
    await apiPost('tables', {
      ...newTable.value,
      status: 'available',
      server: '', guests: 0, seated_at: '', notes: ''
    })
    toast('Table added')
    showAddModal.value = false
    await loadTables()
  } catch { toast('Failed to add table', 'error') }
}

// ─── Lifecycle ───

onMounted(async () => {
  await Promise.all([loadTables(), loadOrders()])
  loading.value = false
  setupSSE()
  timerInterval = setInterval(() => {
    // Force reactivity update for timers
    tables.value = [...tables.value]
  }, 10000)
})

onUnmounted(() => {
  sseDisconnect()
  if (timerInterval) clearInterval(timerInterval)
})
</script>

<style scoped>
/* Toolbar — removes duplicate title from topbar */
.tm-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}
.tm-toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.tm-toolbar-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-heading);
}
.tm-toolbar-sub {
  font-size: .78rem;
  color: var(--text-muted);
  font-weight: 400;
}

/* KPI icon wraps */
.kpi-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.kpi-icon-wrap.teal-bg { background: var(--teal-50); color: var(--primary); }
.kpi-icon-wrap.blue-bg { background: var(--blue-50); color: var(--info); }
.kpi-icon-wrap.gold-bg { background: var(--gold-50); color: var(--warning); }
.kpi-icon-wrap.neutral-bg { background: var(--neutral-50); color: var(--neutral-500); }

/* Empty section state */
.tm-empty-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 20px;
  text-align: center;
}
.tm-empty-section .empty-state-icon {
  background: var(--neutral-50);
}
.empty-state-text {
  font-size: .9rem;
  font-weight: 600;
  color: var(--text-heading);
  margin-top: 12px;
}
.empty-state-hint {
  font-size: .8rem;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Detail modal close button */
.tm-detail-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--neutral-50);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease);
  flex-shrink: 0;
}
.tm-detail-close:hover {
  background: var(--neutral-100);
  border-color: var(--border-strong);
}

/* Detail modal actions */
.tm-detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tm-actions-spacer {
  flex: 1;
}

/* Refresh icon button */
.tm-refresh-btn {
  padding: 6px 8px;
}

/* Neutral KPI bar */
.kpi-bar.neutral {
  background: linear-gradient(90deg, var(--neutral-400), var(--neutral-300));
}

/* Dark mode KPI icon wraps */
:global([data-theme="dark"]) .kpi-icon-wrap.teal-bg { background: rgba(15,123,120,.15); }
:global([data-theme="dark"]) .kpi-icon-wrap.blue-bg { background: rgba(37,99,235,.15); }
:global([data-theme="dark"]) .kpi-icon-wrap.gold-bg { background: rgba(181,101,29,.15); }
:global([data-theme="dark"]) .kpi-icon-wrap.neutral-bg { background: rgba(154,149,137,.15); }
:global([data-theme="dark"]) .tm-detail-close { background: var(--neutral-50); border-color: var(--border); }
</style>
