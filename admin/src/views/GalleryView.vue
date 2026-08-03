<template>
  <div class="gallery-admin">
    <!-- ===== Toolbar ===== -->
    <div class="gallery-toolbar">
      <div class="toolbar-left">
        <h3>Gallery</h3>
        <span class="count-pill" v-if="!loading">{{ images.length }} {{ images.length === 1 ? 'image' : 'images' }}</span>
      </div>
      <div class="toolbar-right">
        <button v-if="images.length" class="btn btn-ghost btn-sm" @click="toggleSelectMode">
          {{ selectMode ? 'Cancel' : 'Select' }}
        </button>
        <button v-if="selectMode && selected.size > 0" class="btn btn-danger btn-sm" @click="bulkDelete">
          Delete {{ selected.size }}
        </button>
        <base-button text="⇪ Upload from Device" variant="btn-primary btn-sm" :on-click="openUpload"></base-button>
        <base-button text="+ Add by URL" variant="btn-secondary btn-sm" :on-click="openAdd"></base-button>
      </div>
    </div>

    <!-- ===== Filter chips ===== -->
    <div class="filter-row" v-if="images.length || loading">
      <button v-for="cat in categories" :key="cat.value"
              class="filter-chip"
              :class="{ active: activeFilter === cat.value }"
              @click="activeFilter = cat.value">
        {{ cat.label }}
        <span class="filter-count" v-if="cat.value !== ''">{{ countByCategory(cat.value) }}</span>
      </button>
      <div class="filter-spacer"></div>
      <select v-model="sortBy" class="sort-select" v-if="images.length > 1">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="caption">Caption A–Z</option>
      </select>
    </div>

    <!-- ===== Sync status ===== -->
    <transition name="fade">
      <div v-if="syncing" class="sync-banner syncing">
        <span class="sync-dot"></span>
        Syncing to landing page…
      </div>
    </transition>
    <transition name="fade">
      <div v-if="syncMsg" class="sync-banner" :class="syncMsg.ok ? 'sync-ok' : 'sync-err'">
        <span>{{ syncMsg.ok ? '✓' : '!' }}</span>
        {{ syncMsg.text }}
      </div>
    </transition>

    <!-- ===== Loading skeleton ===== -->
    <div v-if="loading" class="gallery-grid">
      <div v-for="i in 8" :key="'sk'+i" class="skeleton-card">
        <div class="skeleton-img"></div>
      </div>
    </div>

    <!-- ===== Gallery grid ===== -->
    <div v-else-if="filteredImages.length" class="gallery-grid">
      <div v-for="img in filteredImages" :key="img.id || img.url"
           class="gallery-card"
           :class="{ selected: selected.has(getKey(img)), 'select-mode': selectMode }"
           @click="onCardClick(img)">
        <div class="card-image-wrap">
          <img :src="resolveUrl(img.url)" :alt="img.caption||img.title||''" loading="lazy" @error="onImgError" />

          <!-- Select checkbox -->
          <div v-if="selectMode" class="card-check" :class="{ checked: selected.has(getKey(img)) }">
            <svg v-if="selected.has(getKey(img))" viewBox="0 0 24 24" width="14" height="14"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>

          <!-- Hover action menu (only when not in select mode) -->
          <div v-if="!selectMode" class="card-actions">
            <button class="card-action-btn" title="Edit caption" @click.stop="openEdit(img)">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="card-action-btn" title="Copy URL" @click.stop="copyUrl(img)">
              <svg viewBox="0 0 24 24" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            </button>
            <button class="card-action-btn danger" title="Delete" @click.stop="handleDelete(img)">
              <svg viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>

          <!-- Category tag -->
          <div v-if="img.category" class="card-tag">{{ img.category }}</div>
        </div>

        <div class="card-footer">
          <div class="card-caption" :title="img.caption || img.title || ''">
            {{ img.caption || img.title || 'Untitled' }}
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Empty state ===== -->
    <div v-else-if="!images.length" class="empty-state-rich">
      <div class="empty-icon">🖼️</div>
      <h4>Your gallery is empty</h4>
      <p>Upload your first image to showcase your café, food, and moments on the landing page.</p>
      <base-button text="⇪ Upload your first image" variant="btn-primary" :on-click="openUpload"></base-button>
    </div>
    <div v-else class="empty-state-rich">
      <div class="empty-icon">🔍</div>
      <h4>No images in this category</h4>
      <p>Try a different filter, or upload a new image with this category.</p>
      <button class="btn btn-ghost" @click="activeFilter = ''">Show all</button>
    </div>

    <!-- ===== Add by URL modal ===== -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>Add Image by URL</h3>
        <p class="modal-sub">Paste an external image URL</p>
        <div class="form-group"><label>Image URL</label><input v-model="form.url" placeholder="https://..." @keyup.enter="saveItem" /></div>
        <div class="form-group"><label>Caption / Title</label><input v-model="form.caption" @keyup.enter="saveItem" /></div>
        <div class="form-group">
          <label>Category</label>
          <select v-model="form.category" class="select">
            <option value="">General</option>
            <option value="food">Food</option>
            <option value="interior">Interior</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <base-button text="Add" variant="btn-primary" :on-click="saveItem" loading-label="Adding..." success-label="Added ✓" error-label="Failed"></base-button>
        </div>
      </div>
    </div>

    <!-- ===== Edit caption modal ===== -->
    <div class="modal-overlay" v-if="showEditModal" @click.self="showEditModal=false">
      <div class="modal">
        <h3>Edit Image</h3>
        <p class="modal-sub">Update caption and category</p>
        <div v-if="editingImg" class="edit-preview">
          <img :src="resolveUrl(editingImg.url)" :alt="editingImg.caption||''" />
        </div>
        <div class="form-group"><label>Caption / Title</label><input v-model="editForm.caption" @keyup.enter="saveEdit" /></div>
        <div class="form-group">
          <label>Category</label>
          <select v-model="editForm.category" class="select">
            <option value="">General</option>
            <option value="food">Food</option>
            <option value="interior">Interior</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showEditModal=false">Cancel</button>
          <base-button text="Save changes" variant="btn-primary" :on-click="saveEdit" loading-label="Saving..." success-label="Saved ✓" error-label="Failed"></base-button>
        </div>
      </div>
    </div>

    <!-- ===== Upload from device modal ===== -->
    <div class="modal-overlay" v-if="showUploadModal" @click.self="closeUpload">
      <div class="modal upload-modal">
        <h3>Upload Images to R2</h3>
        <p class="modal-sub">Upload from your device — stored in Cloudflare R2 and added to your gallery.</p>

        <!-- Drop zone / file picker -->
        <div v-if="!uploadedUrl && !uploading" class="upload-dropzone"
             @click="triggerFileInput"
             @dragover.prevent="dragActive = true"
             @dragleave.prevent="dragActive = false"
             @drop.prevent="handleDrop"
             :class="{ 'drag-active': dragActive }">
          <input ref="fileInputRef" type="file" accept="image/*" multiple style="display:none" @change="handleFileSelect" />
          <div class="drop-icon">⇪</div>
          <div class="drop-title">Click to browse or drop images here</div>
          <div class="drop-hint">JPG, PNG, WebP, GIF · up to 10MB each · multiple files supported</div>
        </div>

        <!-- Uploading state -->
        <div v-if="uploading" class="upload-progress">
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" :style="{ width: uploadProgress + '%' }"></div>
          </div>
          <div class="progress-label">{{ uploadProgress < 100 ? 'Uploading… ' + uploadProgress + '%' : 'Finalizing…' }}</div>
        </div>

        <!-- Preview + metadata form -->
        <div v-if="uploadedUrl">
          <div class="upload-preview">
            <img :src="uploadedUrl" alt="preview" />
          </div>
          <div class="form-group" style="margin-top:12px">
            <label>R2 URL</label>
            <div class="url-row">
              <input :value="uploadedUrl" readonly class="url-readonly" />
              <button class="btn btn-ghost btn-sm" @click="copyToClipboard(uploadedUrl)">Copy</button>
            </div>
          </div>
          <div class="form-group"><label>Caption / Title</label><input v-model="uploadForm.caption" placeholder="e.g. Latte art at our Bole Road café" @keyup.enter="saveUploaded" /></div>
          <div class="form-group">
            <label>Category</label>
            <select v-model="uploadForm.category" class="select">
              <option value="">General</option>
              <option value="food">Food</option>
              <option value="interior">Interior</option>
              <option value="event">Event</option>
            </select>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeUpload">Cancel</button>
            <button class="btn btn-ghost" @click="resetForAnother">Upload another</button>
            <base-button text="Add to Gallery" variant="btn-primary" :on-click="saveUploaded" loading-label="Adding..." success-label="Added ✓" error-label="Failed"></base-button>
          </div>
        </div>

        <!-- Error state -->
        <div v-if="uploadError" class="upload-error">{{ uploadError }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPost, apiUpload } from '../api'
