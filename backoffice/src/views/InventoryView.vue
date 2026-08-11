<template>
  <div>
    <div class="table-toolbar">
      <h3>Inventory</h3>
      <div style="display:flex;gap:10px">
        <input v-model="search" placeholder="Search..." class="input input-sm" />
        <button class="btn btn-secondary" @click="showForm=true;editing=null;form={}">+ Add Item</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ items.length }}</div><div class="lbl">Total Items</div></div>
      <div class="summary-card"><div class="num">{{ lowItems.length }}</div><div class="lbl">Low Stock</div></div>
      <div class="summary-card"><div class="num">{{ outItems.length }}</div><div class="lbl">Out of Stock</div></div>
    </div>

    <div class="table-wrap">
      <base-table
        :columns="columns"
        :rows="filtered"
        sticky-first
        caption="Stock items and their levels"
        empty-title="No items found"
        empty-hint="Raw materials appear here once they are added."
      >
        <template #cell-quantity="{ row }">
          <span style="font-weight:600;font-family:var(--font-mono)">{{ qty(row) }}</span>
        </template>
        <template #cell-minLevel="{ row }">{{ row.minLevel ?? row.min_level ?? '—' }}</template>
        <template #cell-costPerUnit="{ row }">
          <!-- toFixed(0) hid the decimals: ETB 12.50 displayed as 13, and a
               cost that is wrong by half a birr is wrong on every portion. -->
          <span style="font-family:var(--font-mono)">{{ unitCost(row) }}</span>
        </template>
        <template #cell-status="{ row }">
          <span class="badge" :class="stockClass(row)">{{ stockLabel(row) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button class="btn btn-sm btn-ghost" @click="editItem(row)">Edit</button>
          <base-button text="Delete" variant="btn-ghost" extra-class="btn-sm" :on-click="() => deleteItem(row.id)" />
        </template>
      </base-table>
    </div>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit Item' : 'Add Item' }}</h3>
        <form @submit.prevent="saveItem">
          <div class="form-row">
            <div class="form-group"><label>Name</label><input v-model="form.name" required /></div>
            <div class="form-group"><label>Category</label><select v-model="form.category" class="select"><option>Produce</option><option>Dairy</option><option>Meat</option><option>Beverage</option><option>Dry Goods</option><option>Cleaning</option><option>Other</option></select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Quantity</label><input type="number" v-model.number="form.quantity" min="0" required /></div>
            <div class="form-group"><label>Unit</label><select v-model="form.unit" class="select"><option>kg</option><option>g</option><option>L</option><option>mL</option><option>pcs</option><option>boxes</option><option>bags</option></select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Min Level</label><input type="number" v-model.number="form.minLevel" min="0" /></div>
            <div class="form-group"><label>Cost/Unit (ETB)</label><input type="number" v-model.number="form.costPerUnit" min="0" /></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showForm=false">Cancel</button>
            <button type="submit" class="btn btn-primary" :class="{'btn-loading': btnState.isBusy(), 'btn-success-state': btnState.isSuccess(), 'btn-error-state': btnState.isError()}" :disabled="btnState.isBusy()" :aria-busy="btnState.isBusy() ? 'true' : undefined">
              <span v-if="btnState.isBusy()" class="btn-spinner" aria-hidden="true"></span>
              <span v-else-if="btnState.isSuccess()" class="btn-check" aria-hidden="true">✓</span>
              <span v-else-if="btnState.isError()" class="btn-error-icon" aria-hidden="true">!</span>
              {{ btnState.isBusy() ? 'Saving...' : btnState.isSuccess() ? 'Saved ✓' : btnState.isError() ? 'Try Again' : (editing ? 'Update' : 'Save') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import BaseTable from '../components/BaseTable.vue'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const confirmDelete = inject('confirm')
const btnState = useButtonState({ successDuration: 2000 })
const items = ref([])
const search = ref('')
const showForm = ref(false)
const editing = ref(null)
const form = ref({ name: '', category: 'Produce', quantity: 0, unit: 'kg', minLevel: 0, costPerUnit: 0 })

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unit', label: 'Unit' },
  { key: 'minLevel', label: 'Min Level' },
  { key: 'costPerUnit', label: 'Cost/Unit' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions' },
]

// The API returns snake_case and `stock`; the view read only camelCase and
// `quantity`, so these cells were blank against real data.
function qty(r) { return Number(r.quantity ?? r.stock ?? 0) }
function minOf(r) { return Number(r.minLevel ?? r.min_level ?? 0) }
function unitCost(r) {
  const c = Number(r.costPerUnit ?? r.avg_cost ?? r.cost ?? 0)
  // Two places: a half-birr error compounds over every portion sold.
  return c ? c.toFixed(2) : '0.00'
}
function stockClass(r) {
  if (qty(r) <= 0) return 'badge-cancelled'
  return qty(r) <= minOf(r) ? 'badge-low' : 'badge-success'
}
function stockLabel(r) {
  if (qty(r) <= 0) return 'Out'
  return qty(r) <= minOf(r) ? 'Low' : 'OK'
}


const filtered = computed(() => items.value.filter(i => !search.value || i.name?.toLowerCase().includes(search.value.toLowerCase())))
const lowItems = computed(() => items.value.filter(i => parseInt(i.quantity||0) > 0 && parseInt(i.quantity||0) <= parseInt(i.minLevel||0)))
const outItems = computed(() => items.value.filter(i => parseInt(i.quantity||0) <= 0))

onMounted(loadItems)

async function loadItems() { try { items.value = await apiGet('inventory') } catch (e) { console.error(e) } }

function editItem(item) { editing.value = item; form.value = { ...item }; showForm.value = true }

async function saveItem() {
  btnState.setLoading()
  try {
    if (editing.value) { await apiPut('inventory', { ...form.value, id: editing.value.id }); toast('Item updated') }
    else { await apiPost('inventory', form.value); toast('Item added') }
    showForm.value = false; editing.value = null; form.value = { name: '', category: 'Produce', quantity: 0, unit: 'kg', minLevel: 0, costPerUnit: 0 }
    await loadItems()
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}

async function deleteItem(id) { if (!await confirmDelete('Delete this item?')) return; try { await apiDelete('inventory', id); toast('Deleted'); await loadItems() } catch (e) { toast(e.message, 'error') } }
</script>