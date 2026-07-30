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
          <span class="col-img">Image</span>
          <span class="col-name">Name</span>
          <span class="col-price">Price</span>
          <span class="col-desc">Description</span>
          <span class="col-tags">Tags</span>
          <span class="col-avail">Available</span>
          <span class="col-actions">Actions</span>
        </div>
        <div v-for="(item, ii) in cat.items" :key="ii" class="item-row">
          <span class="col-img">
            <div v-if="item.image" class="thumb" :style="`background-image:url('${item.image}')`"></div>
            <div v-else class="thumb thumb-empty">📷</div>
          </span>
          <span class="col-name">{{ item.name }}</span>
          <span class="col-price">{{ item.price || '—' }}</span>
          <span class="col-desc desc-text">{{ truncate(item.description, 60) || '—' }}</span>
          <span class="col-tags">
            <span v-for="t in parseTags(item.tags)" :key="t" class="tag-chip">{{ t }}</span>
          </span>
          <span class="col-avail">
            <span class="avail-dot" :class="item.available !== false && item.available !== 0 ? 'avail-on' : 'avail-off'"></span>
          </span>
          <span class="col-actions">
            <button class="btn btn-sm btn-ghost" @click="editItem(ci, ii)">Edit</button>
            <button class="btn btn-sm btn-ghost" @click="moveItem(ci, ii, -1)" :disabled="ii===0" title="Up">↑</button>
            <button class="btn btn-sm btn-ghost" @click="moveItem(ci, ii, 1)" :disabled="ii===cat.items.length-1" title="Down">↓</button>
            <button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click="deleteItem(ci, ii)">✕</button>
          </span>
        </div>
        <div v-if="!cat.items || !cat.items.length" class="item-row empty-row">
          <span colspan="7" class="empty-state" style="padding:16px">No items — click "+ Add" to create one</span>
        </div>
      </div>
    </div>

    <div v-if="loaded && (!data.categories || !data.categories.length)" class="empty-state" style="padding:80px;text-align:center;color:var(--muted)">
      No categories yet. Click "+ Category" to add one.
    </div>

    <!-- Edit Item Modal -->
    <div class="modal-overlay" v-if="editModal" @click.self="closeEditModal">
      <div class="modal" style="max-width:560px">
        <h3>{{ editItemIi === _newItemIdx ? 'Add Menu Item' : 'Edit Menu Item' }}</h3>
        <p class="modal-sub">{{ editItemData.name || 'New Item' }}</p>

        <div class="form-group">
          <label>Name</label>
          <input v-model="editItemData.name" placeholder="Item name (English / አማርኛ)" />
        </div>

        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Price</label>
            <input v-model="editItemData.price" placeholder="e.g. 600" />
          </div>
          <div class="form-group" style="flex:0 0 auto;align-items:center;justify-content:center;padding-top:22px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500">
              <input type="checkbox" v-model="editItemData.available" style="width:16px;height:16px;accent-color:var(--primary)" />
              Available on menu
            </label>
          </div>
        </div>

        <div class="form-group">
          <label>Description</label>
          <textarea v-model="editItemData.description" rows="3" placeholder="Item description in English"></textarea>
        </div>

        <div class="form-group">
          <label>Image</label>
          <div class="image-upload-row">
            <input v-model="editItemData.image" placeholder="https://... or upload a file" class="image-url-input" />
            <label class="btn btn-outline btn-sm upload-btn" :class="{ uploading: imageUploading }">
              <input type="file" accept="image/*" style="display:none" @change="handleImageUpload" :disabled="imageUploading" />
              <span v-if="imageUploading">Uploading…</span>
              <span v-else>📁 Upload</span>
            </label>
          </div>
          <div v-if="editItemData.image" style="margin-top:8px;border-radius:8px;overflow:hidden;height:120px;background:var(--bg)">
            <img :src="editItemData.image" style="width:100%;height:100%;object-fit:cover" @error="e=>e.target.style.display='none'" />
          </div>
          <small style="color:var(--muted)">Upload a photo or paste a direct image URL</small>
        </div>

        <div class="form-group">
          <label>Tags</label>
          <div class="tag-picker">
            <button
              v-for="t in AVAILABLE_TAGS" :key="t"
              type="button"
              class="tag-btn"
              :class="{ active: editItemData.tags.includes(t) }"
              @click="toggleTag(t)"
            >{{ t }}</button>
          </div>
        </div>

        <div class="form-group">
          <label>Modifiers / Options</label>
          <input v-model="editItemData.modifiersRaw" placeholder="hot, iced, oat-milk, double (comma-separated)" />
          <small style="color:var(--muted)">Variants customers can choose from</small>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeEditModal">Cancel</button>
          <button class="btn btn-primary" @click="saveEditModal">Save Item</button>
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
import { apiGet, apiPost, apiUpload } from '../api'
import { useToast } from '../composables/useToast'

