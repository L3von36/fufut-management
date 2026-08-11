<template>
  <div>
    <div class="table-toolbar">
      <h3>Table Heatmap</h3>
      <div style="display:flex;gap:10px;align-items:center">
        <span class="sse-badge" :class="{ online: sse.connected.value }">
          {{ sse.connected.value ? '● Live' : '○ Connecting' }}
        </span>
        <base-button text="Refresh" variant="btn-secondary" extra-class="btn-sm" :on-click="loadAll" />
      </div>
    </div>

    <!-- Summary -->
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-bar teal"></div><div class="kpi-label">Total Tables</div><div class="kpi-value">{{ tables.length }}</div></div>
      <div class="kpi-card"><div class="kpi-bar blue"></div><div class="kpi-label">Available</div><div class="kpi-value" style="color:var(--success)">{{ statusCounts.available || 0 }}</div></div>
      <div class="kpi-card"><div class="kpi-bar yellow"></div><div class="kpi-label">Occupied</div><div class="kpi-value" style="color:var(--danger)">{{ statusCounts.occupied || 0 }}</div></div>
      <div class="kpi-card"><div class="kpi-bar gold"></div><div class="kpi-label">Reserved</div><div class="kpi-value" style="color:var(--warning)">{{ statusCounts.reserved || 0 }}</div></div>
    </div>

    <!-- Heatmap grid -->
    <div class="heatmap-container">
      <div class="heatmap-legend">
        <span class="legend-item"><span class="dot" style="background:var(--success)"></span> Available</span>
        <span class="legend-item"><span class="dot" style="background:var(--danger)"></span> Occupied</span>
        <span class="legend-item"><span class="dot" style="background:var(--warning)"></span> Reserved</span>
        <span class="legend-item"><span class="dot" style="background:var(--info)"></span> Cleaning</span>
      </div>
      <div class="table-grid">
        <div v-for="table in tables" :key="table.id"
          class="table-cell"
          :class="'status-' + (table.status || 'available')"
          @click="selectTable(table)"
        >
          <div class="table-number">{{ table.number || table.id }}</div>
          <div class="table-status">{{ (table.status || 'available').toUpperCase() }}</div>
          <div v-if="table.seats" class="table-seats">{{ table.seats }} seats</div>
          <div v-if="table.status === 'occupied'" class="table-guest-count">
            {{ tableOrders(table.id)?.length ? (tableOrders(table.id)[0].guests || '—') + ' guests' : '— guests' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Table detail modal -->
    <div v-if="selectedTable" class="modal-overlay" @click.self="selectedTable=null">
      <div class="modal table-modal">
        <div class="table-modal-header">
          <div>
            <h3>Table {{ selectedTable.number || selectedTable.id }}</h3>
            <div class="modal-sub">{{ selectedTable.seats }} seats</div>
          </div>
          <span class="badge table-status-badge" :class="selectedBadgeClass">
            {{ (selectedTable.status || 'available').toUpperCase() }}
          </span>
        </div>

        <!-- Occupied info -->
        <div v-if="selectedTable.status === 'occupied'" class="table-occupied-info">
          <div class="occupied-stat">
            <span class="stat-icon">🕐</span>
            <div><div class="stat-label">Occupied for</div><div class="stat-value">{{ tableDuration }}</div></div>
          </div>
          <div class="occupied-stat">
            <span class="stat-icon">👥</span>
            <div><div class="stat-label">Guests</div><div class="stat-value">{{ currentOrder?.guests || '—' }}</div></div>
          </div>
          <div class="occupied-stat">
            <span class="stat-icon">💳</span>
            <div><div class="stat-label">Bill</div><div class="stat-value">ETB {{ parseFloat(currentOrder?.total || 0).toFixed(0) }}</div></div>
          </div>
          <div class="occupied-stat">
            <span class="stat-icon">👨‍🍳</span>
            <div><div class="stat-label">Server</div><div class="stat-value">{{ selectedTable.server || currentOrder?.server || '—' }}</div></div>
          </div>
        </div>

        <!-- Reserved info -->
        <div v-if="selectedTable.status === 'reserved'" class="table-reserved-info">
          <div v-if="tableReservation" class="reservation-detail">
            <div><strong>{{ tableReservation.name }}</strong> — {{ tableReservation.guests }} guests</div>
            <div>🕐 {{ tableReservation.time }}</div>
            <div v-if="tableReservation.notes">📝 {{ tableReservation.notes }}</div>
          </div>
          <div v-else style="color:var(--text-muted);font-size:.85rem">No reservation details</div>
        </div>

        <!-- Active Orders for this table -->
        <div v-if="tableOrders(selectedTable.id)?.length" class="table-orders-section">
          <h4>Active Orders</h4>
          <div v-for="order in tableOrders(selectedTable.id)" :key="order.id" class="table-order-card">
            <div class="order-card-top">
              <span class="order-id">#{{ order.id }}</span>
              <span class="badge" :class="statusBadgeClass(order.status)">{{ statusLabel(order.status) }}</span>
            </div>
            <div class="order-items">{{ order.items }}</div>
            <div class="order-card-footer">
              <span>ETB {{ parseFloat(order.total||0).toFixed(0) }}</span>
              <span style="font-size:.72rem;color:var(--text-muted)">{{ localTime(order.created, true) }}</span>
            </div>
          </div>
        </div>

        <!-- Status update -->
        <div class="form-group" style="margin-top:16px">
          <label>Change Status</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button v-for="s in ['available','occupied','reserved','cleaning']" :key="s"
              class="btn btn-sm"
              :class="statusForm.status === s ? 'btn-primary' : 'btn-secondary'"
              @click="statusForm.status = s"
            >{{ s }}</button>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="selectedTable=null">Close</button>
          <base-button text="Update Status" variant="btn-primary" :on-click="updateTableStatus" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { apiGet, apiPut } from '../api'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
import { localTime } from '../lib/datetime'
import { useSSE } from '../composables/useSSE'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const sse = useSSE()
const btnState = useButtonState({ successDuration: 1500 })
const tables = ref([])
const orders = ref([])
const reservations = ref([])
const selectedTable = ref(null)
const statusForm = ref({ status: 'available' })
let durationInterval = null

const statusCounts = computed(() => {
  const c = {}
  tables.value.forEach(t => {
    const s = t.status || 'available'
    c[s] = (c[s] || 0) + 1
  })
  return c
})

// The local mapping moved into composables/useStatusBadge.js, so the floor plan
// and every other status chip in the app now agree on what a colour means.
const selectedBadgeClass = computed(() => statusBadgeClass(selectedTable.value?.status))

function tableOrders(tableId) {
  const id = tableId?.toString()
  return orders.value.filter(o => {
    if (!id) return false
    const matchId = o.tableId?.toString() === id
    return matchId && o.status !== 'fulfilled' && o.status !== 'cancelled'
  })
}

const currentOrder = computed(() => {
  if (!selectedTable.value) return null
  const tOrders = tableOrders(selectedTable.value.id)
  return tOrders.length ? tOrders[0] : null
})

const tableReservation = computed(() => {
  if (!selectedTable.value) return null
  const id = selectedTable.value.id?.toString()
  return reservations.value.find(r => {
    const match = r.tableId?.toString() === id
    return match && r.status !== 'cancelled' && r.status !== 'completed'
  }) || null
})

const tableDuration = computed(() => {
  if (!currentOrder.value?.created) return '—'
  const created = new Date(currentOrder.value.created)
  const now = new Date()
  const diff = Math.floor((now - created) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
})

onMounted(() => {
  loadAll()
  sse.connect('tables')
  sse.on('table_update', (data) => {
    const idx = tables.value.findIndex(t => t.id === data.id)
    if (idx !== -1) tables.value[idx] = { ...tables.value[idx], ...data }
    else loadAll()
  })
  sse.on('order_update', () => loadOrders())
  // Timer for reactive duration updates
  durationInterval = setInterval(() => {
    // Force reactivity update for computed duration
    if (selectedTable.value) selectedTable.value = { ...selectedTable.value }
  }, 30000)
})

onUnmounted(() => {
  sse.disconnect()
  if (durationInterval) clearInterval(durationInterval)
})

async function loadAll() {
  try {
    const [t, o, r] = await Promise.all([apiGet('tables'), apiGet('orders'), apiGet('reservations')])
    tables.value = t; orders.value = o; reservations.value = r
  } catch (e) { toast('Failed to load data', 'error') }
}

async function loadOrders() { try { orders.value = await apiGet('orders') } catch (e) { toast('Failed to load orders', 'error') } }

function selectTable(table) {
  selectedTable.value = table
  statusForm.value = { status: table.status || 'available' }
}

async function updateTableStatus() {
  if (!selectedTable.value) return
  try {
    await apiPut('tables', { id: selectedTable.value.id, status: statusForm.value.status })
    toast('Table status updated')
    selectedTable.value.status = statusForm.value.status
    loadAll()
  } catch (e) { toast('Failed to update', 'error'); throw e }
}
</script>

<style scoped>
/* ─── Toolbar ─── */
.table-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px}
.table-toolbar h3{font-size:1.05rem;color:var(--text-heading);font-weight:600}

/* ─── SSE Badge ─── */
.sse-badge{font-size:.72rem;padding:4px 10px;border-radius:99px;background:var(--red-50);color:var(--danger);font-weight:600}
.sse-badge.online{background:var(--green-50);color:var(--success)}

/* ─── Heatmap ─── */
.heatmap-container{margin-bottom:24px}
.heatmap-legend{display:flex;gap:16px;margin-bottom:16px;font-size:.78rem;color:var(--text-muted)}
.legend-item{display:flex;align-items:center;gap:6px}
.legend-item .dot{width:10px;height:10px;border-radius:50%}
.table-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.table-cell{border:2px solid var(--border);border-radius:var(--radius-md);padding:14px 10px;text-align:center;cursor:pointer;transition:all var(--duration-fast) var(--ease)}
.table-cell:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}
.table-cell.status-available{border-color:var(--success);background:var(--green-50)}
.table-cell.status-occupied{border-color:var(--danger);background:var(--red-50)}
.table-cell.status-reserved{border-color:var(--warning);background:var(--gold-50)}
.table-cell.status-cleaning{border-color:var(--info);background:var(--blue-50)}
.table-number{font-size:1.2rem;font-weight:700;color:var(--text-heading)}
.table-status{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted)}
.table-seats{font-size:.72rem;color:var(--text-muted);margin-top:2px}
.table-guest-count{font-size:.68rem;color:var(--text-heading);font-weight:500;margin-top:4px}

/* ─── Table Modal ─── */
.table-modal{width:520px}
.table-modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.table-status-badge{font-size:.72rem;font-weight:600}

.table-occupied-info{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;padding:16px;background:var(--neutral-50);border-radius:var(--radius-md)}
.occupied-stat{display:flex;align-items:center;gap:8px}
.stat-icon{font-size:1.3rem}
.stat-label{font-size:.68rem;color:var(--text-muted);text-transform:uppercase}
.stat-value{font-size:.9rem;font-weight:700;color:var(--text-heading)}

.table-reserved-info{padding:16px;background:var(--gold-50);border-radius:var(--radius-md);border:1px solid #FDE68A;margin-bottom:20px}
.reservation-detail{font-size:.88rem;color:var(--text-body);line-height:1.6}

.table-orders-section{margin-bottom:20px}
.table-orders-section h4{font-size:.85rem;font-weight:600;color:var(--text-heading);margin-bottom:10px}
.table-order-card{border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px}
.table-order-card .order-card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.table-order-card .order-items{font-size:.82rem;color:var(--text-body);margin-bottom:8px}
.table-order-card .order-card-footer{display:flex;justify-content:space-between;font-size:.78rem}
</style>