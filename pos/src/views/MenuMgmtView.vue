<template>
  <div>
    <div class="table-toolbar">
      <h3>Menu Management</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="filter" class="select">
          <option value="">All Categories</option>
          <option value="Espresso">Espresso</option>
          <option value="Filter">Filter</option>
          <option value="Cold">Cold</option>
          <option value="Blended">Blended</option>
          <option value="Food">Food</option>
          <option value="Drinks">Drinks</option>
        </select>
        <button v-if="isManager" class="btn btn-primary" @click="openAdd">+ Add Item</button>
        <base-button text="Refresh" variant="btn-outline" :on-click="loadData" />
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <!-- Cost and margin are commercial figures, shown to the manager
                 only. A chef is here to take a dish off, not to see the markup. -->
            <tr><th></th><th>Name</th><th>Category</th><th>Price</th><th v-if="isManager">Cost</th><th v-if="isManager">Margin</th><th>Modifiers</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <tr v-for="i in filteredItems" :key="i.id">
              <td style="width:48px;padding:4px 8px"><img :src="i.image || getPlaceholder(i)" :alt="i.name" style="width:36px;height:36px;border-radius:6px;object-fit:cover" loading="lazy" /></td>
              <td data-label="Name"><strong>{{ i.name }}</strong></td>
              <td data-label="Category">{{ i.category }}</td>
              <td data-label="Price">ETB {{ parseFloat(i.price||0).toFixed(0) }}</td>
              <td v-if="isManager" data-label="Cost">ETB {{ parseFloat(i.cost||0).toFixed(0) }}</td>
              <td v-if="isManager" data-label="Margin"><span class="badge" :class="marginClass(i)">{{ marginPercent(i) }}%</span></td>
              <td data-label="Modifiers">{{ i.modifiers || '—' }}</td>
              <td data-label="Status">
                <span class="badge" :class="i.available !== false ? 'badge-ok' : 'badge-danger'">{{ i.available !== false ? 'Available' : 'Unavailable' }}</span>
                <!-- Two people can change this - a chef takes a dish off, a
                     manager may put it back - so say who last did. -->
                <div v-if="i.availabilityChangedBy" class="mm-changed">
                  by {{ i.availabilityChangedBy }}{{ i.availabilityChangedAt ? ' · ' + shortTime(i.availabilityChangedAt) : '' }}
                </div>
              </td>
              <td data-label="Actions">
                <div style="display:flex;gap:4px">
                  <!-- Running out is a kitchen fact, so this is the one menu
                       action a chef owns. It sends only the availability flag. -->
                  <button
                    v-if="canToggleAvailability"
                    class="btn btn-sm"
                    :class="i.available !== false ? 'btn-outline' : 'btn-success'"
                    :disabled="togglingId === i.id"
                    @click="toggleAvailability(i)"
                  >{{ togglingId === i.id ? '…' : (i.available !== false ? 'Mark 86' : 'Restore') }}</button>
                  <button v-if="isManager" class="btn btn-sm btn-ghost" @click="openEdit(i)">Edit</button>
                  <base-button v-if="isManager" text="Delete" variant="btn-ghost" extra-class="btn-sm" :on-click="() => handleDelete(i)" />
                </div>
              </td>
            </tr>
            <tr v-if="!filteredItems.length"><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">No menu items</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredItems.length }} item(s)</span></div>
    </div>

    <!-- Add/Edit Modal -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal menu-modal">
        <h3>{{ editing ? 'Edit' : 'Add' }} Menu Item</h3>
        <p class="modal-sub">{{ editing ? 'Update menu item details' : 'Add a new menu item' }}</p>
        <div class="menu-form-layout">
          <div class="menu-form-img">
            <img :src="form.image || getPlaceholder(form)" alt="" />
            <button type="button" class="btn btn-sm btn-secondary" style="width:100%;margin-top:6px" @click="pickImage">Change Image</button>
          </div>
          <div style="flex:1">
            <div class="form-group"><label>Item Name</label><input v-model="form.name" placeholder="e.g. Cappuccino" :class="{ 'input-error': vErrors.name }" /><span v-if="vErrors.name" class="field-error">{{ vErrors.name }}</span></div>
            <div class="form-group"><label>Category</label><select v-model="form.category" class="select" :class="{ 'input-error': vErrors.category }"><option value="">Select...</option><option value="Espresso">Espresso</option><option value="Filter">Filter</option><option value="Cold">Cold</option><option value="Blended">Blended</option><option value="Food">Food</option><option value="Drinks">Drinks</option></select><span v-if="vErrors.category" class="field-error">{{ vErrors.category }}</span></div>
            <div class="form-row">
              <div class="form-group"><label>Selling Price (ETB)</label><input v-model.number="form.price" type="number" step="0.01" placeholder="0" :class="{ 'input-error': vErrors.price }" /><span v-if="vErrors.price" class="field-error">{{ vErrors.price }}</span></div>
              <div class="form-group"><label>Cost (ETB)</label><input v-model.number="form.cost" type="number" step="0.01" placeholder="0" /></div>
            </div>
            <div class="form-group"><label>Modifiers (comma-separated)</label><input v-model="form.modifiers" placeholder="e.g. hot, iced, oat-milk" /></div>
            <div class="form-group"><label>Available</label><select v-model="form.available" class="select"><option :value="true">Yes</option><option :value="false">No</option></select></div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button type="button" class="btn btn-primary" :class="{'btn-loading': btnState.isBusy(), 'btn-success-state': btnState.isSuccess(), 'btn-error-state': btnState.isError()}" :disabled="btnState.isBusy()" :aria-busy="btnState.isBusy() ? 'true' : undefined" @click="saveItem">
            <span v-if="btnState.isBusy()" class="btn-spinner" aria-hidden="true"></span>
            <span v-else-if="btnState.isSuccess()" class="btn-check" aria-hidden="true">✓</span>
            <span v-else-if="btnState.isError()" class="btn-error-icon" aria-hidden="true">!</span>
            {{ btnState.isBusy() ? 'Saving...' : btnState.isSuccess() ? 'Saved ✓' : btnState.isError() ? 'Try Again' : (editing ? 'Update' : 'Add Item') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted , inject} from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { useButtonState } from '../composables/useButtonState'
import { useFormValidation } from '../composables/useFormValidation'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
/**
 * A head chef reaches this screen for one reason: to take a dish off when the
 * kitchen has run out. Everything else here - adding items, editing them,
 * pricing, cost and margin - stays with the manager, so the chef sees a menu
 * they can 86 from and nothing they can reprice.
 */
const isManager = computed(() => auth.roleKey === 'manager')
const canToggleAvailability = computed(() => ['manager', 'head-chef'].includes(auth.roleKey))
const togglingId = ref('')

const toast = inject('toast')
const confirmDelete = inject('confirm')
const btnState = useButtonState({ successDuration: 2000 })
const schema = {
  name: { required: true, label: 'Item Name', max: 100 },
  price: { required: true, label: 'Selling Price', min: 0, maxVal: 99999 },
  category: { required: true, label: 'Category' }
}
const { errors: vErrors, validate } = useFormValidation(schema)
const items = ref([])
const filter = ref('')
const showModal = ref(false)
const editing = ref(null)
const form = ref({ name: '', category: '', price: 0, cost: 0, modifiers: '', available: true, image: '' })

const foodImages = [
  '/assets/menu-1488477181946.jpg','/assets/menu-1512058564366.jpg','/assets/menu-1514432324607.jpg',
  '/assets/menu-1525351484163.jpg','/assets/menu-1540189549336.jpg','/assets/menu-1544025162.jpg',
  '/assets/menu-1546833999.jpg','/assets/menu-1547592180.jpg','/assets/menu-1555939594.jpg',
  '/assets/menu-1561047029.jpg','/assets/menu-1565958011703.jpg','/assets/menu-1567620905732.jpg',
  '/assets/menu-1576092768241.jpg','/assets/menu-1578985545062.jpg','/assets/menu-1606787366850.jpg',
  '/assets/menu-1608039829572.jpg','/assets/menu-1627308595229.jpg'
]

const filteredItems = computed(() => {
  if (!filter.value) return items.value
  return items.value.filter(i => i.category === filter.value)
})

function getPlaceholder(item) {
  const idx = items.value.findIndex(i => i.id === item.id)
  return foodImages[((idx >= 0 ? idx : Math.abs(hashCode(item.name || ''))) % foodImages.length)]
}

function hashCode(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0
  return h
}

function pickImage() { form.value.image = foodImages[Math.floor(Math.random() * foodImages.length)] }

function marginPercent(item) {
  const p = parseFloat(item.price||0); const c = parseFloat(item.cost||0)
  if (!p || !c) return 0
  return ((p - c) / p * 100).toFixed(0)
}

function marginClass(item) {
  const m = parseFloat(marginPercent(item))
  if (m >= 50) return 'badge-ok'; if (m >= 20) return 'badge-new'; return 'badge-low'
}

onMounted(loadData)

async function loadData() {
  try { items.value = await apiGet('menu') } catch (e) { console.error(e) }
}

function openAdd() {
  editing.value = null; form.value = { name: '', category: '', price: 0, cost: 0, modifiers: '', available: true, image: '' }; showModal.value = true
}

function openEdit(item) {
  editing.value = item; form.value = { ...item, image: item.image || '' }; showModal.value = true
}

async function saveItem() {
  if (!validate(form.value)) { toast('Please fix the errors', 'error'); return }
  btnState.setLoading()
  try {
    const data = { ...form.value, modifiers: form.value.modifiers ? form.value.modifiers.split(',').map(s => s.trim()).filter(Boolean) : [] }
    if (editing.value) { await apiPut('menu/' + editing.value.id, data); toast('Item updated') }
    else { await apiPost('menu', data); toast('Item added') }
    showModal.value = false; editing.value = null
    form.value = { name: '', category: '', price: 0, cost: 0, modifiers: '', available: true, image: '' }
    await loadData()
    btnState.setSuccess()
  } catch (e) { toast(e.message || 'Failed', 'error'); btnState.setError(e.message) }
}

/**
 * Sends only the availability flag, to its own endpoint. The server reads
 * nothing else from the request, so this cannot become a way to edit a price
 * even if this screen were changed later.
 */
async function toggleAvailability(item) {
  if (togglingId.value) return
  const next = item.available === false
  togglingId.value = item.id
  try {
    const res = await apiPut(`menu/${item.id}/availability`, { available: next })
    item.available = next
    if (res && res.changedBy) {
      item.availabilityChangedBy = res.changedBy
      item.availabilityChangedAt = res.changedAt
    }
    toast(next ? `${item.name} back on` : `${item.name} marked 86`)
  } catch (e) {
    toast(e.message || 'Could not update availability', 'error')
  } finally {
    togglingId.value = ''
  }
}

function shortTime(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function handleDelete(item) {
  if (!await confirmDelete(`Delete "${item.name}"?`)) return
  try { await apiDelete('menu/' + item.id); toast('Deleted'); await loadData() } catch (e) { toast(e.message, 'error') }
}
</script>
<style scoped>
.mm-changed { font-size: .78rem; color: var(--text-muted); margin-top: 2px; }
.input-error { border-color: var(--danger, #e74c3c) !important; }
.field-error { display: block; color: var(--danger, #e74c3c); font-size: 0.75rem; margin-top: 2px; }
</style>