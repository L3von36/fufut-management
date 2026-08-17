<template>
  <div>
    <div class="dv-toolbar">
      <div class="dv-toolbar-left">
        <span class="dv-toolbar-title">Delivery</span>
        <span class="dv-toolbar-count">{{ filteredDeliveries.length }} result{{ filteredDeliveries.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="dv-toolbar-actions">
        <div class="dv-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="search" type="text" placeholder="Search customer or address..." class="dv-search-input" />
          <button v-if="search" class="dv-search-clear" @click="search=''" aria-label="Clear search">&times;</button>
        </div>
        <select v-model="statusFilter" class="select">
          <option value="">All</option>
          <option v-for="(label, key) in STATUS_LABEL" :key="key" :value="key">{{ label }}</option>
        </select>
        <button class="btn btn-ghost btn-sm" @click="loadData" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
    </div>
    <div class="summary-grid">
      <div class="summary-card"><div class="num" style="color:var(--warning)">{{ toCollect.length }}</div><div class="lbl">To Collect</div></div>
      <div class="summary-card"><div class="num" style="color:var(--info)">{{ onTheWay.length }}</div><div class="lbl">On The Way</div></div>
      <div class="summary-card"><div class="num" style="color:var(--success)">{{ delivered.length }}</div><div class="lbl">Delivered</div></div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Address</th><th>Driver</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="d in filteredDeliveries" :key="d.id">
              <td data-label="Order">#{{ d.orderId||d.order_id||d.id }}</td>
              <td data-label="Customer">{{ d.customer||d.name||'—' }}</td>
              <td data-label="Address">{{ d.address||'—' }}</td>
              <td data-label="Driver">{{ d.driver||'—' }}</td>
              <td data-label="Status"><span class="badge" :class="statusClass(d.status)">{{ statusLabel(d.status) }}</span></td>
              <td data-label="Actions">
                <button
                  v-for="to in nextStates(d)"
                  :key="to"
                  class="btn btn-sm"
                  :class="to === 'delivered' ? 'btn-success' : 'btn-primary'"
                  @click="updateStatus(d, to)"
                >{{ ACTION_LABEL[to] || statusLabel(to) }}</button>
                <span v-if="!nextStates(d).length" class="dv-no-action">{{ statusLabel(d.status) }}</span>
              </td>
            </tr>
            <tr v-if="!filteredDeliveries.length"><td colspan="6">
              <div class="dv-empty">
                <div class="dv-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                </div>
                <div class="dv-empty-text">{{ search ? 'No deliveries match your search' : 'No deliveries' }}</div>
                <div class="dv-empty-hint">{{ search ? 'Try a different keyword.' : 'Delivery orders will appear here.' }}</div>
              </div>
            </td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredDeliveries.length }} delivery(ies)</span></div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted , inject} from 'vue'
import { apiGet, apiPost } from '../api'
import { useAuthStore } from '../stores/auth'

const toast = inject('toast')
const auth = useAuthStore()
const deliveries = ref([])
const statusFilter = ref('')
const search = ref('')

/**
 * Mirrors TRANSITIONS in fufut-api/src/handlers/delivery.js.
 *
 * This screen used to work in 'pending' and 'in-transit', which are not states
 * the server has: it was written against the free-text column that the state
 * machine replaced. The result was a driver who could see a job and do nothing
 * with it — no button matched any real status — and a status filter that could
 * only ever match "delivered".
 *
 * Held as data so the buttons offered are exactly the moves the server will
 * accept, rather than a second opinion about the workflow that can drift again.
 */
const TRANSITIONS = {
  new: ['confirmed', 'preparing'],
  confirmed: ['preparing'],
  preparing: ['ready'],
  ready: ['assigned'],
  assigned: ['picked_up'],
  picked_up: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
}

const STATUS_LABEL = {
  new: 'New', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready',
  assigned: 'Assigned', picked_up: 'Picked up', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', cancelled: 'Cancelled',
}

/** What the button says, which is the action rather than the resulting state. */
const ACTION_LABEL = {
  confirmed: 'Confirm', preparing: 'Start preparing', ready: 'Mark ready',
  assigned: 'Take job', picked_up: 'Picked up',
  out_for_delivery: 'On the way', delivered: 'Delivered',
}

/** The server normalises the same way, so 'in-transit' and 'in transit' agree. */
function normalise(status) {
  return String(status || 'new').toLowerCase().replace(/[\s-]+/g, '_')
}

