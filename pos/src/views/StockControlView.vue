<template>
  <div>
    <div class="table-toolbar">
      <h3>Stock Control</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input type="date" v-model="from" class="input input-sm" style="width:auto" />
        <input type="date" v-model="to" class="input input-sm" style="width:auto" />
        <button class="btn btn-outline" @click="loadTab">Refresh</button>
        <!-- §53: the reorder list gets carried to a supplier, and a variance
             report gets discussed away from the screen. -->
        <!-- Fix #16: SVG printer icon -->
        <button class="btn btn-outline" @click="printTab" title="Print this view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        </button>
      </div>
    </div>

    <div class="tabs">
      <button v-for="t in TABS" :key="t.key" class="tab" :class="{ active: tab === t.key }" @click="select(t.key)">
        {{ t.label }}
      </button>
    </div>

    <!-- ─── Reorder ─── -->
    <div v-if="tab === 'reorder'">
      <div v-if="!reorder.items.length" class="alert-banner success">Nothing needs reordering</div>
      <div v-else class="alert-banner warning">
        {{ reorder.count }} item(s) at or below their reorder point — about ETB {{ fmt(reorder.estimatedTotal) }} to restock
      </div>
      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead><tr><th>Item</th><th>In stock</th><th>Reorder at</th><th>Order</th><th>Est. cost</th><th>Supplier</th><th>Urgency</th></tr></thead>
            <tbody>
              <tr v-for="i in reorder.items" :key="i.inventoryId">
                <td data-label="Item"><strong>{{ i.name }}</strong></td>
                <td data-label="In stock">{{ i.currentStock }} {{ i.unit }}</td>
                <td data-label="Reorder at">{{ i.reorderPoint }} {{ i.unit }}</td>
                <td data-label="Order"><strong>{{ i.suggestedQty }} {{ i.unit }}</strong></td>
                <td data-label="Est. cost">ETB {{ fmt(i.estimatedCost) }}</td>
                <td data-label="Supplier">{{ i.preferredSupplier || '—' }}</td>
                <td data-label="Urgency"><span class="badge" :class="urgencyClass(i.urgency)">{{ i.urgency }}</span></td>
              </tr>
              <tr v-if="!reorder.items.length"><td colspan="7" class="empty">Everything is comfortably stocked</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ─── Variance ─── -->
    <div v-if="tab === 'variance'">
      <!--
        Stated before the table, not after it. A variance is a question about
        portioning, waste, prep loss or a miscount — presenting it as a finding
        about people is exactly what the spec says not to do.
      -->
      <p class="tab-note">{{ variance.note || 'Expected usage comes from recipes and sales; actual comes from the stock ledger.' }}</p>
      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead><tr><th>Item</th><th>Expected</th><th>Actual</th><th>Variance</th><th>%</th><th>Wasted</th><th>Possible reasons</th></tr></thead>
            <tbody>
              <tr v-for="i in variance.items" :key="i.inventoryId">
                <td data-label="Item"><strong>{{ i.name }}</strong></td>
                <td data-label="Expected">{{ i.expected }} {{ i.unit }}</td>
                <td data-label="Actual">{{ i.actual }} {{ i.unit }}</td>
                <td data-label="Variance">
                  <span class="badge" :class="i.direction === 'none' ? 'badge-ok' : 'badge-low'">
                    {{ i.variance > 0 ? '+' : '' }}{{ i.variance }} {{ i.unit }}
                  </span>
                </td>
                <td data-label="%">{{ i.variancePct != null ? i.variancePct + '%' : '—' }}</td>
                <td data-label="Wasted">{{ i.wasted }} {{ i.unit }}</td>
                <td data-label="Possible reasons" class="reasons">{{ i.possibleReasons.join(' · ') || '—' }}</td>
              </tr>
              <tr v-if="!variance.items.length"><td colspan="7" class="empty">No movements in this period</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ─── Forecast ─── -->
    <div v-if="tab === 'forecast'">
      <p class="tab-note">Estimates based on average usage. Items without enough history are not projected.</p>
      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead><tr><th>Item</th><th>In stock</th><th>Daily usage</th><th>Days left</th><th>Runs out</th><th>Confidence</th></tr></thead>
            <tbody>
              <tr v-for="i in forecast.items" :key="i.inventoryId">
                <td data-label="Item"><strong>{{ i.name }}</strong></td>
                <td data-label="In stock">{{ i.stock }} {{ i.unit }}</td>
                <td data-label="Daily usage">{{ i.dailyUsage != null ? i.dailyUsage + ' ' + i.unit : '—' }}</td>
                <td data-label="Days left">
                  <span v-if="i.daysRemaining != null" class="badge" :class="i.daysRemaining <= 3 ? 'badge-low' : 'badge-ok'">
                    {{ i.daysRemaining }}
                  </span>
                  <span v-else style="color:var(--text-muted)">—</span>
                </td>
                <td data-label="Runs out">{{ i.stockoutDate || '—' }}</td>
                <td data-label="Confidence">
                  <span class="badge badge-pending" :title="i.note">{{ i.confidence }}</span>
                </td>
              </tr>
              <tr v-if="!forecast.items.length"><td colspan="6" class="empty">No usage recorded yet</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ─── What can we make ─── -->
    <div v-if="tab === 'capacity'">
      <p class="tab-note">How many servings current stock supports, and what runs out first.</p>
      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead><tr><th>Dish</th><th>Servings possible</th><th>Limited by</th></tr></thead>
            <tbody>
              <tr v-for="i in capacity.items" :key="i.recipeId">
                <td data-label="Dish"><strong>{{ i.name }}</strong></td>
                <td data-label="Servings possible">
                  <span class="badge" :class="capacityClass(i.possible)">{{ i.possible ?? '—' }}</span>
                </td>
                <td data-label="Limited by">{{ i.limiting || '—' }}</td>
              </tr>
              <tr v-if="!capacity.items.length"><td colspan="3" class="empty">No recipes yet — add one to see this</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ─── Stock as of a day ─── -->
    <div v-if="tab === 'snapshot'">
      <!--
        The manager's "how much did we have on the 20th?" question. Figures
        come from the ledger's own running balance where history exists; where
        it does not, they are worked backwards from today and labelled as
        estimates rather than passed off as recordings.
      -->
      <p class="tab-note">
        The shelf as it stood at the end of the chosen day, from the stock ledger.
        “Recorded” figures are the ledger's own running balance; “estimated” ones
        are worked backwards from today where the ledger has no earlier history.
      </p>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <label style="font-size:.8rem;color:var(--text-muted)">As of</label>
        <input type="date" v-model="snapDate" class="input input-sm" style="width:auto" />
        <button class="btn btn-outline btn-sm" @click="loadTab">Show</button>
      </div>
      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead><tr><th>Item</th><th>Stock at end of {{ snapDate }}</th><th>Basis</th><th>Stock now</th><th>Bought</th><th>Consumed</th><th>Wasted</th><th>Adjusted</th></tr></thead>
            <tbody>
              <tr v-for="i in snapshot.items" :key="i.inventoryId">
                <td data-label="Item"><strong>{{ i.name }}</strong></td>
                <td data-label="Stock at end of day"><strong>{{ i.stockAtDate }} {{ i.unit }}</strong></td>
                <td data-label="Basis">
                  <span class="badge" :class="i.basis === 'ledger' ? 'badge-ok' : 'badge-pending'">
                    {{ i.basis === 'ledger' ? 'recorded' : 'estimated' }}
                  </span>
                </td>
                <td data-label="Stock now">{{ i.stockNow }} {{ i.unit }}</td>
                <td data-label="Bought">{{ i.day.purchased || '—' }}</td>
                <td data-label="Consumed">{{ i.day.sold || '—' }}</td>
                <td data-label="Wasted">{{ i.day.wasted || '—' }}</td>
                <td data-label="Adjusted">{{ i.day.adjusted || '—' }}</td>
              </tr>
              <tr v-if="!snapshot.items.length"><td colspan="8" class="empty">Nothing to show for that day</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ─── Stock count ─── -->
    <div v-if="tab === 'count'">
      <p class="tab-note">
        Enter what is physically on the shelf. The difference from the system figure is recorded as an
        adjustment with a reason — the number is never simply overwritten.
      </p>
      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead><tr><th>Item</th><th>System says</th><th>Counted</th><th>Variance</th><th>Reason</th></tr></thead>
            <tbody>
              <tr v-for="row in countRows" :key="row.inventoryId">
                <td data-label="Item"><strong>{{ row.name }}</strong></td>
                <td data-label="System says">{{ row.system }} {{ row.unit }}</td>
                <td data-label="Counted">
                  <input v-model.number="row.counted" type="number" step="any" class="count-input" :placeholder="String(row.system)" />
                </td>
                <td data-label="Variance">
                  <span v-if="row.counted !== null && row.counted !== ''" class="badge" :class="varianceOf(row) === 0 ? 'badge-ok' : 'badge-low'">
                    {{ varianceOf(row) > 0 ? '+' : '' }}{{ varianceOf(row).toFixed(2) }}
                  </span>
                  <span v-else style="color:var(--text-muted)">—</span>
                </td>
                <td data-label="Reason">
                  <select v-model="row.reason" class="select select-sm">
                    <option v-for="r in COUNT_REASONS" :key="r" :value="r">{{ r }}</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">
        <span style="align-self:center;color:var(--text-muted);font-size:.8rem">
          {{ countedCount }} of {{ countRows.length }} entered
        </span>
        <button class="btn btn-primary" :disabled="!countedCount" @click="postCount">Post Count</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, TODAY } from '../api'
