<template>
  <div class="zr" v-if="report">
    <div class="zr-toolbar no-print">
      <button class="btn btn-outline btn-sm" @click="router.back()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <div class="zr-drawer-selector">
        <select v-model="selectedDrawer" class="zr-select" @change="load">
          <option value="">Select a closed drawer…</option>
          <option v-for="d in drawers" :key="d.id" :value="d.id">
            {{ d.id }} · {{ shortDate(d.opened) }} → {{ d.closed ? shortDate(d.closed) : '—' }}
          </option>
        </select>
      </div>
      <button class="btn btn-primary btn-sm" @click="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
        Print Z-Report
      </button>
    </div>

    <!-- Report -->
    <div class="zr-report">
      <!-- Header -->
      <div class="zr-header">
        <h1>Z-REPORT</h1>
        <div class="zr-header-grid">
          <div class="zr-header-item"><span class="zr-lbl">Z-Number</span><span class="zr-val">#{{ report.header.zNumber }}</span></div>
          <div class="zr-header-item"><span class="zr-lbl">Drawer ID</span><span class="zr-val zr-mono">{{ report.header.drawerId }}</span></div>
          <div class="zr-header-item"><span class="zr-lbl">Status</span><span class="zr-val zr-status-badge" :class="report.header.status">{{ report.header.status }}</span></div>
          <div class="zr-header-item"><span class="zr-lbl">Opened</span><span class="zr-val">{{ formatTime(report.header.openedAt) }}</span></div>
          <div class="zr-header-item" v-if="report.header.closedAt"><span class="zr-lbl">Closed</span><span class="zr-val">{{ formatTime(report.header.closedAt) }}</span></div>
          <div class="zr-header-item"><span class="zr-lbl">VAT Rate</span><span class="zr-val">{{ (report.header.vatRate * 100) }}%</span></div>
        </div>
      </div>

      <!-- Receipt Range -->
      <div class="zr-section">
        <div class="zr-section-title">Receipt Summary</div>
        <div class="zr-receipt-grid">
          <div><span class="zr-lbl">First Receipt</span><span class="zr-val zr-mono">{{ report.receiptRange.firstReceipt || '—' }}</span></div>
          <div><span class="zr-lbl">Last Receipt</span><span class="zr-val zr-mono">{{ report.receiptRange.lastReceipt || '—' }}</span></div>
          <div><span class="zr-lbl">Total Receipts</span><span class="zr-val">{{ report.receiptRange.totalReceipts }}</span></div>
        </div>
      </div>

      <!-- VAT Breakdown -->
      <div class="zr-section">
        <div class="zr-section-title">VAT Breakdown (Ethiopia 15%)</div>
        <table class="zr-table">
          <thead><tr><th>Tax Rate</th><th>Gross (ETB)</th><th>VAT (ETB)</th><th>Receipts</th></tr></thead>
          <tbody>
            <tr><td>Standard (15%)</td><td>{{ report.vatBreakdown.standard.gross.toLocaleString() }}</td><td>{{ report.vatBreakdown.standard.vat.toLocaleString() }}</td><td>{{ report.vatBreakdown.standard.count }}</td></tr>
            <tr v-if="report.vatBreakdown.exempt.count > 0"><td>Exempt (0%)</td><td>{{ report.vatBreakdown.exempt.gross.toLocaleString() }}</td><td>0</td><td>{{ report.vatBreakdown.exempt.count }}</td></tr>
            <tr class="zr-table-total"><td>Total</td><td>{{ report.vatBreakdown.totalGross.toLocaleString() }}</td><td>{{ report.vatBreakdown.totalVat.toLocaleString() }}</td><td>{{ report.vatBreakdown.standard.count + report.vatBreakdown.exempt.count }}</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Payment Methods -->
      <div class="zr-section" v-if="report.paymentBreakdown.length">
        <div class="zr-section-title">Sales by Payment Method</div>
        <table class="zr-table">
          <thead><tr><th>Method</th><th>Count</th><th>Total (ETB)</th><th>Refunds</th><th>Net (ETB)</th></tr></thead>
          <tbody>
            <tr v-for="p in report.paymentBreakdown" :key="p.method">
              <td class="zr-cap">{{ p.method }}</td><td>{{ p.count }}</td><td>{{ p.total.toLocaleString() }}</td>
              <td>{{ p.refundCount > 0 ? p.refundCount + ' (ETB ' + p.refunds + ')' : '—' }}</td>
              <td>{{ p.net.toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Cash Reconciliation -->
      <div class="zr-section">
        <div class="zr-section-title">Cash Reconciliation</div>
        <div class="zr-recon">
          <div class="zr-recon-row"><span>Opening Float</span><span>ETB {{ report.cashReconciliation.openingFloat.toLocaleString() }}</span></div>
          <div class="zr-recon-row"><span>+ Cash Sales</span><span>ETB {{ report.cashReconciliation.cashSales.toLocaleString() }}</span></div>
          <div class="zr-recon-row" v-if="report.cashReconciliation.paidIn"><span>+ Paid In</span><span>ETB {{ report.cashReconciliation.paidIn.toLocaleString() }}</span></div>
          <div class="zr-recon-row" v-if="report.cashReconciliation.paidOut"><span>− Paid Out</span><span>ETB {{ report.cashReconciliation.paidOut.toLocaleString() }}</span></div>
          <div class="zr-recon-row zr-recon-subtotal"><span>= Expected Cash</span><span>ETB {{ report.cashReconciliation.expected.toLocaleString() }}</span></div>
          <div class="zr-recon-row"><span>Counted Cash</span><span>ETB {{ report.cashReconciliation.counted.toLocaleString() }}</span></div>
          <div class="zr-recon-row" :class="{ 'zr-variance-neg': report.cashReconciliation.variance < 0, 'zr-variance-pos': report.cashReconciliation.variance > 0 }">
            <span>Variance</span><span>ETB {{ report.cashReconciliation.variance.toLocaleString() }}</span>
          </div>
        </div>
      </div>

      <!-- Voids -->
      <div class="zr-section" v-if="report.voids.count > 0">
        <div class="zr-section-title">Voids</div>
        <div class="zr-voids-summary">
          <span>{{ report.voids.count }} voided order(s), ETB {{ report.voids.total.toLocaleString() }}</span>
        </div>
        <table class="zr-table" v-if="report.voids.byCategory.length">
          <thead><tr><th>Category</th><th>Count</th><th>Total (ETB)</th></tr></thead>
          <tbody>
            <tr v-for="v in report.voids.byCategory" :key="v.category"><td class="zr-cap">{{ v.category }}</td><td>{{ v.count }}</td><td>{{ v.total.toLocaleString() }}</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Refunds -->
      <div class="zr-section" v-if="report.refunds.count > 0">
        <div class="zr-section-title">Refunds</div>
        <table class="zr-table">
          <thead><tr><th>Method</th><th>Count</th><th>Total (ETB)</th></tr></thead>
          <tbody>
            <tr v-for="r in report.refunds.byMethod" :key="r.method"><td class="zr-cap">{{ r.method }}</td><td>{{ r.count }}</td><td>{{ r.total.toLocaleString() }}</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Service Charge + Tips -->
      <div class="zr-section">
        <div class="zr-section-title">Service Charge & Tips</div>
        <div class="zr-recon">
          <div class="zr-recon-row"><span>Service Charge (taxable)</span><span>ETB {{ report.serviceCharge.toLocaleString() }}</span></div>
          <div class="zr-recon-row"><span>Tips (non-revenue, owed to staff)</span><span>ETB {{ report.tips.toLocaleString() }}</span></div>
        </div>
      </div>

      <!-- Grand Totals -->
      <div class="zr-section zr-grand">
        <div class="zr-section-title">Cumulative Grand Totals</div>
        <div class="zr-recon">
          <div class="zr-recon-row"><span>Total Z-Reports (all time)</span><span>{{ report.grandTotals.zCount }}</span></div>
          <div class="zr-recon-row"><span>Cumulative Cash Sales (all time)</span><span>ETB {{ report.grandTotals.cumulativeCashSales.toLocaleString() }}</span></div>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="zr-loading">
    <div v-if="loading">Loading Z-Report…</div>
    <div v-else>
      <p>Select a closed drawer to view its Z-Report.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { apiGet } from '../api'

const router = useRouter()
const route = useRoute()
const report = ref(null)
const loading = ref(false)
const drawers = ref([])
const selectedDrawer = ref('')
const window = globalThis

function shortDate(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
function formatTime(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }

async function loadDrawers() {
  try {
    const res = await apiGet('cashdrawer/history')
    if (res && res.ok) {
      drawers.value = res.drawers || []
      // Auto-select from route param or the most recent
      const paramId = route.params.id
      if (paramId) {
        selectedDrawer.value = paramId
      } else if (drawers.value.length) {
        selectedDrawer.value = drawers.value[0].id
      }
      if (selectedDrawer.value) await load()
    }
  } catch (e) { console.error('Drawer history load failed', e) }
}

async function load() {
  if (!selectedDrawer.value) return
  loading.value = true
  try {
    const res = await apiGet(`cashdrawer/${selectedDrawer.value}/z-report`)
    if (res && res.ok) report.value = res
    else report.value = null
  } catch (e) { console.error('Z-report load failed', e); report.value = null }
  finally { loading.value = false }
}

onMounted(loadDrawers)
watch(() => route.params.id, loadDrawers)
</script>

<style scoped>
.zr { max-width: 700px; margin: 0 auto; }
.zr-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.zr-select { font-size: .82rem; padding: 5px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); min-width: 250px; }
.zr-loading { text-align: center; padding: 40px; color: var(--text-muted); }

.zr-report { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }

/* Header */
.zr-header { background: linear-gradient(135deg, var(--teal-700, #0F7B78), var(--teal-800, #0B5A57)); color: #fff; padding: 20px 24px; }
.zr-header h1 { font-size: 1.5rem; margin: 0 0 12px; font-weight: 700; letter-spacing: .06em; }
.zr-header-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.zr-header-item { display: flex; flex-direction: column; gap: 2px; }
.zr-lbl { font-size: .68rem; opacity: .7; text-transform: uppercase; letter-spacing: .04em; }
.zr-val { font-size: .82rem; font-weight: 500; }
.zr-mono { font-family: var(--font-mono, monospace); font-size: .76rem; }
.zr-status-badge { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: .72rem; font-weight: 600; text-transform: uppercase; }
.zr-status-badge.closed { background: rgba(16, 185, 129, .25); color: #6ee7b7; }
.zr-status-badge.open { background: rgba(245, 158, 11, .25); color: #fcd34d; }

/* Sections */
.zr-section { padding: 16px 24px; border-bottom: 1px solid var(--border); }
.zr-section:last-child { border-bottom: none; }
.zr-section-title { font-size: .76rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
.zr-grand { background: var(--bg); }

/* Receipt grid */
.zr-receipt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }

/* Tables */
.zr-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.zr-table th { text-align: left; padding: 6px 10px; border-bottom: 2px solid var(--border); font-size: .68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.zr-table td { padding: 6px 10px; border-bottom: 1px solid var(--border); }
.zr-table-total td { font-weight: 700; border-top: 2px solid var(--border); border-bottom: none; }
.zr-cap { text-transform: capitalize; }

/* Cash reconciliation */
.zr-recon { display: flex; flex-direction: column; gap: 6px; }
.zr-recon-row { display: flex; justify-content: space-between; font-size: .85rem; padding: 4px 0; }
.zr-recon-subtotal { font-weight: 700; border-top: 1px solid var(--border); margin-top: 4px; padding-top: 8px; }
.zr-variance-neg { color: #DC2626; font-weight: 600; }
.zr-variance-pos { color: #10B981; font-weight: 600; }

/* Voids */
.zr-voids-summary { font-size: .85rem; color: var(--text-muted); margin-bottom: 8px; }

@media print {
  .no-print { display: none !important; }
  .zr { max-width: none; }
  .zr-report { border: none; }
  .zr-header { background: #0F7B78 !important; -webkit-print-color-adjust: exact; }
}
@media (max-width: 600px) {
  .zr-header-grid { grid-template-columns: 1fr 1fr; }
  .zr-receipt-grid { grid-template-columns: 1fr; }
  .zr-table { font-size: .76rem; }
  .zr-table th, .zr-table td { padding: 4px 6px; }
  .zr-select { min-width: 0; width: 100%; }
}
</style>
