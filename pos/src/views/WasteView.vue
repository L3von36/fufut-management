<template>
  <div>
    <div class="table-toolbar">
      <h3>Waste Log</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="filter" class="select"><option value="">All</option><option value="Food">Food</option><option value="Beverage">Beverage</option><option value="Packaging">Packaging</option><option value="Other">Other</option></select>
        <button class="btn btn-primary" @click="openAdd">+ Log Waste</button>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>
    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ wasteItems.length }}</div><div class="lbl">Entries</div></div>
      <div class="summary-card"><div class="num" style="color:var(--danger)">{{ totalWasteCost.toFixed(0) }}</div><div class="lbl">Total Cost (ETB)</div></div>
      <!-- Fix #10: Category breakdown -->
      <div v-for="cat in categoryBreakdown" :key="cat.name" class="summary-card">
        <div class="num" style="color:var(--warning);font-size:1rem">{{ cat.total.toFixed(0) }}</div>
        <div class="lbl">{{ cat.name }}</div>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Reason</th><th>Cost</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="w in filteredWaste" :key="w.id">
              <td data-label="Item"><strong>{{ w.item||w.name }}</strong></td>
              <td data-label="Category">{{ w.category||'—' }}</td>
              <td data-label="Qty">{{ w.quantity||'-' }}</td>
              <td data-label="Reason">{{ w.reason||'—' }}</td>
              <td data-label="Cost">ETB {{ parseFloat(w.cost||0).toFixed(0) }}</td>
              <td data-label="Date">{{ w.date||'—' }}</td>
              <td data-label="Actions"><button v-if="auth.roleKey === 'manager'" class="btn btn-sm btn-ghost danger" @click="handleDelete(w)">Delete</button></td>
            </tr>
            <tr v-if="!filteredWaste.length"><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No waste logged</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredWaste.length }} entry(ies)</span></div>
    </div>
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>Log Waste</h3>
        <p class="modal-sub">Record discarded items</p>
        <!--
          Picking a stock item is what makes the waste real: it deducts through
          the ledger, so binned food stops counting as though it were still on
          the shelf. Free text is kept for anything not tracked as inventory —
          a plated dish returned by a guest — and those still log without moving
          stock, as they always did.
        -->
        <div class="form-group">
          <label>Stock Item</label>
          <select v-model="form.inventoryId" class="select" @change="onItemPicked">
            <option value="">Not a tracked stock item</option>
            <option v-for="i in inventory" :key="i.id" :value="i.id">{{ i.name }} ({{ i.unit }})</option>
          </select>
          <span class="field-hint">
            {{ form.inventoryId ? 'This will be deducted from stock.' : 'Logged only — stock will not change.' }}
          </span>
        </div>
        <div class="form-group" v-if="!form.inventoryId"><label>Item</label><input v-model="form.name" :class="{ 'input-error': vErrors.name }" /><span v-if="vErrors.name" class="field-error">{{ vErrors.name }}</span></div>
        <div class="form-row">
          <div class="form-group"><label>Category</label><select v-model="form.category" class="select"><option value="">Select...</option><option value="Food">Food</option><option value="Beverage">Beverage</option><option value="Packaging">Packaging</option><option value="Other">Other</option></select></div>
          <div class="form-group"><label>Qty {{ selectedUnit ? '(' + selectedUnit + ')' : '' }}</label><input v-model.number="form.quantity" type="number" step="any" @input="onQtyChanged" :class="{ 'input-error': vErrors.quantity }" /><span v-if="vErrors.quantity" class="field-error">{{ vErrors.quantity }}</span></div>
        </div>
        <div class="form-group"><label>Reason</label><select v-model="form.reason" class="select" :class="{ 'input-error': vErrors.reason }"><option value="">Select...</option><option value="spoiled">Spoiled</option><option value="overproduction">Overproduction</option><option value="quality">Quality</option><option value="damaged">Damaged</option><option value="other">Other</option></select><span v-if="vErrors.reason" class="field-error">{{ vErrors.reason }}</span></div>
        <div class="form-row">
          <div class="form-group"><label>Cost (ETB)</label><input v-model.number="form.cost" type="number" step="0.01" /></div>
          <div class="form-group"><label>Date</label><input v-model="form.date" type="date" /></div>
        </div>
        <div class="modal-actions"><button class="btn btn-secondary" @click="showModal=false">Cancel</button><button class="btn btn-primary" @click="saveItem">Log</button></div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted , inject} from 'vue'