import { useToast } from '../composables/useToast'

const { toast, success: toastOk, error: toastErr, info: toastInfo } = useToast()
const SITE_ORIGIN = 'https://www.fufutcoffee.com'

/**
 * Source of truth
 * ----------------
 * The gallery is stored inside the public /api/content object (KV-backed on
 * the fufut-coffee Pages Function). The Worker's /api/gallery endpoint is
 * append-only — it can't delete or update, only push new entries — so we
 * ignore it for mutations and treat /api/content as canonical.
 *
 * Flow for every mutation (add / edit / delete / bulk-delete):
 *   1. Load /api/content (full object — never blank, abort if empty)
 *   2. Compute the new gallery array locally
 *   3. Replace content.gallery and POST /api/save-content
 *   4. Update local `images` ref from the saved array
 */
const images   = ref([])
const loading  = ref(true)
const showModal = ref(false)
const form      = ref({ url: '', caption: '', category: '' })
const syncing   = ref(false)
const syncMsg   = ref(null)

// === Filter + sort state ===
const activeFilter = ref('')
const sortBy       = ref('newest')
const categories = [
  { value: '',        label: 'All' },
  { value: 'food',    label: 'Food' },
  { value: 'interior',label: 'Interior' },
  { value: 'event',   label: 'Event' },
]

