<template>
  <div class="menu-editor">
    <div class="table-toolbar">
      <h3>Menu Editor <span class="badge" v-if="loaded">{{ itemsCount }} items</span></h3>
      <div style="display:flex;gap:8px;align-items:center">
        <span v-if="dirty" class="unsaved-badge">Unsaved changes</span>
        <button class="btn btn-outline btn-sm" @click="addCategory">+ Category</button>
        <button class="btn btn-primary btn-sm" :disabled="!dirty" @click="saveAll">💾 Save</button>
        <button class="btn btn-outline btn-sm" @click="loadData">↻ Refresh</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="!loaded" class="empty-state" style="padding:80px;text-align:center;color:var(--muted)">Loading menu data...</div>

    <!-- Category sections -->
    <div v-for="(cat, ci) in data.categories" :key="ci" class="category-section">
      <div class="category-header" @click="cat._open = !cat._open">
        <div class="category-title">
          <span class="collapse-icon">{{ cat._open ? '▼' : '▶' }}</span>
          <strong>{{ cat.name }}</strong>
          <span class="item-count">{{ (cat.items||[]).length }} items</span>
        </div>
        <div class="category-actions" @click.stop>
          <button class="btn btn-sm btn-ghost" @click="addItem(cat)" title="Add item">+ Add</button>
          <button class="btn btn-sm btn-ghost" @click="editCategory(ci)" title="Edit category name">✎</button>
          <button class="btn btn-sm btn-ghost" @click="moveCategory(ci, -1)" :disabled="ci===0" title="Move up">↑</button>
          <button class="btn btn-sm btn-ghost" @click="moveCategory(ci, 1)" :disabled="ci===data.categories.length-1" title="Move down">↓</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click="deleteCategory(ci)" title="Delete category">🗑</button>
        </div>
      </div>

      <div v-if="cat._open" class="category-items">
        <div class="item-row item-row-header">
          <span class="col-name">Name</span>
          <span class="col-price">Price</span>
          <span class="col-desc">Description</span>
          <span class="col-actions">Actions</span>
        </div>
        <div v-for="(item, ii) in cat.items" :key="ii" class="item-row">
          <span class="col-name">{{ item.name }}</span>
          <span class="col-price">{{ item.price || '—' }}</span>
          <span class="col-desc desc-text">{{ truncate(item.description, 80) || '—' }}</span>
          <span class="col-actions">
            <button class="btn btn-sm btn-ghost" @click="editItem(ci, ii)">Edit</button>
            <button class="btn btn-sm btn-ghost" @click="moveItem(ci, ii, -1)" :disabled="ii===0" title="Up">↑</button>
            <button class="btn btn-sm btn-ghost" @click="moveItem(ci, ii, 1)" :disabled="ii===cat.items.length-1" title="Down">↓</button>
            <button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click="deleteItem(ci, ii)">✕</button>
          </span>
        </div>
        <div v-if="!cat.items || !cat.items.length" class="item-row empty-row">
          <span colspan="4" class="empty-state" style="padding:16px">No items — click "+ Add" to create one</span>
        </div>
      </div>
    </div>

    <div v-if="loaded && (!data.categories || !data.categories.length)" class="empty-state" style="padding:80px;text-align:center;color:var(--muted)">
      No categories yet. Click "+ Category" to add one.
    </div>

    <!-- Edit Item Modal -->
    <div class="modal-overlay" v-if="editModal" @click.self="closeEditModal">
      <div class="modal" style="max-width:540px">
        <h3>Edit Menu Item</h3>
        <p class="modal-sub">{{ editItemData.name || 'New Item' }}</p>
        <div class="form-group">
          <label>Name</label>
          <input v-model="editItemData.name" placeholder="Item name (English / አማርኛ)" />
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Price</label>
            <input v-model="editItemData.price" placeholder="e.g. 600 ETB" />
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea v-model="editItemData.description" rows="3" placeholder="Item description in English"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeEditModal">Cancel</button>
          <button class="btn btn-primary" @click="saveEditModal">Save</button>
        </div>
      </div>
    </div>

    <!-- Edit Category Name Modal -->
    <div class="modal-overlay" v-if="catEditModal" @click.self="catEditModal=false">
      <div class="modal" style="max-width:400px">
        <h3>Edit Category Name</h3>
        <div class="form-group">
          <label>Category Name</label>
          <input v-model="catEditName" placeholder="e.g. Breakfast / ቁርስ" />
          <small style="color:var(--muted)">Use format: English / አማርኛ</small>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="catEditModal=false">Cancel</button>
          <button class="btn btn-primary" @click="saveCatEdit">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { apiGet, apiPost } from '../api'
import { useToast } from '../composables/useToast'

const { toast } = useToast()

const data = reactive({ categories: [] })
const loaded = ref(false)
const dirty = ref(false)

const itemsCount = computed(() => {
  let count = 0
  for (const cat of data.categories) {
    if (cat.items) count += cat.items.length
  }
  return count
})

// Edit item modal state
const editModal = ref(false)
const editItemData = reactive({ name: '', price: '', description: '' })
let editItemCi = -1
let editItemIi = -1

// Edit category modal state
const catEditModal = ref(false)
const catEditName = ref('')
let editCatCi = -1

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '…' : str
}async function loadData() {
    try {
        const json = await apiGet('menus')
    // Preserve _open states
    const openMap = {}
    for (const oldCat of data.categories) {
      openMap[oldCat.name] = oldCat._open
    }
    data.restaurant = json.restaurant || 'FU FUT COFFEE'
    data.categories = (json.categories || []).map(c => ({
      ...c,
      _open: openMap[c.name] !== undefined ? openMap[c.name] : false
    }))
    loaded.value = true
    dirty.value = false
  } catch (e) {
    toast('Failed to load menu data: ' + e.message, 'error')
  }
}

