<template>
  <div>
    <div class="table-toolbar">
      <h3>
        <template v-if="showQr">Table Cards</template>
        <template v-else>Table Heatmap</template>
      </h3>
      <div class="toolbar-actions">
        <span v-if="!showQr" class="sse-badge" :class="{ online: sse.connected.value }">
          {{ sse.connected.value ? '● Live' : '○ Connecting' }}
        </span>
        <template v-if="showQr">
          <base-button text="Print" variant="btn-primary" extra-class="btn-sm" :on-click="printSheet" />
          <base-button text="Back to Heatmap" variant="btn-ghost" extra-class="btn-sm" :on-click="() => { showQr = false }" />
        </template>
        <template v-else>
          <base-button text="QR cards" variant="btn-secondary" extra-class="btn-sm" :on-click="openQrSheet" />
          <base-button text="Refresh" variant="btn-secondary" extra-class="btn-sm" :on-click="loadAll" />
        </template>
      </div>
    </div>

    <!--
      The cards that go on the tables.

      One code per table and never more: a table carrying separate codes for the
      menu, for ordering and for paying is exactly where a counterfeit sticker
      hides, because among three a fourth looks like it belongs. The table name
      is printed large under the code so staff and guests can both tell at a
      glance which table a card belongs to — and so a card moved to the wrong
      table is obvious rather than silently wrong.

      Rendered locally. The URL carries the table's key, so it must never be
      sent to an image service to be turned into a QR code.

      Full-page view: this is a card sheet meant to be printed, not a modal.
      It takes the whole width so the grid can fit four cards across and the
      print layout is clean.
    -->
    <div v-if="showQr" class="qr-page">
      <div v-if="qrLoading" class="qr-page-msg no-print">Loading…</div>
      <p v-else-if="qrError" class="qr-error no-print">{{ qrError }}</p>
      <div v-else class="qr-grid">
        <div v-for="c in qrCards" :key="c.id" class="qr-card">
          <img v-if="c.image" :src="c.image" :alt="`QR code for ${c.name}`" class="qr-img" />
          <div v-else class="qr-missing">
            <span>No code yet</span>
            <button class="btn btn-sm btn-primary no-print" @click="mint(c)">Create</button>
          </div>
          <div class="qr-name">{{ c.name }}</div>
          <div class="qr-caption">Scan to see the menu and order</div>
          <button v-if="c.image" class="btn btn-sm btn-ghost no-print" @click="mint(c)">
            Replace code
          </button>
        </div>
      </div>
    </div>

    <!-- Heatmap: KPI + grid (hidden when QR sheet is active) -->
    <template v-else>
    <!-- Summary -->
    <div class="kpi-grid kpi-grid--tables" style="--kpi-count:5">
      <div class="kpi-card"><div class="kpi-bar teal"></div><div class="kpi-label">Total Tables</div><div class="kpi-value">{{ tables.length }}</div></div>
      <div class="kpi-card"><div class="kpi-bar blue"></div><div class="kpi-label">Available</div><div class="kpi-value kpi-value--success">{{ statusCounts.available || 0 }}</div></div>
      <div class="kpi-card"><div class="kpi-bar yellow"></div><div class="kpi-label">Occupied</div><div class="kpi-value kpi-value--danger">{{ statusCounts.occupied || 0 }}</div></div>
      <div class="kpi-card"><div class="kpi-bar gold"></div><div class="kpi-label">Reserved</div><div class="kpi-value kpi-value--warning">{{ statusCounts.reserved || 0 }}</div></div>
      <div class="kpi-card"><div class="kpi-bar info"></div><div class="kpi-label">Cleaning</div><div class="kpi-value kpi-value--info">{{ statusCounts.cleaning || 0 }}</div></div>
    </div>

    <!-- Heatmap grid -->
    <div class="heatmap-container">
      <div class="heatmap-legend">
        <span class="legend-item"><span class="legend-dot legend-dot--success"></span> Available</span>
        <span class="legend-item"><span class="legend-dot legend-dot--danger"></span> Occupied</span>
        <span class="legend-item"><span class="legend-dot legend-dot--warning"></span> Reserved</span>
        <span class="legend-item"><span class="legend-dot legend-dot--info"></span> Cleaning</span>
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
            {{ tableOrders(table)?.length ? (tableOrders(table)[0].guests || '—') + ' guests' : '— guests' }}
          </div>
        </div>
      </div>
    </div>
    </template>

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
          <div v-else class="reservation-empty">No reservation details</div>
        </div>

        <!-- Active Orders for this table -->
        <div v-if="tableOrders(selectedTable)?.length" class="table-orders-section">
          <h4>Active Orders</h4>
          <div v-for="order in tableOrders(selectedTable)" :key="order.id" class="table-order-card">
            <div class="order-card-top">
              <span class="order-id">#{{ order.id }}</span>
              <span class="badge" :class="statusBadgeClass(order.status)">{{ statusLabel(order.status) }}</span>
            </div>
            <div class="order-items">{{ formatOrderItems(order.items) }}</div>
            <div class="order-card-footer">
              <span>ETB {{ parseFloat(order.total||0).toFixed(0) }}</span>
              <span style="font-size:.72rem;color:var(--text-muted)">{{ localTime(order.created, true) }}</span>
            </div>
          </div>
        </div>

        <!-- Status update -->
        <div class="form-group status-update-form">
          <label>Change Status</label>
          <div class="status-buttons">
            <button v-for="s in ['available','occupied','reserved','cleaning']" :key="s"
              class="btn btn-sm"
              :class="statusForm.status === s ? 'btn-primary' : 'btn-secondary'"
              @click="statusForm.status = s"
            >{{ statusLabelMap[s] }}</button>
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
import { apiGet, apiPut, apiPost } from '../api'
import QRCode from 'qrcode'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
import { localTime } from '../lib/datetime'
import { formatOrderItems } from '../lib/formatters'
import { sameTable } from '../lib/tableRef'
import { useSSE } from '../composables/useSSE'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const confirmDelete = inject('confirm')
const sse = useSSE()
const btnState = useButtonState({ successDuration: 1500 })
const tables = ref([])
const orders = ref([])
const reservations = ref([])
const selectedTable = ref(null)
const statusForm = ref({ status: 'available' })
let durationInterval = null