// === Selection mode ===
const selectMode = ref(false)
const selected   = ref(new Set())

// === Edit modal ===
const showEditModal = ref(false)
const editingImg    = ref(null)
const editForm      = ref({ caption: '', category: '' })

// === Upload state ===
const showUploadModal = ref(false)
const uploading       = ref(false)
const uploadProgress  = ref(0)
const uploadedUrl     = ref('')
const uploadError     = ref('')
const uploadForm      = ref({ caption: '', category: '' })
const dragActive      = ref(false)
const fileInputRef    = ref(null)

/** Resolve relative asset paths (e.g. assets/foo.jpg) to absolute landing-page URLs */
function resolveUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url
  // /api/images/... paths live on the admin origin
  if (url.startsWith('/api/')) return url
  return SITE_ORIGIN + '/' + url.replace(/^\//, '')
}

function getKey(img) {
  return img.id || img.url
}

function onImgError(e) {
  const t = e.target
  t.style.display = 'none'
  if (t.parentNode) t.parentNode.classList.add('img-broken')
}

/** Generate a stable, unique id for new gallery entries */
function makeId() {
  return 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
}

onMounted(loadData)

/**
 * Load gallery from /api/content (the canonical source).
 * We don't read from /api/gallery on the Worker because it's append-only and
 * accumulates junk (delete markers, dupes, empty entries) that we can't remove.
 */