import { apiGet, apiPost, apiDelete } from '../api'
import { useFormValidation } from '../composables/useFormValidation'
import { useAuthStore } from '../stores/auth'
const toast = inject('toast')
const confirmDelete = inject('confirm')
const auth = useAuthStore()
const schema = {
  name: { required: true, label: 'Item', max: 100 },
  // The API refuses a waste entry with no reason — tracked or free-text —
  // because "why" is the only actionable fact in the log.
  reason: { required: true, label: 'Reason', max: 200 },
  quantity: { label: 'Qty', min: 0.01 }
}
const { errors: vErrors, validate } = useFormValidation(schema)
const wasteItems = ref([]); const filter = ref(''); const showModal = ref(false)
const inventory = ref([])
const form = ref(blankForm())
const filteredWaste = computed(()=>!filter.value?wasteItems.value:wasteItems.value.filter(w=>w.category===filter.value))
const totalWasteCost = computed(()=>wasteItems.value.reduce((s,w)=>s+parseFloat(w.cost||w.est_cost||0),0))
// Fix #10: Category breakdown
const categoryBreakdown = computed(() => {
  const m = {}
  for (const w of filteredWaste.value) {
    const cat = w.category || 'Other'
    m[cat] = (m[cat] || 0) + parseFloat(w.cost || w.est_cost || 0)
  }
  return Object.entries(m)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
})

const selectedItem = computed(() => inventory.value.find(i => String(i.id) === String(form.value.inventoryId)))
const selectedUnit = computed(() => selectedItem.value?.unit || '')

function blankForm() {
  return { inventoryId:'', name:'', category:'', quantity:1, reason:'', cost:0, date:new Date().toISOString().slice(0,10) }
}

onMounted(()=>{ loadData(); loadInventory() })
async function loadData() { try { wasteItems.value = await apiGet('waste') } catch (e) { console.error(e) } }
async function loadInventory() {
  // A cleaner can log waste but has no inventory access, so an empty list here
  // is expected rather than an error — the free-text path still works for them.
  try { inventory.value = await apiGet('inventory') } catch { inventory.value = [] }
}

/** Prefill from the stock record so the cost estimate is not guessed. */
function onItemPicked() {
  const item = selectedItem.value
  if (!item) return
  form.value.name = item.name
  if (item.category) form.value.category = form.value.category || item.category
  recalcCost()
}

// Fix #9: Recalculate cost when quantity changes (if inventory item selected)
function onQtyChanged() {
  if (form.value.inventoryId) recalcCost()
}
function recalcCost() {
  const item = selectedItem.value
  if (!item) return
  const unitCost = Number(item.avg_cost ?? item.cost ?? 0)
  form.value.cost = Math.round(unitCost * Number(form.value.quantity || 0) * 100) / 100
}

function openAdd() { form.value = blankForm(); showModal.value=true }

async function saveItem() {
  if (!validate(form.value)) { toast('Please fix the errors', 'error'); return }
  try {
    const res = await apiPost('waste', form.value)
    toast(res.stock !== undefined
      ? `Logged — ${form.value.name} now ${res.stock} ${res.unit || ''}`.trim()
      : 'Logged')
    showModal.value=false
    await loadData()
    if (form.value.inventoryId) await loadInventory()
  } catch (e) { console.error(e); toast(e?.message || 'Failed','error') }
}
async function handleDelete(w) { if(!await confirmDelete('Delete?'))return; try { await apiDelete('waste/'+w.id); toast('Deleted'); await loadData() } catch (e) { console.error(e); toast('Failed','error') } }
</script>
<style scoped>
.input-error { border-color: var(--danger, #e74c3c) !important; }
.field-error { display: block; color: var(--danger, #e74c3c); font-size: 0.75rem; margin-top: 2px; }
.field-hint { display: block; color: var(--text-muted); font-size: 0.72rem; margin-top: 2px; }
</style>