import { printReport } from '../lib/print'

const toast = inject('toast')

const TABS = [
  { key: 'reorder', label: 'Reorder' },
  { key: 'variance', label: 'Variance' },
  { key: 'snapshot', label: 'As Of' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'capacity', label: 'What Can We Make' },
  { key: 'count', label: 'Stock Count' },
]

/** The explanations a count actually has. "Unknown" is honest and stays. */
const COUNT_REASONS = [
  'Physical stock count', 'Spillage', 'Breakage', 'Spoilage',
  'Miscount corrected', 'Delivery not recorded', 'Unknown',
]

const tab = ref('reorder')
const to = ref(new Date().toISOString().slice(0, 10))
const from = ref(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))

const reorder = ref({ items: [], count: 0, estimatedTotal: 0 })
const variance = ref({ items: [], note: '' })
const forecast = ref({ items: [] })
const capacity = ref({ items: [] })
const countRows = ref([])
const snapshot = ref({ items: [], note: '' })
// Through the api module's TODAY so the day is the cafe's today, consistently
// with every other screen, and testable.
const snapDate = ref(TODAY())

function fmt(n) { return (Number(n) || 0).toFixed(0) }

function urgencyClass(u) {
  return u === 'out-of-stock' ? 'badge-cancelled' : u === 'critical' ? 'badge-low' : 'badge-pending'
}
function capacityClass(n) {
  if (n == null) return 'badge-pending'
  return n < 10 ? 'badge-low' : n < 50 ? 'badge-pending' : 'badge-ok'
}
function varianceOf(row) {
  const c = Number(row.counted)
  if (!Number.isFinite(c)) return 0
  return c - Number(row.system)
}