async function loadData() {
  loading.value = true
  try {
    const content = await apiGet('content')
    const raw = (content && Array.isArray(content.gallery)) ? content.gallery : []
    // Normalize: ensure each entry has id + url; drop junk
    images.value = raw
      .filter(g => g && (g.url || g.src) && !(g.url || '').startsWith('__'))
      .map(g => {
        const url = g.url || g.src
        // Pull caption from caption/title, category from category/desc
        const caption = g.caption || g.title || ''
        const category = g.category || (g.desc && ['food','interior','event'].includes(g.desc) ? g.desc : '')
        return {
          id: g.id || makeId(),
          url,
          caption,
          category,
          // Keep original title/desc so syncToContent can map back if needed
          title: g.title || caption,
          desc: g.desc || ''
        }
      })
  } catch (e) {
    images.value = []
    toastErr('Could not load gallery from server')
  } finally {
    loading.value = false
  }
}

const filteredImages = computed(() => {
  let list = images.value
  if (activeFilter.value) {
    list = list.filter(img => (img.category || '') === activeFilter.value)
  }
  const arr = [...list]
  if (sortBy.value === 'newest') {
    arr.sort((a, b) => String(b.id).localeCompare(String(a.id)))
  } else if (sortBy.value === 'oldest') {
    arr.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  } else if (sortBy.value === 'caption') {
    arr.sort((a, b) => (a.caption || a.title || '').localeCompare(b.caption || b.title || ''))
  }
  return arr
})

function countByCategory(cat) {
  return images.value.filter(img => (img.category || '') === cat).length
}

// === Selection ===
function toggleSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) selected.value = new Set()
}

function onCardClick(img) {
  if (!selectMode.value) return
  const k = getKey(img)
  const s = new Set(selected.value)
  if (s.has(k)) s.delete(k); else s.add(k)
  selected.value = s
}

async function bulkDelete() {
  if (!selected.value.size) return
  if (!confirm(`Delete ${selected.value.size} image(s)? This cannot be undone.`)) return
  const idsToDelete = new Set(selected.value)
  const newImages = images.value.filter(img => !idsToDelete.has(getKey(img)))
  const ok = await saveGallery(newImages, 'bulk delete')
  if (ok) {
    selected.value = new Set()
    selectMode.value = false
    toastOk(`Deleted ${idsToDelete.size} image(s)`)
  }
}

// === Add by URL ===
function openAdd() {
  form.value = { url: '', caption: '', category: '' }
  showModal.value = true
}

async function saveItem() {
  const url = (form.value.url || '').trim()
  if (!url) {
    toastErr('Please enter an image URL')
    throw new Error('empty url')
  }
  const newItem = {
    id: makeId(),
    url,
    caption: form.value.caption || '',
    category: form.value.category || '',
    title: form.value.caption || '',
    desc: ''
  }
  const newImages = [...images.value, newItem]
  const ok = await saveGallery(newImages, 'add by URL')
  if (ok) {
    toastOk('Image added')
    showModal.value = false
  } else {
    throw new Error('save failed')
  }
}

// === Edit ===
function openEdit(img) {
  editingImg.value = img
  editForm.value = { caption: img.caption || img.title || '', category: img.category || '' }
  showEditModal.value = true
}

async function saveEdit() {
  if (!editingImg.value) return
  const target = editingImg.value
  const newImages = images.value.map(img =>
    getKey(img) === getKey(target)
      ? { ...img, caption: editForm.value.caption, category: editForm.value.category, title: editForm.value.caption }
      : img
  )
  const ok = await saveGallery(newImages, 'edit')
  if (ok) {
    toastOk('Image updated')
    showEditModal.value = false
  } else {
    throw new Error('save failed')
  }
}

async function copyUrl(img) {
  await copyToClipboard(resolveUrl(img.url))
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    toastOk('URL copied')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); toastOk('URL copied') } catch { toastErr('Copy failed') }
    document.body.removeChild(ta)
  }
}

// === Upload flow ===
function openUpload() {
  resetUploadState()
  showUploadModal.value = true
}

function resetUploadState() {
  uploadedUrl.value   = ''
  uploading.value     = false
  uploadProgress.value = 0
  uploadError.value   = ''
  uploadForm.value    = { caption: '', category: '' }
}

function closeUpload() {
  showUploadModal.value = false
  resetUploadState()
}

