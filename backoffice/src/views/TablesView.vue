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
          <span class="badge table-status-badge" :class="'badge-' + statusBadgeClass">
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
              <span class="badge" :class="'badge-' + order.status">{{ order.status }}</span>
            </div>
            <div class="order-items">{{ order.items }}</div>
            <div class="order-card-footer">
              <span>ETB {{ parseFloat(order.total||0).toFixed(0) }}</span>
              <span style="font-size:.72rem;color:var(--text-muted)">{{ order.created ? order.created.slice(11,19) : '' }}</span>
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

const statusBadgeClass = computed(() => {
  const s = selectedTable.value?.status
  if (s === 'available') return 'success'
  if (s === 'occupied') return 'cancelled'
  if (s === 'reserved') return 'pending'
  return 'new'
})

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
  sse.connect('http://localhost:3000/api/events/kitchen')
  sse.on('table_update', (data) => {
    const idx = tables.value.findIndex(t => t.id === data.id)
    if (idx !== -1) tables.value[idx] = { ...tables.value[idx], ...data }
    else loadAll()
  })
  sse.on('order_update', () => loadOrders())
  durationInterval = setInterval(() => {}, 30000)
})

onUnmounted(() => {
  sse.disconnect()
  if (durationInterval) clearInterval(durationInterval)
})

async function loadAll() {
  try { const [t, o, r] = await Promise.all([apiGet('tables'), apiGet('orders'), apiGet('reservations')]); tables.value = t; orders.value = o; reservations.value = r } catch {}
}

async function loadOrders() { try { orders.value = await apiGet('orders') } catch {} }

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