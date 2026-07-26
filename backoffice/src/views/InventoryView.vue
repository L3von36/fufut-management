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
      <div class="table-scroll">
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Quantity</th><th>Unit</th><th>Min Level</th><th>Cost/Unit</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="item in filtered" :key="item.id">
              <td>{{ item.name }}</td><td>{{ item.category }}</td>
              <td style="font-weight:600;font-family:var(--font-mono)">{{ item.quantity }}</td><td>{{ item.unit }}</td><td>{{ item.minLevel }}</td>
              <td style="font-family:var(--font-mono)">{{ parseFloat(item.costPerUnit||0).toFixed(0) }}</td>
              <td><span class="badge" :class="parseInt(item.quantity||0) <= 0 ? 'badge-cancelled' : parseInt(item.quantity||0) <= parseInt(item.minLevel||0) ? 'badge-low' : 'badge-success'">{{ parseInt(item.quantity||0) <= 0 ? 'Out' : parseInt(item.quantity||0) <= parseInt(item.minLevel||0) ? 'Low' : 'OK' }}</span></td>
              <td><button class="btn btn-sm btn-ghost" @click="editItem(item)">Edit</button><button class="btn btn-sm btn-ghost danger" @click="deleteItem(item.id)">Delete</button></td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No items found</td></tr>
          </tbody>
        </table>
      </div>
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
            <button type="submit" class="btn btn-primary">{{ editing ? 'Update' : 'Save' }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'

const toast = inject('toast')
const items = ref([])
const search = ref('')
const showForm = ref(false)
const editing = ref(null)
const form = ref({ name: '', category: 'Produce', quantity: 0, unit: 'kg', minLevel: 0, costPerUnit: 0 })

const filtered = computed(() => items.value.filter(i => !search.value || i.name?.toLowerCase().includes(search.value.toLowerCase())))
const lowItems = computed(() => items.value.filter(i => parseInt(i.quantity||0) > 0 && parseInt(i.quantity||0) <= parseInt(i.minLevel||0)))
const outItems = computed(() => items.value.filter(i => parseInt(i.quantity||0) <= 0))

onMounted(loadItems)

async function loadItems() { try { items.value = await apiGet('inventory') } catch (e) { console.error(e) } }

function editItem(item) { editing.value = item; form.value = { ...item }; showForm.value = true }

async function saveItem() {
  try {
    if (editing.value) { await apiPut('inventory', { ...form.value, id: editing.value.id }); toast('Item updated') }
    else { await apiPost('inventory', form.value); toast('Item added') }
    showForm.value = false; editing.value = null; form.value = { name: '', category: 'Produce', quantity: 0, unit: 'kg', minLevel: 0, costPerUnit: 0 }
    await loadItems()
  } catch (e) { toast(e.message, 'error') }
}

async function deleteItem(id) { if (!confirm('Delete this item?')) return; try { await apiDelete('inventory', id); toast('Deleted'); await loadItems() } catch (e) { toast(e.message, 'error') } }
</script>