function resetForAnother() {
  uploadedUrl.value   = ''
  uploading.value     = false
  uploadProgress.value = 0
  uploadError.value   = ''
  uploadForm.value    = { caption: '', category: '' }
}

function triggerFileInput() {
  if (fileInputRef.value) fileInputRef.value.click()
}

function handleFileSelect(e) {
  const files = e.target.files
  if (!files || !files.length) return
  startUpload(files[0])
  e.target.value = ''
}

function handleDrop(e) {
  dragActive.value = false
  const files = e.dataTransfer.files
  if (!files || !files.length) return
  startUpload(files[0])
}

async function startUpload(file) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    uploadError.value = 'Please choose an image file (JPG, PNG, WebP, or GIF)'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    uploadError.value = 'Image is too large — max 10MB'
    return
  }

  uploading.value     = true
  uploadProgress.value = 0
  uploadError.value   = ''
  uploadedUrl.value   = ''

  try {
    const res = await apiUpload(file, (pct) => {
      uploadProgress.value = Math.min(99, Math.round(pct))
    })
    if (!res || !res.url) throw new Error('Upload returned no URL')
    uploadProgress.value = 100
    uploadedUrl.value = res.url
    toastOk('Image uploaded to R2')
  } catch (e) {
    uploadError.value = 'Upload failed: ' + (e && e.message || 'unknown error') + '. Check your connection and try again.'
  } finally {
    uploading.value = false
  }
}

async function saveUploaded() {
  if (!uploadedUrl.value) {
    uploadError.value = 'No image uploaded yet'
    throw new Error('no upload')
  }
  const newItem = {
    id: makeId(),
    url: uploadedUrl.value,
    caption: uploadForm.value.caption || '',
    category: uploadForm.value.category || '',
    title: uploadForm.value.caption || '',
    desc: ''
  }
  const newImages = [...images.value, newItem]
  const ok = await saveGallery(newImages, 'upload')
  if (ok) {
    toastOk('Image added to gallery')
    showUploadModal.value = false
    resetUploadState()
  } else {
    throw new Error('save failed')
  }
}

async function handleDelete(img) {
  if (!confirm('Delete this image? This cannot be undone.')) return
  const key = getKey(img)
  const newImages = images.value.filter(i => getKey(i) !== key)
  const ok = await saveGallery(newImages, 'delete')
  if (ok) toastOk('Deleted')
  else toastErr('Failed to delete image')
}

/**
 * Core save: replace /api/content.gallery with `newImages` and persist via
 * /api/save-content. Also updates local `images` ref on success.
 *
 * Returns true on success, false on failure.
 */
async function saveGallery(newImages, opLabel) {
  syncing.value = true
  syncMsg.value = null
  try {
    // 1. Load existing content so we don't wipe other fields.
    let content
    try {
      content = await apiGet('content')
    } catch (e) {
      syncMsg.value = { ok: false, text: 'Could not load existing landing content — sync aborted to prevent data loss. Try again in a moment.' }
      return false
    }
    if (!content || typeof content !== 'object' || Object.keys(content).length === 0) {
      syncMsg.value = { ok: false, text: 'Landing content returned empty — sync aborted to prevent data loss.' }
      return false
    }

    // 2. Replace gallery field. Map to {url,title,desc} which is what the
    // landing page's rebuildGallery expects.
    content.gallery = newImages
      .filter(img => img && (img.url || img.src))
      .map(img => ({
        url:   img.url || img.src,
        title: img.caption || img.title || '',
        desc:  img.category || img.desc || ''
      }))

    // 3. Save back
    const res = await apiPost('save-content', content)
    if (res && res.ok) {
      // 4. Update local state to match what we just saved
      images.value = newImages.map(img => ({
        ...img,
        title: img.caption || img.title || '',
        desc: img.category || img.desc || ''
      }))
      syncMsg.value = { ok: true, text: `✓ Gallery synced to landing page (${opLabel})` }
      return true
    } else {
      syncMsg.value = { ok: false, text: 'Could not sync to landing page' }
      return false
    }
  } catch (e) {
    syncMsg.value = { ok: false, text: 'Could not sync to landing page — ' + (e && e.message || 'unknown error') }
    return false
  } finally {
    syncing.value = false
    setTimeout(() => { syncMsg.value = null }, 4000)
  }
}
</script>