const countedCount = computed(() =>
  countRows.value.filter(r => r.counted !== null && r.counted !== '' && Number.isFinite(Number(r.counted))).length
)

// The window only applies to the two tabs that look at a period; reorder,
// capacity and the count are all about right now.
const range = computed(() => `from=${from.value}T00:00:00.000Z&to=${to.value}T23:59:59.999Z`)

onMounted(loadTab)

function select(key) { tab.value = key; loadTab() }

async function loadTab() {
  try {
    if (tab.value === 'reorder') reorder.value = await apiGet('inventory/reorder')
    else if (tab.value === 'variance') variance.value = await apiGet(`inventory/variance?${range.value}`)
    else if (tab.value === 'snapshot') snapshot.value = await apiGet(`inventory/snapshot?date=${snapDate.value}`)
    else if (tab.value === 'forecast') forecast.value = await apiGet(`inventory/forecast?${range.value}`)
    else if (tab.value === 'capacity') capacity.value = await apiGet('inventory/capacity')
    else if (tab.value === 'count') await loadCountSheet()
  } catch (e) {
    console.error(e)
    toast(e?.message || 'Could not load that', 'error')
  }
}

async function loadCountSheet() {
  const inv = await apiGet('inventory')
  countRows.value = (Array.isArray(inv) ? inv : []).map(i => ({
    inventoryId: i.id,
    name: i.name,
    unit: i.unit,
    system: Number(i.quantity ?? i.stock ?? 0),
    counted: null,
    reason: 'Physical stock count',
  }))
}

/**
 * Print whichever tab is open.
 *
 * Each tab is a different document — a reorder list is taken to a supplier, a
 * variance report is discussed in a meeting — so the columns are defined per
 * tab rather than dumping whatever the table happens to render.
 */
