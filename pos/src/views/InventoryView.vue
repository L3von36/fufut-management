<template>
  <div>
    <div v-if="lowStockItems.length" class="alert-banner warning">
      ⚠ {{ lowStockItems.length }} item(s) at or below minimum stock level
    </div>
    <div v-else class="alert-banner success">✅ All items are well stocked</div>

    <div class="table-toolbar">
      <h3>Inventory</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="filter" class="select">
          <option value="">All Items</option>
          <option value="low">Low Stock Only</option>
        </select>
        <button v-if="auth.roleKey === 'manager'" class="btn btn-primary" @click="openAdd">+ Add Item</button>
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
                <div v-if="auth.roleKey === 'manager'" style="display:flex;gap:4px">
                  <button class="btn btn-sm btn-outline" @click="quickAdjust(i, 1)">+1</button>
                  <button class="btn btn-sm btn-outline" @click="quickAdjust(i, -1)">−1</button>
                </div>
                <span v-else style="color:var(--text-muted);font-size:.78rem">—</span>
              </td>
              <td data-label="Actions">
                <template v-if="auth.roleKey === 'manager'">
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-ghost" @click="openEdit(i)">Edit</button>
                    <button class="btn btn-sm btn-ghost danger" @click="handleDelete(i)">Delete</button>
                  </div>
                </template>
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
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
import { useFormValidation } from '../composables/useFormValidation'
import { useAuthStore } from '../stores/auth'

const { toast } = useToast()
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
const showModal = ref(false)
const editing = ref(null)
const form = ref({ name: '', category: '', quantity: 0, minLevel: 0, unit: 'kg', cost: 0 })

const lowStockItems = computed(() => items.value.filter(i => isLow(i)))

const filteredItems = computed(() => {
  if (filter.value === 'low') return lowStockItems.value
  return items.value
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
      await apiPut('inventory/' + editing.value.id, form.value)
      toast('Item updated')
    } else {
      await apiPost('inventory', form.value)
      toast('Item added')
    }
    showModal.value = false
    await loadData()
  } catch (e) { console.error(e); toast('Failed to save', 'error') }
}

async function quickAdjust(item, delta) {
  const newQty = Math.max(0, parseInt(item.quantity||0) + delta)
  try {
    await apiPut('inventory/' + item.id, { ...item, quantity: newQty })
    item.quantity = newQty
    toast(`${delta > 0 ? '+' : ''}${delta} ${item.name}`)
  } catch (e) { console.error(e); toast('Adjust failed', 'error') }
}

async function handleDelete(item) {
  if (!confirm(`Delete ${item.name}?`)) return
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
