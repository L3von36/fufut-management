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
          <div class="menu-meta">
            <span class="menu-category">{{ item.category }}</span>
            <span class="menu-price">ETB {{ parseFloat(item.price||0).toFixed(0) }}</span>
          </div>
        </div>
      </div>
      <div v-if="!filtered.length" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">No items found</div>
    </div>

    <!-- Table View -->
    <div v-else class="table-wrap">
      <base-table
        :columns="columns"
        :rows="filtered"
        stack-on-mobile
        caption="Menu items"
        empty-title="No items found"
        :empty-hint="search ? 'Try a different search.' : ''"
      >
        <template #cell-image="{ row: item }">
          <img :src="item.image || getPlaceholder(item)" :alt="item.name"
            style="width:40px;height:40px;border-radius:var(--radius-sm,6px);object-fit:cover" loading="lazy" />
        </template>
        <template #cell-name="{ row: item }"><strong>{{ item.name }}</strong></template>
        <template #cell-category="{ row: item }"><span class="badge badge-neutral">{{ item.category }}</span></template>
        <template #cell-price="{ row: item }">
          <span style="font-weight:600;font-family:var(--font-mono)">{{ parseFloat(item.price||0).toFixed(0) }}</span>
        </template>
        <template #cell-cost="{ row: item }">
          <span style="font-family:var(--font-mono)">{{ parseFloat(item.cost||0).toFixed(0) }}</span>
        </template>
        <template #cell-modifiers="{ row: item }">{{ (item.modifiers||[]).join(', ') || '—' }}</template>
        <template #cell-available="{ row: item }">
          <span class="badge" :class="item.available !== false ? 'badge-success' : 'badge-cancelled'">
            {{ item.available !== false ? 'Yes' : 'No' }}
          </span>
        </template>
        <template #cell-actions="{ row: item }">
          <button class="btn btn-sm btn-ghost" @click.stop="editItem(item)">Edit</button>
          <base-button :text="item.available !== false ? 'Hide' : 'Show'" variant="btn-ghost" extra-class="btn-sm" :on-click="() => toggleAvailable(item)" />
        </template>
      </base-table>
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
import { apiGet, apiPost, apiPut } from '../api'
import BaseTable from '../components/BaseTable.vue'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const btnState = useButtonState({ successDuration: 2000 })
const menu = ref([])
const search = ref('')
const categoryFilter = ref('')
const viewMode = ref('grid')
const showForm = ref(false)
const editing = ref(null)
const form = ref({ name: '', category: 'Coffee', price: 0, cost: 0, image: '' })
const modifiersStr = ref('')

const columns = [
  { key: 'image', label: '', width: '56px' },
  { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category' },
  { key: 'price', label: 'Price (ETB)' },
  { key: 'cost', label: 'Cost (ETB)' },
  { key: 'modifiers', label: 'Modifiers' },
  { key: 'available', label: 'Available' },
  { key: 'actions', label: 'Actions' },
]

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
  btnState.setLoading()
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
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}

async function toggleAvailable(item) {
  try { await apiPut('menu', { ...item, available: item.available === false ? true : false }); await loadMenu() } catch (e) { toast(e.message, 'error') }
}
</script>

<style scoped>
/* ── Menu tiles ────────────────────────────────────────────────────────────
   The card used to be a 4:3 photo with a block of three lines under it, so
   roughly a third of every card's height was text and the picture — the thing
   you actually recognise a dish by — stayed small. The name, category and
   price now sit on the photo behind a gradient, which makes the image the
   whole tile and drops the card's height by about a quarter at the same time.

   The columns are also wider than they were. At 180px the grid could not fit
   two of them on a 390px screen, so a phone got one enormous card per row and
   about two dishes per screenful. */
.menu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.menu-card{position:relative;aspect-ratio:4/3;background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);overflow:hidden;cursor:pointer;transition:all var(--duration-base) var(--ease);box-shadow:var(--shadow-xs)}
.menu-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-card-hover);border-color:var(--primary)}
.menu-card.unavailable{opacity:.6}
.menu-card.unavailable:hover{opacity:.8}
.menu-img{position:absolute;inset:0;overflow:hidden;background:var(--neutral-50)}
.menu-img img{width:100%;height:100%;object-fit:cover;transition:transform var(--duration-slow) var(--ease-out)}
.menu-card:hover .menu-img img{transform:scale(1.08)}
.menu-img-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:.85rem;text-transform:uppercase;letter-spacing:.06em}
/* Tall enough a scrim that white text holds up over a bright photo. */
.menu-info{position:absolute;left:0;right:0;bottom:0;padding:24px 10px 8px;
  background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.55) 55%,transparent 100%);
  pointer-events:none}
.menu-name{font-size:.82rem;font-weight:600;color:#fff;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.4)}
/* Category and price share a line rather than taking one each. */
.menu-meta{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.menu-category{font-size:.62rem;color:rgba(255,255,255,.78);text-transform:uppercase;letter-spacing:.05em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.menu-price{font-size:.86rem;font-weight:700;color:#fff;font-family:var(--font-mono);flex-shrink:0;text-shadow:0 1px 2px rgba(0,0,0,.4)}

@media (max-width: 768px) {
  /* Two to a row on a phone. auto-fill at 200px would drop to one. */
  .menu-grid{grid-template-columns:repeat(2,1fr);gap:10px}
  .menu-info{padding:20px 8px 7px}
}

/* Form with image preview */
.menu-form-modal{width:600px;max-width:95vw}
.menu-form-img{width:140px;flex-shrink:0}
.menu-form-img img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius-sm);border:1px solid var(--border)}
</style>