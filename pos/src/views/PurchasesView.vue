<template>
  <div>
    <div class="table-toolbar">
      <h3>Purchases</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="filter" class="select">
          <option value="">All purchases</option>
          <option value="unpaid">Not fully paid</option>
        </select>
        <button v-if="canEdit" class="btn btn-primary" @click="openAdd">+ Record Purchase</button>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ purchases.length }}</div><div class="lbl">Purchases</div></div>
      <div class="summary-card"><div class="num">{{ fmt(totalSpend) }}</div><div class="lbl">Total (ETB)</div></div>
      <div class="summary-card">
        <div class="num" style="color:var(--danger)">{{ fmt(totalOwing) }}</div>
        <div class="lbl">Outstanding (ETB)</div>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr><th>Date</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Owing</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in filtered" :key="p.id">
              <td data-label="Date">{{ (p.date || '').slice(0, 10) }}</td>
              <td data-label="Supplier"><strong>{{ p.supplier_name || '—' }}</strong></td>
              <td data-label="Total">ETB {{ fmt(p.total) }}</td>
              <td data-label="Paid">ETB {{ fmt(p.paid) }}</td>
              <td data-label="Owing">ETB {{ fmt(p.total - p.paid) }}</td>
              <td data-label="Status">
                <span class="badge" :class="p.total - p.paid > 0.5 ? 'badge-low' : 'badge-ok'">
                  {{ p.total - p.paid > 0.5 ? 'Owing' : 'Settled' }}
                </span>
              </td>
              <td data-label="Actions">
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <button class="btn btn-sm btn-ghost" @click="openDetail(p)">Lines</button>
                  <button class="btn btn-sm btn-ghost" @click="printPurchase(p)" title="Print purchase record">🖨</button>
                  <button v-if="canEdit && p.total - p.paid > 0.5" class="btn btn-sm btn-ghost" @click="openPay(p)">Pay</button>
                </div>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No purchases recorded</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filtered.length }} purchase(s)</span></div>
    </div>

    <!-- ─── Record a purchase ─── -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal modal-lg">
        <h3>Record Purchase</h3>
        <p class="modal-sub">Received stock is added to inventory through the ledger.</p>

        <div class="form-row">
          <div class="form-group">
            <label>Supplier</label>
            <select v-model="form.supplierId" class="select">
              <option value="">Not recorded</option>
              <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="form-group"><label>Date</label><input v-model="form.date" type="date" /></div>
        </div>

        <h4 style="margin:16px 0 8px;font-size:.9rem">Items received</h4>
        <div class="line-list">
          <div v-for="(line, i) in form.items" :key="i" class="purchase-line">
            <select v-model="line.inventoryId" class="select pl-item" @change="onItemChange(line)">
              <option value="">Choose item…</option>
              <option v-for="inv in inventory" :key="inv.id" :value="inv.id">{{ inv.name }} ({{ inv.unit }})</option>
            </select>
            <input v-model.number="line.qty" type="number" step="any" min="0" class="pl-qty" placeholder="Qty" />
            <input v-model="line.unit" class="pl-unit" placeholder="Unit" />
            <input v-model.number="line.totalCost" type="number" step="any" min="0" class="pl-cost" placeholder="Line cost" />
            <button class="btn btn-sm btn-ghost danger" @click="form.items.splice(i, 1)">×</button>
          </div>
        </div>
        <button class="btn btn-sm btn-outline" @click="addLine" style="margin-top:8px">+ Add Item</button>

        <div class="form-row" style="margin-top:16px">
          <div class="form-group">
            <label>Total (ETB)</label>
            <input v-model.number="form.total" type="number" step="any" min="0" />
            <span class="field-hint">Defaults to the sum of the lines.</span>
          </div>
          <div class="form-group">
            <label>Paid now (ETB)</label>
            <input v-model.number="form.paid" type="number" step="any" min="0" />
            <span class="field-hint">Leave at 0 if buying on account.</span>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Payment Method</label>
            <select v-model="form.paymentMethod" class="select">
              <option value="">—</option>
              <option value="cash">Cash</option>
              <option value="telebirr">Telebirr</option>
              <option value="cbe">CBE</option>
              <option value="bank">Bank transfer</option>
            </select>
          </div>
          <div class="form-group"><label>Notes</label><input v-model="form.notes" /></div>
        </div>

        <!--
          The §41 preview: what this delivery is worth in servings before it is
          committed. Every figure is theoretical and says so.
        -->
        <div v-if="analysis" class="analysis-box">
          <h4>{{ analysis.item.name }} — projection</h4>
          <div><span>Cost per {{ analysis.item.unit }}</span><strong>ETB {{ fmt(analysis.analysis.costPerUnit) }}</strong></div>
          <div><span>Theoretical servings</span><strong>≈ {{ analysis.analysis.theoreticalServings ?? '—' }}</strong></div>
          <div v-if="analysis.analysis.ingredientCostPerServing != null">
            <span>Ingredient cost per serving</span><strong>ETB {{ fmt(analysis.analysis.ingredientCostPerServing) }}</strong>
          </div>
          <div v-if="analysis.analysis.potentialRevenue != null">
            <span>Potential revenue</span><strong>ETB {{ fmt(analysis.analysis.potentialRevenue) }}</strong>
          </div>
          <p class="cost-note">{{ analysis.analysis.disclaimer }}</p>
        </div>
        <div v-else-if="analysisNote" class="cost-note" style="margin-top:12px">{{ analysisNote }}</div>

        <div v-if="problems.length" class="alert-banner warning" style="margin-top:12px">
          <div v-for="(p, i) in problems" :key="i">{{ p }}</div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button class="btn btn-outline" @click="analyse" :disabled="!firstLineReady">Preview</button>
          <button class="btn btn-primary" @click="save">Record &amp; Receive</button>
        </div>
      </div>
    </div>

    <!-- ─── Lines ─── -->
    <div class="modal-overlay" v-if="detail" @click.self="detail=null">
      <div class="modal">
        <h3>Purchase {{ detail.purchase.id }}</h3>
        <p class="modal-sub">{{ detail.purchase.supplier_name || 'No supplier recorded' }} · {{ (detail.purchase.date||'').slice(0,10) }}</p>
        <table class="mini-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Unit cost</th><th>Line total</th></tr></thead>
          <tbody>
            <tr v-for="l in detail.lines" :key="l.id">
              <td>{{ l.item_name || l.inventory_id }}</td>
              <td>{{ l.qty }} {{ l.unit }}</td>
              <td>ETB {{ fmt(l.unit_cost) }}</td>
              <td>ETB {{ fmt(l.total_cost) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="modal-actions"><button class="btn btn-secondary" @click="detail=null">Close</button></div>
      </div>
    </div>

    <!-- ─── Pay ─── -->
    <div class="modal-overlay" v-if="paying" @click.self="paying=null">
      <div class="modal">
        <h3>Pay supplier</h3>
        <p class="modal-sub">{{ paying.supplier_name }} — ETB {{ fmt(paying.total - paying.paid) }} outstanding.</p>
        <div class="form-group">
          <label>Amount (ETB)</label>
          <input v-model.number="payAmount" type="number" step="any" min="0" />
        </div>
        <div class="form-group">
          <label>Method</label>
          <select v-model="payMethod" class="select">
            <option value="cash">Cash</option>
            <option value="telebirr">Telebirr</option>
            <option value="cbe">CBE</option>
            <option value="bank">Bank transfer</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="paying=null">Cancel</button>
          <button class="btn btn-primary" @click="pay">Record Payment</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost } from '../api'
import { useAuthStore } from '../stores/auth'
import { printReport } from '../lib/print'

const toast = inject('toast')
const auth = useAuthStore()

// Recording a purchase commits money and moves stock, so it stays with the
// manager. The head chef reads it — they need to see what arrived at what
// price — which matches the server matrix.
const canEdit = computed(() => auth.roleKey === 'manager')

const purchases = ref([])
const suppliers = ref([])
const inventory = ref([])
const filter = ref('')
const showModal = ref(false)
const detail = ref(null)
const paying = ref(null)
const payAmount = ref(0)
const payMethod = ref('cash')
const analysis = ref(null)
const analysisNote = ref('')
const problems = ref([])

const form = ref(blank())

function blank() {
  return {
    supplierId: '', date: new Date().toISOString().slice(0, 10),
    items: [], total: 0, paid: 0, paymentMethod: '', notes: '',
  }
}
function fmt(n) { return (Number(n) || 0).toFixed(0) }

const filtered = computed(() =>
  filter.value === 'unpaid'
    ? purchases.value.filter(p => Number(p.total) - Number(p.paid) > 0.5)
    : purchases.value
)
const totalSpend = computed(() => purchases.value.reduce((s, p) => s + Number(p.total || 0), 0))
const totalOwing = computed(() =>
  purchases.value.reduce((s, p) => s + Math.max(0, Number(p.total || 0) - Number(p.paid || 0)), 0)
)
const firstLineReady = computed(() => {
  const l = form.value.items[0]
  return !!(l && l.inventoryId && l.qty > 0 && l.totalCost > 0)
})

onMounted(loadData)

async function loadData() {
  try {
    const [p, s, inv] = await Promise.all([
      apiGet('purchases'),
      apiGet('suppliers').catch(() => []),
      apiGet('inventory'),
    ])
    purchases.value = Array.isArray(p) ? p : []
    suppliers.value = Array.isArray(s) ? s : []
    inventory.value = Array.isArray(inv) ? inv : []
  } catch (e) { console.error(e); toast('Could not load purchases', 'error') }
}

function openAdd() {
  form.value = blank()
  form.value.items = [emptyLine()]
  analysis.value = null
  analysisNote.value = ''
  problems.value = []
  showModal.value = true
}

function emptyLine() { return { inventoryId: '', qty: null, unit: '', totalCost: null } }
function addLine() { form.value.items.push(emptyLine()) }

/**
 * Default the unit to how the item is stocked. Buying in a different unit is
 * allowed — a sack of sugar bought by the kg, stocked in kg — but the common
 * case is the same unit, and pre-filling it removes the most likely way to get
 * a conversion refused at save time.
 */
function onItemChange(line) {
  const item = inventory.value.find(i => String(i.id) === String(line.inventoryId))
  if (item && !line.unit) line.unit = item.unit
}

async function analyse() {
  const l = form.value.items[0]
  analysis.value = null
  analysisNote.value = ''
  try {
    const res = await apiPost('purchases/analyse', {
      inventoryId: l.inventoryId, qty: l.qty, unit: l.unit, totalCost: l.totalCost,
    })
    if (res.analysis) analysis.value = res
    else analysisNote.value = res.note || 'No recipe uses this ingredient yet, so servings cannot be projected.'
  } catch (e) { console.error(e); toast(e?.message || 'Could not work that out', 'error') }
}

async function save() {
  problems.value = []
  const items = form.value.items.filter(l => l.inventoryId && Number(l.qty) > 0)
  if (!items.length) { toast('Add at least one item', 'error'); return }

  const lineSum = items.reduce((s, l) => s + Number(l.totalCost || 0), 0)
  try {
    const res = await apiPost('purchases', {
      supplierId: form.value.supplierId || null,
      date: form.value.date,
      items,
      total: Number(form.value.total) || lineSum,
      paid: Number(form.value.paid) || 0,
      paymentMethod: form.value.paymentMethod || null,
      notes: form.value.notes || null,
    })
    // The server checks each line's unit against how the item is stocked, so
    // its complaints are shown in place rather than as one unhelpful toast.
    if (res.problems) { problems.value = res.problems; toast('Purchase is not valid', 'error'); return }
    toast(`Recorded — ${res.lines} line(s), ETB ${fmt(res.total)}`)
    showModal.value = false
    await loadData()
  } catch (e) {
    console.error(e)
    problems.value = [e?.message || 'Could not record the purchase']
    toast(e?.message || 'Could not record', 'error')
  }
}

function openPay(p) {
  paying.value = p
  payAmount.value = Math.round((Number(p.total) - Number(p.paid)) * 100) / 100
  payMethod.value = 'cash'
}

async function pay() {
  try {
    await apiPost(`purchases/${paying.value.id}/pay`, { amount: payAmount.value, method: payMethod.value })
    toast('Payment recorded')
    paying.value = null
    await loadData()
  } catch (e) { console.error(e); toast(e?.message || 'Could not record payment', 'error') }
}

async function openDetail(p) {
  try { detail.value = await apiGet('purchases/' + p.id) }
  catch (e) { console.error(e); toast('Could not load lines', 'error') }
}

/**
 * Purchase record for the file — §53.
 *
 * Fetches the lines rather than printing the summary row: a purchase record
 * that says only "ETB 14,000 to the meat vendor" cannot be checked against
 * their invoice, which is the entire reason it is printed.
 */
async function printPurchase(p) {
  try {
    const full = await apiGet('purchases/' + p.id)
    const ok = printReport({
      title: `Purchase ${p.id}`,
      subtitle: p.supplier_name || 'No supplier recorded',
      summary: [
        ['Date', (p.date || '').slice(0, 10)],
        ['Total', `ETB ${fmt(p.total)}`],
        ['Paid', `ETB ${fmt(p.paid)}`],
        ['Outstanding', `ETB ${fmt(p.total - p.paid)}`],
        ['Payment method', p.payment_method || '—'],
      ],
      headers: ['Item', 'Qty', 'Unit', 'Unit cost', 'Line total'],
      rows: (full.lines || []).map(l => [
        l.item_name || l.inventory_id, l.qty, l.unit,
        `ETB ${fmt(l.unit_cost)}`, `ETB ${fmt(l.total_cost)}`,
      ]),
      footer: p.notes || '',
    })
    if (!ok) toast('Allow pop-ups for this site to print', 'error')
  } catch (e) {
    console.error(e)
    toast(e?.message || 'Could not print', 'error')
  }
}
</script>

<style scoped>
.modal-lg { max-width: 760px; width: 100%; }
.field-hint { display:block; color: var(--text-muted); font-size: .72rem; margin-top: 2px; }
.line-list { display: flex; flex-direction: column; gap: 8px; }
.purchase-line { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.pl-item { flex: 3; min-width: 150px; }
.pl-qty, .pl-unit { flex: 1; min-width: 70px; }
.pl-cost { flex: 1.4; min-width: 90px; }
.analysis-box {
  margin-top: 16px; padding: 12px; border-radius: 8px;
  background: var(--surface-2, rgba(0,0,0,.04));
}
.analysis-box h4 { margin: 0 0 8px; font-size: .85rem; }
.analysis-box > div { display: flex; justify-content: space-between; padding: 3px 0; font-size: .85rem; }
.cost-note { margin: 8px 0 0; font-size: .72rem; color: var(--text-muted); }
.mini-table { width: 100%; font-size: .8rem; }
.mini-table th, .mini-table td { padding: 6px 8px; text-align: left; }
</style>