async function saveAll() {
  try {
    const payload = { restaurant: data.restaurant || 'FU FUT COFFEE', categories: [] }
    for (const cat of data.categories) {
      const cleanCat = {
        name: cat.name,
        items: (cat.items || []).map(item => ({
          name: item.name || '',
          description: item.description || '',
          price: item.price || ''
        }))
      }
      payload.categories.push(cleanCat)
    }
    const result = await apiPost('menus/save', payload)
    dirty.value = false
    toast(`Saved! ${result.count || '?'} items updated`)
  } catch (e) {
    toast('Failed to save: ' + e.message, 'error')
  }
}

function addCategory() {
  catEditName.value = ''
  editCatCi = -1
  catEditModal.value = true
}

function editCategory(ci) {
  catEditName.value = data.categories[ci].name
  editCatCi = ci
  catEditModal.value = true
}

function saveCatEdit() {
  if (!catEditName.value.trim()) {
    toast('Category name is required', 'error')
    return
  }
  if (editCatCi === -1) {
    // Add new category
    data.categories.push({ name: catEditName.value.trim(), items: [], _open: true })
  } else {
    // Edit existing
    data.categories[editCatCi].name = catEditName.value.trim()
  }
  dirty.value = true
  catEditModal.value = false
  toast(editCatCi === -1 ? 'Category added' : 'Category renamed')
}

function deleteCategory(ci) {
  const name = data.categories[ci].name
  const count = (data.categories[ci].items || []).length
  if (!confirm(`Delete category "${name}"${count ? ` with ${count} item(s)` : ''}?`)) return
  data.categories.splice(ci, 1)
  dirty.value = true
  toast('Category deleted')
}

function moveCategory(ci, dir) {
  const target = ci + dir
  if (target < 0 || target >= data.categories.length) return
  const tmp = data.categories[ci]
  data.categories[ci] = data.categories[target]
  data.categories[target] = tmp
  dirty.value = true
}

function addItem(cat) {
  if (!cat.items) cat.items = []
  editItemCi = data.categories.indexOf(cat)
  editItemIi = cat.items.length
  editItemData.name = ''
  editItemData.price = ''
  editItemData.description = ''
  // Add placeholder
  cat.items.push({ name: '', price: '', description: '' })
  editModal.value = true
}

function editItem(ci, ii) {
  const item = data.categories[ci].items[ii]
  editItemCi = ci
  editItemIi = ii
  editItemData.name = item.name || ''
  editItemData.price = item.price || ''
  editItemData.description = item.description || ''
  editModal.value = true
}

function closeEditModal() {
  // Remove empty unsaved items
  const item = data.categories[editItemCi]?.items[editItemIi]
  if (item && !item.name.trim() && !item.price.trim() && !item.description.trim()) {
    data.categories[editItemCi].items.splice(editItemIi, 1)
  }
  editModal.value = false
}

function saveEditModal() {
  if (!editItemData.name.trim()) {
    toast('Item name is required', 'error')
    return
  }
  const item = data.categories[editItemCi].items[editItemIi]
  if (!item) {
    toast('Item not found', 'error')
    return
  }
  item.name = editItemData.name.trim()
  item.price = editItemData.price.trim()
  item.description = editItemData.description.trim()
  dirty.value = true
  editModal.value = false
  toast('Item updated')
}

function moveItem(ci, ii, dir) {
  const target = ii + dir
  const items = data.categories[ci].items
  if (target < 0 || target >= items.length) return
  const tmp = items[ii]
  items[ii] = items[target]
  items[target] = tmp
  dirty.value = true
}

function deleteItem(ci, ii) {
  const item = data.categories[ci].items[ii]
  if (!item.name) {
    // Remove empty placeholder
    data.categories[ci].items.splice(ii, 1)
    return
  }
  if (!confirm(`Delete "${item.name}"?`)) return
  data.categories[ci].items.splice(ii, 1)
  dirty.value = true
  toast('Item deleted')
}

onMounted(loadData)
</script>

<style scoped>
.menu-editor { padding-bottom: 40px; }

.category-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 12px;
  overflow: hidden;
}
.category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  user-select: none;
  transition: background .15s;
}
.category-header:hover { background: var(--bg-hover); }

.category-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.collapse-icon { font-size: .7rem; color: var(--muted); width: 12px; }
.item-count { font-size: .78rem; color: var(--muted); background: var(--bg-secondary); padding: 2px 10px; border-radius: 12px; }
.category-actions { display: flex; gap: 4px; align-items: center; }

.item-row {
  display: grid;
  grid-template-columns: 1.8fr 0.7fr 2fr auto;
  gap: 8px;
  padding: 8px 16px;
  align-items: center;
  border-bottom: 1px solid var(--border-light);
  font-size: .88rem;
}
.item-row:last-child { border-bottom: none; }
.item-row-header {
  font-size: .73rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--muted);
  padding: 6px 16px;
  background: var(--bg-tertiary);
}
.empty-row { color: var(--muted); font-style: italic; display: block; padding: 16px !important; }

.col-name { font-weight: 500; }
.col-price { font-family: monospace; color: var(--text); }
.col-desc { color: var(--muted); font-size: .82rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.col-actions { display: flex; gap: 2px; flex-shrink: 0; }

.desc-text { max-width: 300px; }

.unsaved-badge {
  font-size: .72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
  padding: 3px 10px;
  border-radius: 6px;
  background: rgba(255, 193, 7, .15);
  color: #b8860b;
}

.badge {
  font-size: .7rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  vertical-align: middle;
  margin-left: 6px;
}
</style>