/* Human-readable labels for table statuses, used in the status-change
   buttons inside the detail modal. Previously the buttons showed the raw
   slug — "available", "occupied" — which reads like a mistake in a UI. */
const statusLabelMap = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  cleaning: 'Cleaning'
}

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

/* Takes the table row, not just its id. An order filed under "6" and a table
 * whose id reads "Table 6" are the same table, and comparing the raw strings
 * meant a guest's QR order never appeared on the tile. See lib/tableRef.js. */
function tableOrders(table) {
  if (!table) return []
  return orders.value.filter(o => {
    const matchId = sameTable(o.tableId, table)
    return matchId && o.status !== 'fulfilled' && o.status !== 'cancelled'
  })
}

const currentOrder = computed(() => {
  if (!selectedTable.value) return null
  const tOrders = tableOrders(selectedTable.value)
  return tOrders.length ? tOrders[0] : null
})

const tableReservation = computed(() => {
  if (!selectedTable.value) return null
  return reservations.value.find(r => {
    const match = sameTable(r.tableId, selectedTable.value)
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

// ─── The cards that go on the tables ───

const showQr = ref(false)
const qrCards = ref([])
const qrLoading = ref(false)
const qrError = ref('')

/**
 * Where the printed code should point.
 *
 * Taken from the site the cafe actually publishes rather than from wherever the
 * backoffice happens to be open, because a card printed from a staging URL
 * would look identical and work for nobody.
 */
const PUBLIC_SITE = 'https://fufutcoffee.com'

async function openQrSheet() {
  showQr.value = true
  qrLoading.value = true
  qrError.value = ''
  try {
    const res = await apiGet(`tables/qr?origin=${encodeURIComponent(PUBLIC_SITE)}`)
    qrCards.value = await withImages(res.tables || [])
  } catch (e) {
    qrError.value = e.message || 'Could not load the table codes'
  } finally {
    qrLoading.value = false
  }
}

/**
 * Draw each code here in the browser.
 *
 * The URL carries the table's key, so handing it to an image service would be
 * publishing the secret the code exists to protect.
 */
async function withImages(rows) {
  return Promise.all(
    rows.map(async (t) => ({
      ...t,
      image: t.url
        ? await QRCode.toDataURL(t.url, { width: 420, margin: 1, errorCorrectionLevel: 'M' })
        : null,
    }))
  )
}

async function mint(card) {
  const replacing = Boolean(card.image)
  if (replacing && !(await confirmDelete(`Replace the code for ${card.name}? The printed card stops working immediately.`))) return
  try {
    const res = await apiPost(`tables/${card.id}/qr?origin=${encodeURIComponent(PUBLIC_SITE)}`, {})
    const image = await QRCode.toDataURL(res.url, { width: 420, margin: 1, errorCorrectionLevel: 'M' })
    qrCards.value = qrCards.value.map((c) => (c.id === card.id ? { ...c, url: res.url, hasKey: true, image } : c))
    toast(replacing ? `${card.name}: new code — reprint that card` : `${card.name}: code created`, 'success')
  } catch (e) {
    toast(e.message || 'Could not create the code', 'error')
  }
}

function printSheet() {
  window.print()
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
/* ─── SSE Badge ─── */
.sse-badge{font-size:.72rem;padding:4px 10px;border-radius:99px;background:var(--red-50);color:var(--danger);font-weight:600}
.sse-badge.online{background:var(--green-50);color:var(--success)}

/* ─── Toolbar ─── */
.toolbar-actions{display:flex;gap:10px;align-items:center}

/* ─── QR Sheet (full-page view) ─── */
.qr-error{color:var(--danger);font-weight:500}
.qr-page{padding:24px 0}
.qr-page-msg{font-size:var(--text-sm);color:var(--text-muted);margin:24px 0;text-align:center}
.qr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:20px}
.qr-card{border:1px solid var(--border,rgba(0,0,0,.15));border-radius:10px;padding:12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;break-inside:avoid;background:var(--surface);box-shadow:var(--shadow-card)}
.qr-img{width:100%;max-width:160px;height:auto;image-rendering:pixelated}
.qr-missing{width:100%;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1px dashed var(--border,rgba(0,0,0,.25));border-radius:8px;font-size:.85rem;opacity:.8}
/* Large, because it is the human check: a card on the wrong table should be
   obvious to anyone glancing at it, and so should a code that has been
   covered by somebody else's sticker. */
.qr-name{font-size:1.15rem;font-weight:700}
.qr-caption{font-size:.75rem;opacity:.7}

@media print{
  /* Only the card sheet prints — everything else on the page disappears. */
  .table-toolbar,.kpi-grid,.heatmap-container,.modal-overlay,.sidebar,.bottom-nav,.content-wrap > *:not(.qr-page){visibility:hidden}
  body{visibility:visible}
  .qr-page{visibility:visible;padding:0}
  .no-print{display:none !important}
  .qr-grid{grid-template-columns:repeat(3,1fr);gap:10mm}
  .qr-card{border:1px solid #999;box-shadow:none;background:none}
}

.table-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:16px}
.table-toolbar h3{font-size:1.05rem;color:var(--text-heading);font-weight:600}

/* ─── KPI Cards ─── */
.kpi-grid--tables{grid-template-columns:repeat(5,1fr)}
.kpi-value--success{color:var(--success)}
.kpi-value--danger{color:var(--danger)}
.kpi-value--warning{color:var(--warning)}
.kpi-value--info{color:var(--info)}

/* ─── Heatmap ─── */
.heatmap-container{margin-bottom:24px}
.heatmap-legend{display:flex;gap:16px;margin-bottom:16px;font-size:.78rem;color:var(--text-muted);flex-wrap:wrap}
.legend-item{display:flex;align-items:center;gap:6px}
.legend-dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.legend-dot--success{background:var(--success)}
.legend-dot--danger{background:var(--danger)}
.legend-dot--warning{background:var(--warning)}
.legend-dot--info{background:var(--info)}
.table-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px}
.table-cell{border:2px solid var(--border);border-radius:var(--radius-md);padding:16px 12px;text-align:center;cursor:pointer;transition:all var(--duration-fast) var(--ease-out);background:var(--neutral-0);box-shadow:var(--shadow-card)}
.table-cell:hover{transform:translateY(-3px);box-shadow:var(--shadow-md)}
.table-cell.status-available{border-color:var(--teal-300);background:var(--teal-50)}
.table-cell.status-occupied{border-color:var(--danger);background:var(--red-50)}
.table-cell.status-reserved{border-color:var(--warning);background:var(--gold-50)}
.table-cell.status-cleaning{border-color:var(--info);background:var(--blue-50)}
.table-number{font-size:1.2rem;font-weight:700;color:var(--text-heading)}
.table-status{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-top:4px}
.table-seats{font-size:.72rem;color:var(--text-muted);margin-top:2px}
.table-guest-count{font-size:.68rem;color:var(--text-heading);font-weight:500;margin-top:4px}

/* ─── Table Modal ─── */
.table-modal{width:640px}
.table-modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px}
.table-status-badge{font-size:.72rem;font-weight:600}

.table-occupied-info{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;padding:18px;background:var(--neutral-50);border-radius:var(--radius-md);border:1px solid var(--border)}
.occupied-stat{display:flex;align-items:center;gap:10px}
.stat-icon{font-size:1.3rem}
.stat-label{font-size:.68rem;color:var(--text-muted);text-transform:uppercase}
.stat-value{font-size:.9rem;font-weight:700;color:var(--text-heading)}

.table-reserved-info{padding:16px;background:var(--gold-50);border-radius:var(--radius-md);border:1px solid #FDE68A;margin-bottom:24px}
.reservation-detail{font-size:.88rem;color:var(--text-body);line-height:1.6}
.reservation-empty{color:var(--text-muted);font-size:.82rem}

.table-orders-section{margin-bottom:24px}
.table-orders-section h4{font-size:.85rem;font-weight:600;color:var(--text-heading);margin-bottom:10px}
.table-order-card{border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px}
.table-order-card .order-card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.table-order-card .order-items{font-size:.82rem;color:var(--text-body);margin-bottom:8px}
.table-order-card .order-card-footer{display:flex;justify-content:space-between;font-size:.78rem}

.status-update-form .form-group{margin-top:0}
.status-buttons{display:flex;gap:8px;flex-wrap:wrap}
.status-buttons .btn{font-size:.82rem;padding:7px 14px}

/* ─── Responsive ─── */
@media(max-width: 768px) {
  .kpi-grid--tables{grid-template-columns:repeat(2,1fr)}
  .table-grid{grid-template-columns:repeat(2,1fr);gap:12px}
  .table-grid .table-cell{padding:14px 10px}
  .table-modal{width:90vw;max-width:520px}
  .table-occupied-info{grid-template-columns:repeat(2,1fr)}
  .table-modal-header{flex-direction:column;align-items:flex-start;gap:8px}
  .status-buttons{flex-direction:column}
  .status-buttons .btn{width:100%}
  .heatmap-legend{justify-content:center}
}

@media(max-width: 420px) {
  .table-grid{grid-template-columns:repeat(2,1fr);gap:10px}
  .table-cell{padding:12px 8px}
  .table-number{font-size:1rem}
  .kpi-value{font-size:1.4rem}
}
</style>