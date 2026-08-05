<template>
  <div>
    <div class="table-toolbar">
      <h3>Cash Drawer</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <base-button v-if="!activeDrawer" text="Open Drawer" variant="btn-primary" :on-click="openDrawerPrompt" />
        <base-button v-if="activeDrawer" text="Close Drawer" variant="btn-warning" :on-click="closeDrawerPrompt" />
        <base-button text="Refresh" variant="btn-outline" :on-click="loadData" />
      </div>
    </div>

    <!-- Active Drawer -->
    <div class="card" v-if="activeDrawer" style="margin-bottom:16px;border-color:var(--teal-200);background:var(--teal-50)">
      <div class="card-header"><h3>🟢 Active Drawer</h3></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
        <div><div style="font-size:.68rem;text-transform:uppercase;color:var(--text-muted)">Opened</div><div style="font-weight:600">{{ new Date(activeDrawer.opened).toLocaleString() }}</div></div>
        <div><div style="font-size:.68rem;text-transform:uppercase;color:var(--text-muted)">Opening Bal</div><div style="font-weight:600;font-family:var(--font-mono)">ETB {{ parseFloat(activeDrawer.openingBal||0).toFixed(0) }}</div></div>
        <div><div style="font-size:.68rem;text-transform:uppercase;color:var(--text-muted)">Cash Sales</div><div style="font-weight:600;font-family:var(--font-mono)">ETB {{ cashSales }}</div></div>
        <div><div style="font-size:.68rem;text-transform:uppercase;color:var(--text-muted)">Expected Close</div><div style="font-weight:600;font-family:var(--font-mono)">ETB {{ expectedClose }}</div></div>
      </div>
    </div>
    <div class="card" v-else style="margin-bottom:16px">
      <div style="text-align:center;padding:20px;color:var(--text-muted)">No open drawer. Click "Open Drawer" to start a shift.</div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ drawers.length }}</div><div class="lbl">Today's Drawers</div></div>
      <div class="summary-card"><div class="num" style="color:var(--success)">ETB {{ todayCashSales }}</div><div class="lbl">Cash Sales</div></div>
      <div class="summary-card"><div class="num" :style="{color: totalVariance >= 0 ? 'var(--success)' : 'var(--danger)'}">{{ totalVariance >= 0 ? '+' : '' }}{{ totalVariance }}</div><div class="lbl">Total Variance</div></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr><th>Shift</th><th>Opened</th><th>Opening Bal</th><th>Cash Sales</th><th>Closing Bal</th><th>Expected</th><th>Variance</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in drawers" :key="d.id">
              <td data-label="Shift">{{ d.shift || d.id }}</td>
              <td data-label="Opened">{{ d.opened ? new Date(d.opened).toLocaleString() : '—' }}</td>
              <td data-label="Opening">ETB {{ parseFloat(d.openingBal||0).toFixed(0) }}</td>
              <td data-label="Cash Sales">ETB {{ parseFloat(d.cashSales||0).toFixed(0) }}</td>
              <td data-label="Closing">ETB {{ parseFloat(d.closingBal||0).toFixed(0) }}</td>
              <td data-label="Expected">ETB {{ parseFloat(d.expectedClose||0).toFixed(0) }}</td>
              <td data-label="Variance" :style="{color: parseFloat(d.variance||0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight:600}">{{ parseFloat(d.variance||0) >= 0 ? '+' : '' }}{{ parseFloat(d.variance||0).toFixed(0) }}</td>
              <td data-label="Status"><span class="badge" :class="d.status==='open' ? 'badge-new' : 'badge-fulfilled'">{{ d.status }}</span></td>
            </tr>
            <tr v-if="!drawers.length"><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">No drawer records</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ drawers.length }} drawer(s)</span></div>
    </div>

    <!-- Open Drawer Prompt -->
    <div class="modal-overlay" v-if="showOpenPrompt" @click.self="showOpenPrompt=false">
      <div class="modal">
        <h3>Open Cash Drawer</h3>
        <p class="modal-sub">Enter the starting cash amount</p>
        <div class="form-group">
          <label>Opening Balance (ETB)</label>
          <input v-model.number="openingBal" type="number" placeholder="e.g. 1000" class="input input-sm" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showOpenPrompt=false">Cancel</button>
          <base-button text="Open Drawer" variant="btn-primary" :disabled="!openingBal" :on-click="handleOpenDrawer" />
        </div>
      </div>
    </div>

    <!-- Close Drawer Prompt -->
    <div class="modal-overlay" v-if="showClosePrompt" @click.self="showClosePrompt=false">
      <div class="modal">
        <h3>Close Cash Drawer</h3>
        <p class="modal-sub">Count the cash in the drawer and enter it below</p>
        <div class="form-group">
          <label>Closing Balance (ETB)</label>
          <input v-model.number="closingBal" type="number" placeholder="e.g. 5000" class="input input-sm" />
        </div>
        <div v-if="closingBal && activeDrawer" style="font-size:.85rem;padding:10px;background:var(--neutral-25);border-radius:var(--radius-sm);margin-bottom:12px">
          <div>Opening: <strong>ETB {{ parseFloat(activeDrawer.openingBal||0).toFixed(0) }}</strong></div>
          <div>Cash Sales: <strong>ETB {{ cashSales }}</strong></div>
          <div>Expected: <strong>ETB {{ expectedClose }}</strong></div>
          <div>Variance: <strong :style="{color: (closingBal - expectedClose) >= 0 ? 'var(--success)' : 'var(--danger)'}">{{ (closingBal - Number(expectedClose)) >= 0 ? '+' : '' }}{{ (closingBal - Number(expectedClose)).toFixed(0) }}</strong></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showClosePrompt=false">Cancel</button>
          <base-button text="Close Drawer" variant="btn-warning" :disabled="!closingBal" :on-click="handleCloseDrawer" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPost } from '../api'
