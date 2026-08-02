<template>
  <div>
    <div class="table-toolbar">
      <h3>Gallery</h3>
      <base-button text="+ Add Image" variant="btn-primary btn-sm" :on-click="openAdd"></base-button>
    </div>

    <!-- Sync status -->
    <div v-if="syncing" style="font-size:.8rem;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:6px">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--primary);animation:pulse 1s infinite"></span>
      Syncing to landing page…
    </div>
    <div v-if="syncMsg" style="font-size:.8rem;margin-bottom:10px;padding:6px 10px;border-radius:6px"
         :style="syncMsg.ok ? 'background:var(--success-light,#e6f9f0);color:var(--success,#16a34a)' : 'background:var(--danger-light,#fef2f2);color:var(--danger,#dc2626)'">
      {{ syncMsg.text }}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      <div v-for="img in images" :key="img.id || img.url || Math.random()"
           style="position:relative;border-radius:var(--radius-md);overflow:hidden;aspect-ratio:4/3;background:var(--neutral-100)">
        <img :src="resolveUrl(img.url)" :alt="img.caption||img.title||''" style="width:100%;height:100%;object-fit:cover" @error="$event.target.style.display='none'" />
        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.6));padding:8px 10px;color:#fff;font-size:.72rem">
          {{ img.caption || img.title || '' }}
        </div>
        <base-button text="✕" variant="btn-sm" extra-class="gallery-delete-btn" :on-click="() => handleDelete(img)" loading-label="..." success-label="✓"></base-button>
      </div>
      <div v-if="!images.length" class="empty-state" style="grid-column:1/-1;padding:60px">
        <div class="empty-state-icon">🖼️</div>
        <div>No images in gallery</div>
      </div>
    </div>

    <!-- Add modal -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>Add Image</h3>
        <p class="modal-sub">Add an image URL to the gallery</p>
        <div class="form-group"><label>Image URL</label><input v-model="form.url" placeholder="https://..." /></div>
        <div class="form-group"><label>Caption / Title</label><input v-model="form.caption" /></div>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiGet, apiPost, apiDelete } from '../api'
import { useToast } from '../composables/useToast'

const { toast, success: toastOk, error: toastErr, info: toastInfo } = useToast()
const SITE_ORIGIN = 'https://www.fufutcoffee.com'
const images   = ref([])
const showModal = ref(false)
const form      = ref({ url: '', caption: '', category: '' })
const syncing   = ref(false)
const syncMsg   = ref(null)

/** Resolve relative asset paths (e.g. assets/foo.jpg) to absolute landing-page URLs */
function resolveUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url
  return SITE_ORIGIN + '/' + url.replace(/^\//, '')
}

onMounted(loadData)

async function loadData() {
  try {
    images.value = await apiGet('gallery') || []
  } catch {
    images.value = []
  }
}

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
  try {
    await apiPost('gallery', { ...form.value, url })
    toastOk('Image added')
    showModal.value = false
    await loadData()
    await syncToContent()
  } catch (e) {
    if (e.message !== 'empty url') toastErr('Failed to add image')
    throw e
  }
}

async function handleDelete(img) {
  if (!img.id) {
    toastErr('Cannot delete — this image has no ID (server bug)')
    return
  }
  if (!confirm('Delete this image?')) return
  try {
    await apiDelete('gallery/' + img.id)
    toastOk('Deleted')
    await loadData()
    await syncToContent()
  } catch (e) {
    toastErr('Failed to delete image')
  }
}

/**
 * Push the current gallery list into the public /api/content object so the
 * landing page (which can't authenticate) can read it via /api/content.
 */
async function syncToContent() {
  syncing.value = true
  syncMsg.value = null
  try {
    // 1. Load existing content so we don't wipe other fields
    let content = {}
    try { content = await apiGet('content') } catch {}

    // 2. Map gallery rows → { url, title, desc } that applyContent expects
    content.gallery = images.value
      .filter(img => img.url)
      .map(img => ({
        url:   img.url,
        title: img.caption || '',
        desc:  img.category || ''
      }))

    // 3. Save back
    const res = await apiPost('save-content', content)
    if (res && res.ok) {
      syncMsg.value = { ok: true, text: '✓ Gallery synced to landing page' }
    } else {
      syncMsg.value = { ok: false, text: 'Saved to gallery but could not sync to landing page' }
    }
  } catch {
    syncMsg.value = { ok: false, text: 'Could not sync to landing page — changes are still saved in the gallery' }
  } finally {
    syncing.value = false
    setTimeout(() => { syncMsg.value = null }, 4000)
  }
}
</script>
