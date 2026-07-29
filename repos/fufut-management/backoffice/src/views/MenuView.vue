<template>
  <div>
    <div class="table-toolbar">
      <h3>Menu Management</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="categoryFilter" class="select select-sm" style="width:auto">
          <option value="">All Categories</option>
          <option v-for="cat in categories" :key="cat">{{ cat }}</option>
        </select>
        <input v-model="search" placeholder="Search..." class="input input-sm" style="width:160px" />
        <button class="btn btn-secondary" @click="viewMode = viewMode === 'grid' ? 'table' : 'grid'">
          {{ viewMode === 'grid' ? '📋 Table View' : '🔲 Grid View' }}
        </button>
        <button class="btn btn-secondary" @click="showForm=true;editing=null;form={}">+ Add Item</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ menu.length }}</div><div class="lbl">Total Items</div></div>
      <div class="summary-card"><div class="num">{{ availableCount }}</div><div class="lbl">Available</div></div>
      <div class="summary-card"><div class="num">{{ categories.length }}</div><div class="lbl">Categories</div></div>
    </div>

    <!-- Grid View -->
    <div v-if="viewMode === 'grid'" class="menu-grid">
      <div v-for="item in filtered" :key="item.id" class="menu-card"
        :class="{ unavailable: item.available === false }"
        @click="editItem(item)"
      >
        <div class="menu-img">
          <img :src="item.image || getPlaceholder(item)" :alt="item.name" loading="lazy" />
          <div v-if="item.available === false" class="menu-img-overlay">Unavailable</div>
        </div>
        <div class="menu-info">
          <div class="menu-name">{{ item.name }}</div>
          <div class="menu-category">{{ item.category }}</div>
          <div class="menu-price">ETB {{ parseFloat(item.price||0).toFixed(0) }}</div>
        </div>
      </div>
      <div v-if="!filtered.length" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">No items found</div>
    </div>

    <!-- Table View -->
    <div v-else class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th></th><th>Name</th><th>Category</th><th>Price (ETB)</th><th>Cost (ETB)</th><th>Modifiers</th><th>Available</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="item in filtered" :key="item.id">
              <td style="width:50px;padding:4px 8px">
                <img :src="item.image || getPlaceholder(item)" :alt="item.name"
                  style="width:40px;height:40px;border-radius:6px;object-fit:cover" loading="lazy" />
              </td>
              <td><strong>{{ item.name }}</strong></td>
              <td><span class="badge badge-pending">{{ item.category }}</span></td>
              <td style="font-weight:600;font-family:var(--font-mono)">{{ parseFloat(item.price||0).toFixed(0) }}</td>
              <td style="font-family:var(--font-mono)">{{ parseFloat(item.cost||0).toFixed(0) }}</td>
              <td>{{ (item.modifiers||[]).join(', ') || '-' }}</td>
              <td><span class="badge" :class="item.available !== false ? 'badge-success' : 'badge-cancelled'">{{ item.available !== false ? 'Yes' : 'No' }}</span></td>
              <td><button class="btn btn-sm btn-ghost" @click.stop="editItem(item)">Edit</button><button class="btn btn-sm btn-ghost" @click.stop="toggleAvailable(item)">{{ item.available !== false ? 'Hide' : 'Show' }}</button></td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No items found</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Form Modal -->
    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal menu-form-modal">
        <h3>{{ editing ? 'Edit Item' : 'Add Menu Item' }}</h3>
        <form @submit.prevent="saveItem">
          <div style="display:flex;gap:16px">
            <div class="menu-form-img">
              <img :src="form.image || getPlaceholder(form)" alt="Preview" />
              <button type="button" class="btn btn-sm btn-secondary" style="margin-top:6px;width:100%" @click="pickRandomImage">Pick Image</button>
            </div>
            <div style="flex:1">
              <div class="form-row">
                <div class="form-group"><label>Name</label><input v-model="form.name" required /></div>
                <div class="form-group"><label>Category</label><select v-model="form.category" required class="select">
                  <option>Coffee</option><option>Drinks</option><option>Pastries</option><option>Breakfast</option><option>Appetizers</option><option>Salads</option><option>Mains</option><option>Desserts</option>
                </select></div>
              </div>
              <div class="form-row">
                <div class="form-group"><label>Price (ETB)</label><input type="number" v-model.number="form.price" min="0" required /></div>
                <div class="form-group"><label>Cost (ETB)</label><input type="number" v-model.number="form.cost" min="0" /></div>
              </div>
              <div class="form-group"><label>Modifiers (comma separated)</label><input v-model="modifiersStr" placeholder="e.g. Extra shot, Soy milk, No ice" /></div>
            </div>
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
import { apiGet, apiPost, apiPut } from '../api'