function printTab() {
  const period = `${from.value} to ${to.value}`
  let spec

  if (tab.value === 'reorder') {
    spec = {
      title: 'Reorder list',
      summary: [['Items below reorder point', reorder.value.count || 0],
                ['Estimated cost', `ETB ${fmt(reorder.value.estimatedTotal)}`]],
      headers: ['Item', 'In stock', 'Reorder at', 'Order', 'Est. cost', 'Supplier'],
      rows: reorder.value.items.map(i => [
        i.name, `${i.currentStock} ${i.unit}`, `${i.reorderPoint} ${i.unit}`,
        `${i.suggestedQty} ${i.unit}`, `ETB ${fmt(i.estimatedCost)}`, i.preferredSupplier || '—',
      ]),
    }
  } else if (tab.value === 'variance') {
    spec = {
      title: 'Stock variance',
      subtitle: period,
      headers: ['Item', 'Expected', 'Actual', 'Variance', '%', 'Wasted'],
      rows: variance.value.items.map(i => [
        i.name, `${i.expected} ${i.unit}`, `${i.actual} ${i.unit}`,
        `${i.variance} ${i.unit}`, i.variancePct != null ? `${i.variancePct}%` : '—',
        `${i.wasted} ${i.unit}`,
      ]),
      // Carried onto the paper too: a printed variance sheet outlives the
      // screen that explained what it does and does not mean.
      footer: variance.value.note || 'Variance is a question, not a finding.',
    }
  } else if (tab.value === 'snapshot') {
    spec = {
      title: `Stock as of ${snapDate.value}`,
      subtitle: 'End-of-day figures from the stock ledger',
      headers: ['Item', 'Stock at end of day', 'Basis', 'Stock now', 'Bought', 'Consumed', 'Wasted', 'Adjusted'],
      rows: snapshot.value.items.map((i) => [
        i.name,
        `${i.stockAtDate} ${i.unit}`,
        i.basis === 'ledger' ? 'recorded' : 'estimated',
        `${i.stockNow} ${i.unit}`,
        i.day.purchased, i.day.sold, i.day.wasted, i.day.adjusted,
      ]),
      footer: snapshot.value.note || '',
    }
  } else if (tab.value === 'forecast') {
    spec = {
      title: 'Stock forecast',
      subtitle: period,
      headers: ['Item', 'In stock', 'Daily usage', 'Days left', 'Runs out', 'Confidence'],
      rows: forecast.value.items.map(i => [
        i.name, `${i.stock} ${i.unit}`, i.dailyUsage != null ? `${i.dailyUsage} ${i.unit}` : '—',
        i.daysRemaining ?? '—', i.stockoutDate || '—', i.confidence,
      ]),
      footer: 'Estimates based on average usage. Items without enough history are not projected.',
    }
  } else if (tab.value === 'capacity') {
    spec = {
      title: 'Production capacity',
      headers: ['Dish', 'Servings possible', 'Limited by'],
      rows: capacity.value.items.map(i => [i.name, i.possible ?? '—', i.limiting || '—']),
    }
  } else {
    spec = {
      title: 'Stock count sheet',
      subtitle: 'Enter the physical count against each line',
      headers: ['Item', 'System says', 'Counted', 'Variance'],
      // Blank columns on purpose: this one is printed *before* counting, to be
      // filled in with a pen while walking the store room.
      rows: countRows.value.map(r => [r.name, `${r.system} ${r.unit}`, '', '']),
    }
  }

  if (!printReport(spec)) toast('Allow pop-ups for this site to print', 'error')
}

async function postCount() {
  // Only rows somebody actually counted. Treating a blank as zero would write
  // off the entire store room.
  const items = countRows.value
    .filter(r => r.counted !== null && r.counted !== '' && Number.isFinite(Number(r.counted)))
    .map(r => ({ inventoryId: r.inventoryId, countedQty: Number(r.counted), reason: r.reason }))

  if (!items.length) { toast('Enter at least one count', 'error'); return }

  try {
    const res = await apiPost('inventory/count', { items, notes: 'Counted from the POS' })
    const moved = (res.items || []).filter(i => Math.abs(Number(i.variance)) > 0.001).length
    toast(`Count posted — ${res.items.length} item(s), ${moved} adjustment(s)`)
    await loadCountSheet()
  } catch (e) {
    console.error(e)
    toast(e?.message || 'Could not post the count', 'error')
  }
}
</script>

<style scoped>
.tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 14px; }
.tab {
  padding: 7px 14px; border-radius: 8px; border: 1px solid var(--border, #ddd);
  background: transparent; cursor: pointer; font-size: .82rem; color: var(--text-muted);
  min-height: 38px;
}
.tab.active { background: var(--primary); color: #fff; border-color: var(--primary); font-weight: 600; }
.tab-note { font-size: .78rem; color: var(--text-muted); margin: 0 0 12px; }
.empty { text-align: center; padding: 40px; color: var(--text-muted); }
.reasons { font-size: .72rem; color: var(--text-muted); max-width: 260px; }
/* Fix #15: Larger stock count input */
.count-input { width: 120px; min-height: 44px; padding: 8px 10px; font-size: .88rem; }
</style>
