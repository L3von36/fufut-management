<template>
  <div>
    <div v-if="lowStockItems.length" class="alert-banner warning">
      ⚠ {{ lowStockItems.length }} item(s) at or below minimum stock level
    </div>
    <div v-else class="alert-banner success">✅ All items are well stocked</div>

    <div class="table-toolbar">
      <h3>Inventory</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <!-- Fix #6: Search input -->
        <input v-model="search" type="text" placeholder="Search items..." class="input input-sm" style="max-width:200px" />
        <select v-model="filter" class="select">
          <option value="">All Items</option>
          <option value="low">Low Stock Only</option>
        </select>
        <button v-if="canManageStock" class="btn btn-primary" @click="openAdd">+ Add Item</button>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Unit</th>
              <th>Min Level</th>
              <th>Status</th>
              <th>Adjust</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in filteredItems" :key="i.id">
              <td data-label="Item">{{ i.name }}</td>
              <td data-label="Category">{{ i.category }}</td>
              <td data-label="Stock" :style="{color: isLow(i) ? 'var(--danger)' : 'var(--success)', fontWeight:600}">
                {{ parseInt(i.quantity||0) }} {{ i.unit || '' }}
              </td>
              <td data-label="Unit">{{ i.unit || '—' }}</td>
              <td data-label="Min Level">{{ parseInt(i.minLevel||0) }}</td>
              <td data-label="Status">
                <span class="badge" :class="isLow(i) ? 'badge-low' : 'badge-ok'">{{ isLow(i) ? 'Low Stock' : 'In Stock' }}</span>
              </td>
              <td data-label="Adjust">
                <div v-if="canManageStock" style="display:flex;gap:4px">
                  <button class="btn btn-sm btn-outline" @click="quickAdjust(i, 1)">+1</button>
                  <button class="btn btn-sm btn-outline" @click="quickAdjust(i, -1)">−1</button>
                </div>
                <span v-else style="color:var(--text-muted);font-size:.78rem">—</span>
              </td>
              <td data-label="Actions">
                <div style="display:flex;gap:4px" v-if="canManageStock || canDeleteStock">
                  <button v-if="canManageStock" class="btn btn-sm btn-ghost" @click="openEdit(i)">Edit</button>
                  <!-- Deleting removes the item from the catalogue entirely, which
                       is a different act from recording what was used. Kept with
                       the manager even though the chef owns the stock itself. -->
                  <button v-if="canDeleteStock" class="btn btn-sm btn-ghost danger" @click="handleDelete(i)">Delete</button>
                </div>
                <span v-else style="color:var(--text-muted);font-size:.78rem">View only</span>
              </td>
            </tr>
            <tr v-if="!filteredItems.length">
              <td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">No inventory items</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredItems.length }} item(s)</span></div>
    </div>

    <!-- Add/Edit Modal -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit' : 'Add' }} Inventory Item</h3>
        <p class="modal-sub">{{ editing ? 'Update stock item details' : 'Add a new stock item' }}</p>
        <div class="form-group">
          <label>Item Name</label>
          <input v-model="form.name" placeholder="e.g. Espresso Beans" :class="{ 'input-error': vErrors.name }" />
          <span v-if="vErrors.name" class="field-error">{{ vErrors.name }}</span>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Category</label>
            <select v-model="form.category" class="select" :class="{ 'input-error': vErrors.category }">
              <option value="">Select...</option>
              <option value="Coffee">Coffee</option>
              <option value="Dairy">Dairy</option>
              <option value="Syrups">Syrups</option>
              <option value="Pastry">Pastry</option>
              <option value="Packaging">Packaging</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Other">Other</option>
            </select>
            <span v-if="vErrors.category" class="field-error">{{ vErrors.category }}</span>
          </div>
          <div class="form-group">
            <label>Unit</label>
            <select v-model="form.unit" class="select">
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="L">L</option>
              <option value="mL">mL</option>
              <option value="pcs">pcs</option>
              <option value="packs">packs</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Stock Quantity</label>
            <input v-model.number="form.quantity" type="number" placeholder="0" :class="{ 'input-error': vErrors.quantity }" />
            <span v-if="vErrors.quantity" class="field-error">{{ vErrors.quantity }}</span>
          </div>
          <div class="form-group">
            <label>Minimum Level</label>
            <input v-model.number="form.minLevel" type="number" placeholder="0" />
          </div>
        </div>
        <div class="form-group">
          <label>Cost per Unit (ETB)</label>
          <input v-model.number="form.cost" type="number" step="0.01" placeholder="0" :class="{ 'input-error': vErrors.cost }" />
          <span v-if="vErrors.cost" class="field-error">{{ vErrors.cost }}</span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button class="btn btn-primary" @click="saveItem">{{ editing ? 'Update' : 'Add Item' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted , inject} from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { useFormValidation } from '../composables/useFormValidation'
import { useAuthStore } from '../stores/auth'

const toast = inject('toast')
const confirmDelete = inject('confirm')
const auth = useAuthStore()
const schema = {
  name: { required: true, label: 'Item Name', max: 100 },
  category: { required: true, label: 'Category' },
  quantity: { label: 'Stock Quantity', min: 0 },
  cost: { label: 'Cost per Unit', min: 0 }
}
const { errors: vErrors, validate } = useFormValidation(schema)
const items = ref([])
const filter = ref('')
const search = ref('')
const showModal = ref(false)
const editing = ref(null)
const form = ref({ name: '', category: '', quantity: 0, minLevel: 0, unit: 'kg', cost: 0 })

/**
 * Stock control is the head chef's job, not an administrative extra: monitoring
 * levels, ordering supplies and managing food cost are the duties the role is
 * defined by. This screen previously gated every action on `manager`, so the
 * person responsible for the stock could see the beans running low and log the
 * waste when they spoiled, but never record what was used or received.
 *
 * The assistant chef is deliberately left read-only. They execute against the
 * stock rather than owning it, and two people adjusting the same counts is how
 * a stock take stops reconciling.
 */
const canManageStock = computed(() => ['manager', 'head-chef'].includes(auth.roleKey))
const canDeleteStock = computed(() => auth.roleKey === 'manager')

const lowStockItems = computed(() => items.value.filter(i => isLow(i)))

const filteredItems = computed(() => {
  let result = filter.value === 'low' ? lowStockItems.value : items.value
  // Fix #6: Text search
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(i => i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q))
  }
  return result
})