const { toast } = useToast()

const AVAILABLE_TAGS = [
  'Vegan', 'Vegetarian', 'Traditional', 'Spicy', 'Popular',
  'Chef\'s Special', 'Must Try', 'Gluten Free', 'Healthy',
  'Light Roast', 'Medium Roast', 'Dark Roast', 'Single Origin',
  'Award Winning', 'Local Favorite', 'Quick Bite', 'Hearty'
]

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
const imageUploading = ref(false)
const editItemData = reactive({
  name: '', price: '', description: '',
  image: '', available: true,
  tags: [], modifiersRaw: ''
})
let editItemCi = -1
let editItemIi = -1
let _newItemIdx = -999

async function handleImageUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  imageUploading.value = true
  try {
    const result = await apiUpload(file)
    editItemData.image = result.url
    toast('Image uploaded')
  } catch (err) {
    toast('Upload failed: ' + err.message, 'error')
  } finally {
    imageUploading.value = false
    e.target.value = ''
  }
}

// Edit category modal state
const catEditModal = ref(false)
const catEditName = ref('')
let editCatCi = -1

function truncate(str, len) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '…' : str
}

function parseTags(tags) {
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  return tags.split(',').map(t => t.trim()).filter(Boolean)
}

function toggleTag(t) {
  const idx = editItemData.tags.indexOf(t)
  if (idx === -1) editItemData.tags.push(t)
  else editItemData.tags.splice(idx, 1)
}

