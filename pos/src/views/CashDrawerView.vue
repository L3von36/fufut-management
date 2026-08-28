<template>
  <div>
    <div class="table-toolbar">
      <h3>Cash Drawer &amp; Till Management</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <base-button v-if="!activeDrawer" text="Open Drawer" variant="btn-primary" :on-click="openDrawerPrompt" />
        <base-button v-if="activeDrawer" text="Close Drawer (Z-Count)" variant="btn-warning" :on-click="closeDrawerPrompt" />
        <button v-if="activeDrawer" class="btn btn-outline" @click="showPaidModal = true" title="Paid-In or Paid-Out (Petty Cash)">
          💵 Paid-In / Out
        </button>
        <button v-if="activeDrawer" class="btn btn-outline" @click="showPopModal = true" title="Manual Drawer Open">
          🔓 Pop Drawer
        </button>
        <base-button text="Refresh" variant="btn-outline" :on-click="loadData" />
        <button class="btn btn-outline" @click="printDrawer" title="Print drawer report">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        </button>
      </div>
    </div>

    <!-- Active Drawer -->
    <div class="card" v-if="activeDrawer" style="margin-bottom:16px;border-color:var(--teal-200);background:var(--teal-50)">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>🟢 Active Drawer</h3>
        <span class="badge badge-fulfilled">Shift Open</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px">
        <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-muted)">Opened</div><div style="font-weight:600">{{ new Date(activeDrawer.opened || activeDrawer.opened_at).toLocaleString() }}</div></div>
        <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-muted)">Opening Float</div><div style="font-weight:600;font-family:var(--font-mono)">ETB {{ parseFloat(activeDrawer.openingBal || activeDrawer.opening_balance || 0).toFixed(0) }}</div></div>
        <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-muted)">Cash Sales</div><div style="font-weight:600;font-family:var(--font-mono);color:var(--success)">ETB {{ cashSales }}</div></div>
        <div><div style="font-size:.72rem;text-transform:uppercase;color:var(--text-muted)">Expected Total</div><div style="font-weight:600;font-family:var(--font-mono)">ETB {{ expectedClose }}</div></div>
      </div>
    </div>
    <div class="card" v-else style="margin-bottom:16px">
      <div style="text-align:center;padding:24px;color:var(--text-muted)">No active open cash drawer. Click "Open Drawer" to start your shift.</div>
    </div>

    <!-- Mode Tabs -->
    <div style="display:flex;gap:12px;margin-bottom:16px;border-bottom:1px solid var(--border)">
      <button class="tab-btn" :class="{ active: activeTab === 'today' }" @click="activeTab = 'today'">Today's Drawers</button>
      <button class="tab-btn" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">Z-Report History</button>
    </div>

    <div v-if="activeTab === 'today'">
      <div class="summary-grid">
        <div class="summary-card"><div class="num">{{ todaysDrawers.length }}</div><div class="lbl">Today's Drawers</div></div>
        <div class="summary-card"><div class="num" style="color:var(--success)">ETB {{ todayCashSales }}</div><div class="lbl">Cash Sales</div></div>
        <div class="summary-card"><div class="num" :style="{color: totalVariance >= 0 ? 'var(--success)' : 'var(--danger)'}">{{ totalVariance >= 0 ? '+' : '' }}{{ totalVariance }}</div><div class="lbl">Total Variance</div></div>
      </div>

      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Shift</th><th>Opened</th><th>Opening Bal</th><th>Cash Sales</th><th>Closing Bal</th><th>Expected</th><th>Variance</th><th>Actions</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in todaysDrawers" :key="d.id">
                <td data-label="Shift"><strong>{{ d.shift || d.id }}</strong></td>
                <td data-label="Opened">{{ d.opened || d.opened_at ? new Date(d.opened || d.opened_at).toLocaleString() : '—' }}</td>
                <td data-label="Opening">ETB {{ parseFloat(d.openingBal || d.opening_balance || 0).toFixed(0) }}</td>
                <td data-label="Cash Sales">ETB {{ parseFloat(d.cashSales || d.cash_sales || 0).toFixed(0) }}</td>
                <td data-label="Closing">ETB {{ parseFloat(d.closingBal || d.closing_balance || 0).toFixed(0) }}</td>
                <td data-label="Expected">ETB {{ parseFloat(d.expectedClose || d.expected || 0).toFixed(0) }}</td>
                <td data-label="Variance" :style="{color: parseFloat(d.variance||0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight:600}">{{ parseFloat(d.variance||0) >= 0 ? '+' : '' }}{{ parseFloat(d.variance||0).toFixed(0) }}</td>
                <td data-label="Actions">
                  <button class="btn btn-sm btn-ghost" @click="printZReport(d)" title="Print Thermal Z-Report">🖨️ Z-Report</button>
                </td>
              </tr>
              <tr v-if="!todaysDrawers.length"><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">No drawer records</td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination"><span>{{ todaysDrawers.length }} drawer(s) today</span></div>
      </div>
    </div>

    <!-- Z-Report History Tab -->
    <div v-else-if="activeTab === 'history'">
      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Shift ID</th><th>Closed Time</th><th>Opening Float</th><th>Cash Sales</th><th>Counted Total</th><th>Variance</th><th>Z-Report</th></tr>
            </thead>
            <tbody>
              <tr v-for="h in historyDrawers" :key="h.id">
                <td data-label="Shift"><strong>{{ h.id }}</strong></td>
                <!-- closed_at arrives with migration 021; rows closed before it
                     only record when they were opened, so say so honestly
                     instead of labelling an open time as the close. -->
                <td data-label="Closed">{{ (h.closed || h.closed_at) ? new Date(h.closed || h.closed_at).toLocaleString() : 'before close-tracking' }}</td>
                <td data-label="Opening">ETB {{ parseFloat(h.openingBal || h.opening_balance || 0).toFixed(0) }}</td>
                <td data-label="Cash Sales">ETB {{ parseFloat(h.cashSales || h.cash_sales || 0).toFixed(0) }}</td>
                <td data-label="Counted">ETB {{ parseFloat(h.closingBal || h.closing_balance || 0).toFixed(0) }}</td>
                <td data-label="Variance" :style="{color: parseFloat(h.variance||0) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight:600}">
                  {{ parseFloat(h.variance||0) >= 0 ? '+' : '' }}{{ parseFloat(h.variance||0).toFixed(0) }}
                </td>
                <td data-label="Z-Report">
                  <button class="btn btn-sm btn-outline" @click="printZReport(h)">🖨️ Print Z-Report</button>
                </td>
              </tr>
              <tr v-if="!historyDrawers.length"><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No past closed drawer sessions</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Open Drawer Prompt -->
    <div class="modal-overlay" v-if="showOpenPrompt" @click.self="showOpenPrompt=false">
      <div class="modal">
        <h3>Open Cash Drawer</h3>
        <p class="modal-sub">Enter the starting cash float amount</p>
        <div class="form-group">
          <label>Opening Float Balance (ETB)</label>
          <input v-model.number="openingBal" type="number" placeholder="e.g. 1000" class="input input-sm" autofocus />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showOpenPrompt=false">Cancel</button>
          <base-button text="Open Drawer" variant="btn-primary" :disabled="!openingBal" :on-click="handleOpenDrawer" />
        </div>
      </div>
    </div>

    <!-- Close Drawer (Blind Denomination Count) Prompt -->
    <div class="modal-overlay" v-if="showClosePrompt" @click.self="showClosePrompt=false">
      <div class="modal" style="max-width:520px">
        <h3>Close Cash Drawer (Z-Count)</h3>
        <p class="modal-sub">Enter cash bill counts for denomination validation</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div v-for="note in [200, 100, 50, 20, 10, 5]" :key="note" class="form-group" style="margin:0">
            <label style="font-size:.78rem;font-weight:600" :for="'zcount-' + note">{{ note }} ETB Notes</label>
            <input :id="'zcount-' + note" :aria-label="note + ' ETB note count'" type="number" min="0" v-model.number="denominations[note]" placeholder="0" class="input input-sm" @input="recalcClosingBal" />
          </div>
        </div>

        <div class="form-group">
          <label>Total Counted Cash (ETB)</label>
          <input v-model.number="closingBal" type="number" placeholder="e.g. 5000" class="input input-sm" />
        </div>
        <div v-if="closingBal && activeDrawer" style="font-size:.85rem;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Opening Float:</span> <strong>ETB {{ parseFloat(activeDrawer.openingBal||0).toFixed(0) }}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Cash Sales:</span> <strong>ETB {{ cashSales }}</strong></div>
          <div v-if="paidIn" style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Paid-In:</span> <strong>ETB {{ paidIn.toFixed(0) }}</strong></div>
          <div v-if="paidOut" style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Paid-Out:</span> <strong>ETB {{ paidOut.toFixed(0) }}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Expected Cash:</span> <strong>ETB {{ expectedClose }}</strong></div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:4px">
            <span>Net Variance:</span>
            <strong :style="{color: (closingBal - expectedClose) >= 0 ? 'var(--success)' : 'var(--danger)'}">
              {{ (closingBal - Number(expectedClose)) >= 0 ? '+' : '' }}{{ (closingBal - Number(expectedClose)).toFixed(0) }}
            </strong>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showClosePrompt=false">Cancel</button>
          <base-button text="Close Drawer &amp; Print Z-Report" variant="btn-warning" :disabled="!closingBal" :on-click="handleCloseDrawer" />
        </div>
      </div>
    </div>

    <!-- Paid-In / Paid-Out Modal -->
    <div class="modal-overlay" v-if="showPaidModal" @click.self="showPaidModal=false">
      <div class="modal">
        <h3>Paid-In / Paid-Out (Petty Cash)</h3>
        <p class="modal-sub">Log cash added to or taken from the till with a reason</p>
        <div class="form-group">
          <label>Type</label>
          <select v-model="paidType" class="select select-sm">
            <option value="paid-out">Paid-Out (Petty Cash Expense / Drop)</option>
            <option value="paid-in">Paid-In (Cash Addition)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Amount (ETB)</label>
          <input v-model.number="paidAmount" type="number" min="1" placeholder="e.g. 200" class="input input-sm" />
        </div>
        <div class="form-group">
          <label>Reason (Mandatory)</label>
          <input v-model="paidReason" type="text" placeholder="e.g. Purchased extra milk / courier fee" class="input input-sm" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showPaidModal=false">Cancel</button>
          <button class="btn btn-primary" :disabled="!paidAmount || !paidReason.trim()" @click="submitPaidInOut">
            Record {{ paidType === 'paid-out' ? 'Paid-Out' : 'Paid-In' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Manual Drawer Pop Modal -->
    <div class="modal-overlay" v-if="showPopModal" @click.self="showPopModal=false">
      <div class="modal">
        <h3>Pop Cash Drawer (No-Sale)</h3>
        <p class="modal-sub">Log physical drawer open reason for shift audit</p>
        <div class="form-group">
          <label>Reason for Opening Drawer</label>
          <input v-model="popReason" type="text" placeholder="e.g. Making change for customer" class="input input-sm" autofocus />
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showPopModal=false">Cancel</button>
          <button class="btn btn-primary" :disabled="!popReason.trim()" @click="submitDrawerPop">
            Pop Drawer &amp; Audit Log
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, TODAY } from '../api'
import { useButtonState } from '../composables/useButtonState'
import { printReport, printZReport } from '../lib/print'

const toast = inject('toast')
const btnState = useButtonState({ successDuration: 2000 })
const drawers = ref([])
const historyDrawers = ref([])
const activeDrawer = ref(null)
const activeTab = ref('today')

const showOpenPrompt = ref(false)
const showClosePrompt = ref(false)
const showPaidModal = ref(false)
const showPopModal = ref(false)

const openingBal = ref(0)
const closingBal = ref(0)
const paidType = ref('paid-out')
const paidAmount = ref(0)
const paidReason = ref('')
const popReason = ref('')

const denominations = ref({
  200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0
})

function recalcClosingBal() {
  let sum = 0
  for (const [note, count] of Object.entries(denominations.value)) {
    sum += Number(note) * (Number(count) || 0)
  }
  if (sum > 0) closingBal.value = sum
}

const drawerNum = (d, ...keys) => {
  if (!d) return 0
  for (const k of keys) { const v = parseFloat(d[k]); if (Number.isFinite(v)) return v }
  return 0
}

const cashSales = computed(() => {
  if (!activeDrawer.value) return '0'
  return drawerNum(activeDrawer.value, 'cashSales', 'cash_sales').toFixed(0)
})

const paidIn = computed(() => drawerNum(activeDrawer.value, 'paid_in'))
const paidOut = computed(() => drawerNum(activeDrawer.value, 'paid_out'))

/**
 * What the till should hold right now. Mirrors the server's close-time formula
 * (opening + cash sales + paid-in - paid-out, migration 020) so the figure the
 * cashier counts against is the same one the Z-count will judge them by.
 * Showing only opening + cash sales made every paid-in/out read as a variance
 * the moment the drawer was closed.
 */
const expectedClose = computed(() => {
  if (!activeDrawer.value) return '0'
  const expected = drawerNum(activeDrawer.value, 'openingBal', 'opening_balance')
    + drawerNum(activeDrawer.value, 'cashSales', 'cash_sales')
    + paidIn.value
    - paidOut.value
  return expected.toFixed(0)
})

/** Local calendar day of a drawer's opening, "" when unknown. */
function drawerLocalDay(d) {
  const raw = d && (d.opened || d.opened_at || d.created)
  if (!raw) return ''
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return String(raw).slice(0, 10)
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${m}-${day}`
}

/**
 * Drawers opened today, on this device's clock. The tab is called "Today's
 * Drawers", and until now it listed every drawer the account had ever closed,
 * so a fresh morning shift opened onto days-old counts and cash sales. Full
 * history stays on the Z-Report tab.
 */
const todaysDrawers = computed(() => {
  // Use TODAY() from the api module so tests that mock TODAY() see the same
  // "today" the rest of the code does. Without this, the filter silently broke
  // the day after a test was written (Aug 27 test, Aug 28 reality, 0 drawers shown).
  const key = TODAY()
  return drawers.value.filter(d => drawerLocalDay(d) === key)
})

const todayCashSales = computed(() => {
  return todaysDrawers.value.filter(d => d.status === 'closed').reduce((s, d) => s + drawerNum(d, 'cashSales', 'cash_sales'), 0).toFixed(0)
})

const totalVariance = computed(() => {
  return todaysDrawers.value.reduce((s, d) => s + drawerNum(d, 'variance'), 0).toFixed(0)
})

onMounted(loadData)

async function loadData() {
  try {
    const [res, hist] = await Promise.all([
      apiGet('cashdrawer').catch(() => ({ drawers: [] })),
      apiGet('cashdrawer/history').catch(() => ({ drawers: [] }))
    ])
    drawers.value = res.drawers || res.data || (Array.isArray(res) ? res : [])
    activeDrawer.value = res.active || drawers.value.find(d => d.status === 'open') || null
    historyDrawers.value = hist.drawers || (Array.isArray(hist) ? hist : [])
  } catch (e) { console.error(e) }
}

async function handleOpenDrawer() {
  if (!openingBal.value) return
  try {
    await apiPost('cashdrawer/open', { openingBal: openingBal.value })
    toast('Cash drawer opened')
    showOpenPrompt.value = false
    openingBal.value = 0
    await loadData()
  } catch { toast('Failed to open drawer', 'error'); throw new Error('Failed to open drawer') }
}

async function handleCloseDrawer() {
  if (!closingBal.value || !activeDrawer.value) return
  const expected = Number(expectedClose.value)
  if (closingBal.value < 0) {
    toast('Closing balance cannot be negative', 'error')
    return
  }
  const variance = closingBal.value - expected
  const variancePct = expected > 0 ? Math.abs(variance / expected * 100) : 0
  if (variancePct > 20 && !confirm(`Large variance: ETB ${variance >= 0 ? '+' : ''}${variance.toFixed(0)} (${variancePct.toFixed(0)}% off). Close anyway?`)) {
    return
  }
  try {
    const res = await apiPost('cashdrawer/close', {
      id: activeDrawer.value.id,
      closingBal: closingBal.value,
      denominations: denominations.value
    })
    toast('Drawer closed and Z-Report recorded')
    printZReport({
      id: activeDrawer.value.id,
      openingBal: activeDrawer.value.openingBal || activeDrawer.value.opening_balance,
      cashSales: cashSales.value,
      closingBal: closingBal.value,
      expectedClose: expectedClose.value,
      variance,
      denominations: denominations.value
    })
    showClosePrompt.value = false
    closingBal.value = 0
    denominations.value = { 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0 }
    activeDrawer.value = null
    await loadData()
  } catch { toast('Failed to close drawer', 'error'); throw new Error('Failed to close drawer') }
}

async function submitPaidInOut() {
  if (!paidAmount.value || !paidReason.value.trim()) return
  try {
    await apiPost(`cashdrawer/${paidType.value}`, {
      amount: paidAmount.value,
      reason: paidReason.value.trim()
    })
    toast(`${paidType.value === 'paid-out' ? 'Paid-Out' : 'Paid-In'} recorded`)
    showPaidModal.value = false
    paidAmount.value = 0
    paidReason.value = ''
    await loadData()
  } catch (e) {
    toast(e.message || 'Failed to record entry', 'error')
  }
}

async function submitDrawerPop() {
  if (!popReason.value.trim()) return
  try {
    await apiPost('cashdrawer/pop', { reason: popReason.value.trim() })
    toast('Drawer popped & logged to audit')
    showPopModal.value = false
    popReason.value = ''
  } catch (e) {
    toast(e.message || 'Failed to log pop', 'error')
  }
}

function printDrawer() {
  const rows = drawers.value.map(d => [
    d.shift || d.id,
    d.opened ? new Date(d.opened).toLocaleString() : '—',
    `ETB ${parseFloat(d.openingBal||0).toFixed(0)}`,
    `ETB ${parseFloat(d.cashSales||0).toFixed(0)}`,
    `ETB ${parseFloat(d.closingBal||0).toFixed(0)}`,
    `ETB ${parseFloat(d.expectedClose||0).toFixed(0)}`,
    `${parseFloat(d.variance||0) >= 0 ? '+' : ''}ETB ${parseFloat(d.variance||0).toFixed(0)}`,
    d.status,
  ])
  const ok = printReport({
    title: 'Cash Drawer Report',
    summary: [
      ['Drawers today', drawers.value.length],
      ['Cash sales', `ETB ${todayCashSales.value}`],
      ['Total variance', `${totalVariance.value >= 0 ? '+' : ''}ETB ${totalVariance.value}`],
    ],
    headers: ['Shift', 'Opened', 'Opening', 'Cash Sales', 'Closing', 'Expected', 'Variance', 'Status'],
    rows,
  })
  if (!ok) toast('Allow pop-ups for this site to print', 'error')
}

function openDrawerPrompt() { openingBal.value = 0; showOpenPrompt.value = true }
function closeDrawerPrompt() { closingBal.value = 0; showClosePrompt.value = true }
</script>

<style scoped>
.tab-btn {
  background: none; border: none; padding: 10px 16px; font-weight: 600; font-size: .9rem;
  color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent;
}
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
</style>
