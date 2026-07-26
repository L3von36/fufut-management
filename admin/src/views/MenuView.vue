<template>
  <div>
    <div class="table-toolbar">
      <h3>Menu Items</h3>
      <div style="display:flex;gap:8px">
        <select v-model="filter" class="select select-sm">
          <option value="">All Categories</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <button class="btn btn-primary btn-sm" @click="openAdd">+ Add</button>
        <button class="btn btn-outline btn-sm" @click="loadData">Refresh</button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Tags</th><th>Available</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="i in filtered" :key="i.id">
              <td><strong>{{ i.name }}</strong></td>
              <td>{{ i.category }}</td>
              <td>ETB {{ parseFloat(i.price||0).toFixed(0) }}</td>
              <td>{{ i.tags || i.modifiers || '—' }}</td>
              <td><label class="toggle"><input type="checkbox" :checked="i.available!==false" @change="toggleAvailable(i)"><span class="slider"></span></label></td>
              <td><button class="btn btn-sm btn-ghost" @click="openEdit(i)">Edit</button><button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click="handleDelete(i)">Delete</button></td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="6" class="empty-state" style="padding:40px">No items</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filtered.length }} item(s)</span></div>
    </div>
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>{{ editing?'Edit':'Add' }} Menu Item</h3>
        <p class="modal-sub">{{ editing?'Update details':'Add a new item' }}</p>
        <div class="form-group"><label>Name</label><input v-model="form.name" /></div>
        <div class="form-row">
          <div class="form-group"><label>Category</label><select v-model="form.category" class="select"><option v-for="c in categories" :key="c" :value="c">{{ c }}</option></select></div>
          <div class="form-group"><label>Price (ETB)</label><input v-model.number="form.price" type="number" step="0.01" /></div>
        </div>
        <div class="form-group"><label>Tags (comma-separated)</label><input v-model="form.tags" placeholder="e.g. traditional, spicy" /></div>
        <div class="form-group"><label>Available</label><select v-model="form.available" class="select"><option :value="true">Yes</option><option :value="false">No</option></select></div>
        <div class="modal-actions"><button class="btn btn-secondary" @click="showModal=false">Cancel</button><button class="btn btn-primary" @click="saveItem">{{ editing?'Update':'Add' }}</button></div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
const { toast } = useToast()
const items = ref([]); const filter = ref(''); const showModal = ref(false); const editing = ref(null)
const form = ref({ name:'', category:'Espresso', price:0, tags:'', available:true })
const categories = ['Espresso','Filter','Cold','Blended','Food','Drinks','Breakfast','Lunch','Dinner','Traditional','Desserts']
const filtered = computed(() => !filter.value ? items.value : items.value.filter(i => i.category === filter.value))
onMounted(loadData)
async function loadData() { try { items.value = await apiGet('menu') } catch {} }
function openAdd() { editing.value=null; form.value={name:'',category:'Espresso',price:0,tags:'',available:true}; showModal.value=true }
function openEdit(i) { editing.value=i; form.value={...i}; showModal.value=true }
async function saveItem() { try { if(editing.value){ await apiPut('menu/'+editing.value.id,form.value); toast('Updated') } else { await apiPost('menu',form.value); toast('Added') }; showModal.value=false; await loadData() } catch { toast('Failed','error') } }
async function toggleAvailable(i) { i.available = !(i.available !== false); try { await apiPut('menu/'+i.id,i); toast(i.available?'Available':'Unavailable') } catch { toast('Failed','error') } }
async function handleDelete(i) { if(!confirm('Delete?'))return; try { await apiDelete('menu/'+i.id); toast('Deleted'); await loadData() } catch { toast('Failed','error') } }
</script>