function isLow(i) { return parseInt(i.quantity||0) <= parseInt(i.minLevel||0) }

onMounted(loadData)

async function loadData() {
  try { items.value = await apiGet('inventory') } catch (e) { console.error(e) }
}

function openAdd() {
  editing.value = null
  form.value = { name: '', category: '', quantity: 0, minLevel: 0, unit: 'kg', cost: 0 }
  showModal.value = true
}

function openEdit(item) {
  editing.value = item
  form.value = { ...item }
  showModal.value = true
}

async function saveItem() {
  if (!validate(form.value)) { toast('Please fix the errors', 'error'); return }
  try {
    if (editing.value) {
      // The catalogue record and the quantity are two different acts now. The
      // server refuses a quantity inside a PUT, so the edit sends everything
      // except the count, and a changed count becomes its own audited
      // adjustment — which is what makes "why is this 19.8?" answerable later.
      const { quantity, stock, ...catalogue } = form.value
      await apiPut('inventory/' + editing.value.id, catalogue)

      const previous = Number(editing.value.quantity ?? editing.value.stock ?? 0)
      const wanted = Number(quantity)
      if (Number.isFinite(wanted) && Math.abs(wanted - previous) > 1e-9) {
        await apiPost(`inventory/${editing.value.id}/adjust`, {
          newQty: wanted,
          reason: 'Corrected from the inventory screen',
        })
      }
      toast('Item updated')
    } else {
      await apiPost('inventory', form.value)
      toast('Item added')
    }
    showModal.value = false
    await loadData()
  } catch (e) { console.error(e); toast(e?.message || 'Failed to save', 'error') }
}

/**
 * Stock changes go through the ledger, never by writing a new quantity.
 *
 * This used to PUT the whole item with `quantity` set to the new figure, which
 * overwrote the previous value and left no record of who changed it or why. The
 * server now refuses a direct write to `stock` and takes the change as a signed
 * movement instead, so the ± buttons post a delta and a reason.
 *
 * The reason is fixed for these buttons because they exist for one purpose —
 * correcting a count at the shelf. Anything needing an explanation of its own
 * (spoilage, breakage) belongs in Waste or in a full stock count.
 */
async function quickAdjust(item, delta) {
  try {
    const res = await apiPost(`inventory/${item.id}/adjust`, {
      qty: delta,
      reason: 'Quick adjustment from the inventory screen',
    })
    // Trust the server's balance rather than recomputing locally: it is the
    // ledger total, and it accounts for anything else posted since this screen
    // loaded.
    item.quantity = res.stock
    item.stock = res.stock
    toast(`${delta > 0 ? '+' : ''}${delta} ${item.name} — now ${res.stock} ${res.unit || ''}`.trim())
  } catch (e) {
    console.error(e)
    toast(e?.message || 'Adjust failed', 'error')
  }
}

async function handleDelete(item) {
  if (!await confirmDelete(`Delete ${item.name}?`)) return
  try {
    await apiDelete('inventory/' + item.id)
    toast('Item deleted')
    await loadData()
  } catch (e) { console.error(e); toast('Delete failed', 'error') }
}
</script>
<style scoped>
.input-error { border-color: var(--danger, #e74c3c) !important; }
.field-error { display: block; color: var(--danger, #e74c3c); font-size: 0.75rem; margin-top: 2px; }
</style>