async function loadData() {
  try {
    const json = await apiGet('menus')
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
  // Safety guard — prevent accidental full wipe of all menu data
  const totalItems = data.categories.reduce((s, c) => s + (c.items || []).length, 0)
  if (data.categories.length === 0 || totalItems === 0) {
    const ok = window.confirm(
      '⚠️ DANGER: You are about to save an EMPTY menu.\n\n' +
      'This will permanently DELETE all categories and items from the database.\n\n' +
      'Click Cancel to go back. Click OK only if you truly mean to clear the entire menu.'
    )
    if (!ok) return
    const ok2 = window.confirm('Final check: Are you absolutely sure you want to DELETE all menu data? This cannot be undone.')
    if (!ok2) return
  }
  try {
    const payload = { restaurant: data.restaurant || 'FU FUT COFFEE', categories: [] }
    for (const cat of data.categories) {
      const cleanCat = {
        name: cat.name,
        items: (cat.items || []).map(item => ({
          name: item.name || '',
          description: item.description || '',
          price: item.price || '',
          image: item.image || '',
          available: item.available !== false && item.available !== 0,
          tags: Array.isArray(item.tags) ? item.tags : parseTags(item.tags),
          modifiers: Array.isArray(item.modifiers) ? item.modifiers
            : (item.modifiers || '').split(',').map(m => m.trim()).filter(Boolean)
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
    data.categories.push({ name: catEditName.value.trim(), items: [], _open: true })
  } else {
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
  _newItemIdx = editItemIi
  editItemData.name = ''
  editItemData.price = ''
  editItemData.description = ''
  editItemData.image = ''
  editItemData.available = true
  editItemData.tags = []
  editItemData.modifiersRaw = ''
  cat.items.push({ name: '', price: '', description: '', image: '', available: true, tags: [], modifiers: [] })
  editModal.value = true
}

function editItem(ci, ii) {
  const item = data.categories[ci].items[ii]
  editItemCi = ci
  editItemIi = ii
  _newItemIdx = -999
  editItemData.name = item.name || ''
  editItemData.price = item.price || ''
  editItemData.description = item.description || ''
  editItemData.image = item.image || ''
  editItemData.available = item.available !== false && item.available !== 0
  editItemData.tags = Array.isArray(item.tags) ? [...item.tags] : parseTags(item.tags)
  const mods = Array.isArray(item.modifiers) ? item.modifiers : (item.modifiers || '').split(',').map(m => m.trim()).filter(Boolean)
  editItemData.modifiersRaw = mods.join(', ')
  editModal.value = true
}

function closeEditModal() {
  const item = data.categories[editItemCi]?.items[editItemIi]
  if (item && !item.name.trim() && !item.price.trim() && !item.description.trim() && !item.image) {
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
  if (!item) { toast('Item not found', 'error'); return }
  item.name = editItemData.name.trim()
  item.price = editItemData.price.trim()
  item.description = editItemData.description.trim()
  item.image = editItemData.image.trim()
  item.available = editItemData.available
  item.tags = [...editItemData.tags]
  item.modifiers = editItemData.modifiersRaw.split(',').map(m => m.trim()).filter(Boolean)
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
  data.categories[ci].items.splice(ii, 1)
  dirty.value = true
  toast('Item removed')
}

onMounted(loadData)
</script>

<style scoped>
.menu-editor { padding-bottom: 40px; }
.category-section { border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: 12px; overflow: hidden; }
.category-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--bg-secondary); cursor: pointer; user-select: none; gap: 12px; }
.category-header:hover { background: var(--bg-tertiary); }
.category-title { display: flex; align-items: center; gap: 8px; font-size: .9rem; }
.collapse-icon { font-size: .65rem; color: var(--muted); width: 10px; }
.item-count { font-size: .72rem; color: var(--muted); font-weight: 400; }
.category-actions { display: flex; gap: 2px; }
.category-items { overflow-x: auto; }
.item-row {
  display: grid;
  grid-template-columns: 48px 1.6fr 0.6fr 1.8fr 1fr 64px auto;
  gap: 8px;
  padding: 8px 12px;
  align-items: center;
  border-bottom: 1px solid var(--border-light);
  font-size: .86rem;
}
.item-row:last-child { border-bottom: none; }
.item-row-header {
  font-size: .7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--muted);
  padding: 6px 12px;
  background: var(--bg-tertiary);
}
.empty-row { color: var(--muted); font-style: italic; display: block; padding: 16px !important; }
.col-name { font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-price { font-family: monospace; color: var(--text); white-space: nowrap; }
.col-desc { color: var(--muted); font-size: .8rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.col-actions { display: flex; gap: 2px; flex-shrink: 0; }
.col-tags { display: flex; flex-wrap: wrap; gap: 3px; min-width: 0; }
.col-avail { display: flex; justify-content: center; }
.col-img { display: flex; align-items: center; justify-content: center; }
.thumb { width: 36px; height: 36px; border-radius: 6px; background-size: cover; background-position: center; flex-shrink: 0; }
.thumb-empty { display: flex; align-items: center; justify-content: center; font-size: 1rem; background: var(--bg-tertiary); }
.tag-chip { font-size: .65rem; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: var(--teal-50); color: var(--teal-700); white-space: nowrap; }
.avail-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.avail-on { background: var(--success, #16a34a); }
.avail-off { background: var(--neutral-300, #d1d5db); }

/* Tag picker in modal */
.tag-picker { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0; }
.tag-btn { padding: 4px 10px; border-radius: 20px; border: 1.5px solid var(--border); background: var(--bg); color: var(--text-muted); font-size: .75rem; font-weight: 500; cursor: pointer; transition: all .15s; }
.tag-btn:hover { border-color: var(--primary); color: var(--primary); }
.tag-btn.active { background: var(--primary); border-color: var(--primary); color: #fff; }

/* Image upload row */
.image-upload-row { display: flex; gap: 8px; align-items: center; }
.image-url-input { flex: 1; min-width: 0; }
.upload-btn { flex-shrink: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.upload-btn.uploading { opacity: .6; pointer-events: none; }

.unsaved-badge {
  font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
  padding: 3px 10px; border-radius: 6px; background: rgba(255,193,7,.15); color: #b8860b;
}
.badge {
  font-size: .7rem; font-weight: 600; padding: 2px 10px; border-radius: 10px;
  background: var(--primary); color: #fff; vertical-align: middle; margin-left: 6px;
}
</style>