<style scoped>
.gallery-admin { display: block; }

/* ===== Toolbar ===== */
.gallery-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 14px; flex-wrap: wrap; gap: 10px;
}
.toolbar-left { display: flex; align-items: center; gap: 10px; }
.toolbar-left h3 { font-size: 1rem; color: var(--text-heading); font-weight: 600; margin: 0; }
.toolbar-right { display: flex; gap: 8px; flex-wrap: wrap; }

.count-pill {
  font-size: .68rem; font-weight: 600;
  color: var(--text-muted);
  background: var(--neutral-50);
  padding: 3px 10px; border-radius: 999px;
  border: 1px solid var(--border);
}

/* ===== Filter chips ===== */
.filter-row {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 14px; flex-wrap: wrap;
}
.filter-spacer { flex: 1; }
.filter-chip {
  appearance: none;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-body);
  font-size: .76rem; font-weight: 500;
  padding: 6px 14px; border-radius: 999px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  transition: all .15s ease;
}
.filter-chip:hover { border-color: var(--primary); color: var(--primary); }
.filter-chip.active {
  background: var(--primary); border-color: var(--primary); color: #fff;
}
.filter-count {
  font-size: .68rem;
  background: rgba(0,0,0,.06);
  color: inherit;
  padding: 1px 7px; border-radius: 999px;
  font-weight: 600;
}
.filter-chip.active .filter-count {
  background: rgba(255,255,255,.25);
}
.sort-select {
  appearance: none;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  color: var(--text-body);
  font-size: .76rem;
  padding: 6px 28px 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

/* ===== Sync banner ===== */
.sync-banner {
  font-size: .82rem; margin-bottom: 12px;
  padding: 8px 14px; border-radius: 8px;
  display: flex; align-items: center; gap: 8px;
}
.sync-banner.syncing {
  background: var(--teal-50, #EDF8F8); color: var(--primary);
}
.sync-banner.sync-ok {
  background: #E6F9F0; color: var(--success);
}
.sync-banner.sync-err {
  background: #FEF2F2; color: var(--danger);
}
.sync-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: var(--primary); animation: pulse 1s infinite;
}

/* ===== Gallery grid ===== */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}

.gallery-card {
  position: relative;
  border-radius: var(--radius-md, 10px);
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  transition: all .2s ease;
  cursor: default;
}
.gallery-card:hover {
  border-color: var(--border-strong);
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
  transform: translateY(-2px);
}
.gallery-card.select-mode { cursor: pointer; }
.gallery-card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(15,123,120,.18);
}