const toast = inject('toast')
const menu = ref([])
const search = ref('')
const categoryFilter = ref('')
const viewMode = ref('grid')
const showForm = ref(false)
const editing = ref(null)
const form = ref({ name: '', category: 'Coffee', price: 0, cost: 0, image: '' })
const modifiersStr = ref('')

const foodImages = [
  '/assets/menu-1488477181946.jpg','/assets/menu-1512058564366.jpg','/assets/menu-1514432324607.jpg',
  '/assets/menu-1525351484163.jpg','/assets/menu-1540189549336.jpg','/assets/menu-1544025162.jpg',
  '/assets/menu-1546833999.jpg','/assets/menu-1547592180.jpg','/assets/menu-1555939594.jpg',
  '/assets/menu-1561047029.jpg','/assets/menu-1565958011703.jpg','/assets/menu-1567620905732.jpg',
  '/assets/menu-1576092768241.jpg','/assets/menu-1578985545062.jpg','/assets/menu-1606787366850.jpg',
  '/assets/menu-1608039829572.jpg','/assets/menu-1627308595229.jpg'
]

const categories = computed(() => [...new Set(menu.value.map(m => m.category))])
const availableCount = computed(() => menu.value.filter(m => m.available !== false).length)
const filtered = computed(() => menu.value.filter(m => {
  if (categoryFilter.value && m.category !== categoryFilter.value) return false
  if (search.value && !m.name?.toLowerCase().includes(search.value.toLowerCase())) return false
  return true
}))

onMounted(loadMenu)

// Assign a deterministic image based on item index or name
function getPlaceholder(item) {
  const idx = menu.value.findIndex(i => i.id === item.id)
  return foodImages[((idx >= 0 ? idx : Math.abs(hashCode(item.name || ''))) % foodImages.length)]
}

function hashCode(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0
  return h
}

function pickRandomImage() {
  form.value.image = foodImages[Math.floor(Math.random() * foodImages.length)]
}

async function loadMenu() { try { menu.value = await apiGet('menu') } catch (e) { console.error(e) } }

function editItem(item) {
  editing.value = item; form.value = { name: item.name, category: item.category, price: item.price, cost: item.cost, image: item.image || '' }
  modifiersStr.value = (item.modifiers||[]).join(', ')
  showForm.value = true
}

async function saveItem() {
  try {
    const data = {
      ...form.value,
      modifiers: modifiersStr.value.split(',').map(s => s.trim()).filter(Boolean)
    }
    if (editing.value) { await apiPut('menu', { ...data, id: editing.value.id }); toast('Menu item updated') }
    else { await apiPost('menu', data); toast('Menu item added') }
    showForm.value = false; editing.value = null
    form.value = { name: '', category: 'Coffee', price: 0, cost: 0, image: '' }; modifiersStr.value = ''
    await loadMenu()
  } catch (e) { toast(e.message, 'error') }
}

async function toggleAvailable(item) {
  try { await apiPut('menu', { ...item, available: item.available === false ? true : false }); await loadMenu() } catch (e) { toast(e.message, 'error') }
}
</script>

<style scoped>
.menu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
.menu-card{background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);overflow:hidden;cursor:pointer;transition:all var(--duration-base) var(--ease);box-shadow:var(--shadow-xs)}
.menu-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-card-hover);border-color:var(--primary)}
.menu-card.unavailable{opacity:.6}
.menu-card.unavailable:hover{opacity:.8}
.menu-img{position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;background:var(--neutral-50)}
.menu-img img{width:100%;height:100%;object-fit:cover;transition:transform var(--duration-slow) var(--ease-out)}
.menu-card:hover .menu-img img{transform:scale(1.08)}
.menu-img-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:.85rem;text-transform:uppercase;letter-spacing:.06em}
.menu-info{padding:10px 12px 12px}
.menu-name{font-size:.85rem;font-weight:600;color:var(--text-heading);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.menu-category{font-size:.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.menu-price{font-size:.92rem;font-weight:700;color:var(--primary);font-family:var(--font-mono)}

/* Form with image preview */
.menu-form-modal{width:600px;max-width:95vw}
.menu-form-img{width:140px;flex-shrink:0}
.menu-form-img img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius-sm);border:1px solid var(--border)}
</style>