function statusLabel(status) {
  const key = normalise(status)
  return STATUS_LABEL[key] || key.replace(/_/g, ' ')
}

function statusClass(status) {
  return 'badge-' + normalise(status).replace(/_/g, '-')
}

/**
 * Only the moves this person can actually make. Assigning names a driver, and
 * the server requires one, so it is offered to a driver taking their own job —
 * choosing somebody else's driver belongs on the backoffice screen.
 */
function nextStates(d) {
  const moves = TRANSITIONS[normalise(d.status)] || []
  return moves.filter(to => to !== 'assigned' || auth.roleKey === 'delivery-staff')
}

// Grouped the way a driver's day runs, not the way the table is stored.
const toCollect = computed(() => deliveries.value.filter(d => ['ready', 'assigned'].includes(normalise(d.status))))
const onTheWay = computed(() => deliveries.value.filter(d => ['picked_up', 'out_for_delivery'].includes(normalise(d.status))))
const delivered = computed(() => deliveries.value.filter(d => normalise(d.status) === 'delivered'))

const filteredDeliveries = computed(() => {
  // Compared normalised, so a legacy row holding "in-transit" is still matched
  // by the same option as "in_transit".
  let result = !statusFilter.value
    ? deliveries.value
    : deliveries.value.filter(d => normalise(d.status) === statusFilter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(d =>
      (d.customer && d.customer.toLowerCase().includes(q)) ||
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.address && d.address.toLowerCase().includes(q))
    )
  }
  return result
})

onMounted(loadData)

async function loadData() {
  try { deliveries.value = await apiGet('delivery') } catch (e) { console.error(e) }
}

/**
 * Move a job to its next state.
 *
 * Goes through POST /delivery/:id/status, which is the route that validates the
 * transition, stamps assigned_at/picked_up_at, names the driver and closes the
 * order once a delivered job is paid. The previous plain PUT fell through to
 * the generic resource handler instead, writing whatever string it was handed
 * straight into the column — the free-text behaviour the state machine exists
 * to replace, with none of the timestamps or the audit entry.
 */
async function updateStatus(d, to) {
  const body = { status: to }
  // The server refuses to assign without naming somebody, and rightly: an
  // assigned job with no driver tells nobody anything.
  if (to === 'assigned') body.driverId = auth.user?.id
  try {
    await apiPost(`delivery/${d.id}/status`, body)
    toast(ACTION_LABEL[to] || statusLabel(to))
    await loadData()
  } catch (e) {
    // The refusal says which moves are legal from here, which is worth reading
    // out rather than replacing with "Failed".
    toast(e.message || 'Could not update that delivery', 'error')
    await loadData()
  }
}
</script>
<style scoped>
.dv-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}
.dv-toolbar-left { display: flex; align-items: baseline; gap: 10px; }
.dv-toolbar-title { font-size: 1.15rem; font-weight: 700; color: var(--text-heading); }
.dv-toolbar-count { font-size: .78rem; color: var(--text-muted); }
.dv-toolbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.dv-search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  transition: border-color var(--duration-fast) var(--ease);
  min-width: 220px;
}
.dv-search:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(15,123,120,.1); }
.dv-search-input { border: none; background: transparent; padding: 7px 0; font-size: .82rem; color: var(--text-heading); width: 100%; outline: none; font-family: inherit; }
.dv-search-input::placeholder { color: var(--neutral-400); }
.dv-search-clear { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; padding: 0 2px; line-height: 1; }
.dv-search-clear:hover { color: var(--text-heading); }

/* A finished or cancelled job has no move left; saying so beats an empty cell
   that reads as a missing button. */
.dv-no-action { font-size: .76rem; color: var(--text-muted); }

.dv-empty { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; text-align: center; }
.dv-empty-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--neutral-50); display: flex; align-items: center; justify-content: center; color: var(--neutral-400); margin-bottom: 12px; }
.dv-empty-text { font-size: .88rem; font-weight: 600; color: var(--text-heading); }
.dv-empty-hint { font-size: .78rem; color: var(--text-muted); margin-top: 4px; }

@media (max-width: 768px) {
  .dv-toolbar { flex-direction: column; align-items: stretch; }
  .dv-toolbar-left { margin-bottom: 4px; }
  /* The row wraps, and the status select is width:100% like every .select, so
     it takes a line to itself. min-width:0 alone let the search shrink but
     never grow, leaving it stranded at about half the width above a full-width
     select. Give it its own full line to match. */
  .dv-search { flex: 1 1 100%; min-width: 0; }
}
</style>