.card-image-wrap {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--neutral-50);
  overflow: hidden;
}
.card-image-wrap.img-broken {
  background: linear-gradient(135deg, var(--teal-50, #EDF8F8), var(--neutral-100));
}
.card-image-wrap img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform .4s ease;
}
.gallery-card:hover .card-image-wrap img {
  transform: scale(1.05);
}

/* Card actions overlay */
.card-actions {
  position: absolute; top: 8px; right: 8px;
  display: flex; gap: 4px;
  opacity: 0; transform: translateY(-4px);
  transition: all .18s ease;
}
.gallery-card:hover .card-actions {
  opacity: 1; transform: translateY(0);
}
.card-action-btn {
  width: 30px; height: 30px;
  border: none; border-radius: 8px;
  background: rgba(7,55,53,.75);
  backdrop-filter: blur(6px);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all .15s ease;
}
.card-action-btn:hover {
  background: var(--primary);
  transform: scale(1.08);
}
.card-action-btn.danger:hover {
  background: var(--danger);
}

/* Category tag */
.card-tag {
  position: absolute; bottom: 8px; left: 8px;
  font-size: .65rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: .04em;
  background: rgba(7,55,53,.75);
  backdrop-filter: blur(6px);
  color: var(--gold-300, #E4CB99);
  padding: 3px 9px; border-radius: 6px;
}
.card-image-wrap:hover .card-tag { opacity: 0; transition: opacity .2s; }

/* Select checkbox */
.card-check {
  position: absolute; top: 8px; left: 8px;
  width: 24px; height: 24px;
  border: 2px solid rgba(255,255,255,.9);
  border-radius: 6px;
  background: rgba(7,55,53,.4);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  transition: all .15s ease;
}
.card-check.checked {
  background: var(--primary);
  border-color: var(--primary);
}

.card-footer {
  padding: 8px 12px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}
.card-caption {
  font-size: .78rem; color: var(--text-heading);
  font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ===== Skeleton ===== */
.skeleton-card {
  border-radius: var(--radius-md, 10px);
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
}
.skeleton-img {
  aspect-ratio: 4 / 3;
  background: linear-gradient(90deg, var(--neutral-50) 25%, var(--neutral-100) 50%, var(--neutral-50) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ===== Empty state ===== */
.empty-state-rich {
  grid-column: 1 / -1;
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
  padding: 60px 20px;
  background: var(--surface);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg, 14px);
}
.empty-state-rich .empty-icon {
  font-size: 2.6rem; margin-bottom: 14px;
  width: 72px; height: 72px;
  display: flex; align-items: center; justify-content: center;
  background: var(--neutral-50);
  border-radius: 50%;
}
.empty-state-rich h4 {
  font-size: 1rem; color: var(--text-heading);
  font-weight: 600; margin: 0 0 4px;
}
.empty-state-rich p {
  font-size: .84rem; color: var(--text-muted);
  margin: 0 0 16px; max-width: 320px;
}

/* ===== Upload modal ===== */
.upload-modal { width: 580px; }

.upload-dropzone {
  border: 2px dashed var(--border-strong);
  border-radius: 12px;
  padding: 44px 20px;
  text-align: center;
  cursor: pointer;
  transition: all .18s ease;
  background: var(--neutral-50);
}
.upload-dropzone:hover,
.upload-dropzone.drag-active {
  border-color: var(--primary);
  background: rgba(15,123,120,.06);
  transform: translateY(-1px);
}
.drop-icon {
  font-size: 2.6rem; margin-bottom: 12px;
  color: var(--primary);
}
.drop-title {
  font-weight: 600; color: var(--text-heading);
  margin-bottom: 6px; font-size: .92rem;
}
.drop-hint {
  font-size: .76rem; color: var(--text-muted);
}

.upload-progress {
  padding: 36px 20px;
  text-align: center;
}
.progress-bar-wrap {
  width: 100%; height: 8px;
  background: var(--neutral-100);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 12px;
}
.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--accent, #D6B36A));
  border-radius: 999px;
  transition: width .25s ease;
}
.progress-label {
  font-size: .82rem; color: var(--text-muted);
}

.upload-preview {
  border-radius: 12px;
  overflow: hidden;
  background: var(--neutral-50);
  aspect-ratio: 4 / 3;
  border: 1px solid var(--border);
}
.upload-preview img {
  width: 100%; height: 100%; object-fit: cover;
}

.url-row { display: flex; gap: 8px; }
.url-row .url-readonly {
  flex: 1;
  font-family: monospace; font-size: .76rem;
  background: var(--neutral-50) !important;
  color: var(--text-muted);
}

.edit-preview {
  border-radius: 10px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: var(--neutral-50);
  margin-bottom: 14px;
  border: 1px solid var(--border);
}
.edit-preview img {
  width: 100%; height: 100%; object-fit: cover;
}

.upload-error {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #FEF2F2;
  color: var(--danger);
  font-size: .82rem;
  border: 1px solid #FECACA;
}

/* ===== Transitions ===== */
.fade-enter-active, .fade-leave-active { transition: opacity .25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

@media (max-width: 600px) {
  .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .gallery-toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-right { justify-content: flex-end; }
}
</style>