import { useToast } from '../composables/useToast'
import { useButtonState } from '../composables/useButtonState'

const { toast } = useToast()
const btnState = useButtonState({ successDuration: 2000 })
const drawers = ref([])
const activeDrawer = ref(null)
const showOpenPrompt = ref(false)
const showClosePrompt = ref(false)
const openingBal = ref(0)
const closingBal = ref(0)

const cashSales = computed(() => {
  if (!activeDrawer.value) return '0'
  return parseFloat(activeDrawer.value.cashSales || 0).toFixed(0)
})

const expectedClose = computed(() => {
  if (!activeDrawer.value) return '0'
  const ob = parseFloat(activeDrawer.value.openingBal || 0)
  const cs = parseFloat(activeDrawer.value.cashSales || 0)
  return (ob + cs).toFixed(0)
})

const todayCashSales = computed(() => {
  return drawers.value.filter(d => d.status === 'closed').reduce((s, d) => s + parseFloat(d.cashSales || 0), 0).toFixed(0)
})

const totalVariance = computed(() => {
  return drawers.value.reduce((s, d) => s + parseFloat(d.variance || 0), 0).toFixed(0)
})

onMounted(loadData)

async function loadData() {
  try {
    const res = await apiGet('cashdrawer')
    drawers.value = res.drawers || res.data || (Array.isArray(res) ? res : [])
    activeDrawer.value = res.active || drawers.value.find(d => d.status === 'open') || null
  } catch (e) { console.error(e) }
}

async function handleOpenDrawer() {
  if (!openingBal.value) return
  try {
    await apiPost('cashdrawer/open', { openingBal: openingBal.value })
    toast('Drawer opened')
    showOpenPrompt.value = false
    openingBal.value = 0
    await loadData()
  } catch { toast('Failed to open drawer', 'error'); throw new Error('Failed to open drawer') }
}

async function handleCloseDrawer() {
  if (!closingBal.value || !activeDrawer.value) return
  try {
    await apiPost('cashdrawer/close', { id: activeDrawer.value.id, closingBal: closingBal.value })
    toast('Drawer closed')
    showClosePrompt.value = false
    closingBal.value = 0
    activeDrawer.value = null
    await loadData()
  } catch { toast('Failed to close drawer', 'error'); throw new Error('Failed to close drawer') }
}

function openDrawerPrompt() { openingBal.value = 0; showOpenPrompt.value = true }
function closeDrawerPrompt() { closingBal.value = 0; showClosePrompt.value = true }
</script>