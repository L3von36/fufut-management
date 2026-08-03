<template>
  <div>
    <div class="table-toolbar">
      <h3>Gallery</h3>
      <div style="display:flex;gap:8px">
        <base-button text="⇪ Upload from Device" variant="btn-primary btn-sm" :on-click="openUpload"></base-button>
        <base-button text="+ Add by URL" variant="btn-secondary btn-sm" :on-click="openAdd"></base-button>
      </div>
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

    <!-- Add by URL modal -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>Add Image by URL</h3>
        <p class="modal-sub">Paste an external image URL</p>
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

    <!-- Upload from device modal -->
    <div class="modal-overlay" v-if="showUploadModal" @click.self="closeUpload">
      <div class="modal">
        <h3>Upload Image to R2</h3>
        <p class="modal-sub">Upload an image from your device — it will be stored in Cloudflare R2 and added to the gallery.</p>

        <!-- Drop zone / file picker -->
        <div v-if="!uploadedUrl && !uploading" class="upload-dropzone"
             @click="triggerFileInput"
             @dragover.prevent="dragActive = true"
             @dragleave.prevent="dragActive = false"
             @drop.prevent="handleDrop"
             :class="{ 'drag-active': dragActive }">
          <input ref="fileInputRef" type="file" accept="image/*" style="display:none" @change="handleFileSelect" />
          <div style="font-size:2.4rem;margin-bottom:8px">⇪</div>
          <div style="font-weight:600;margin-bottom:4px">Click to browse or drop an image here</div>
          <div style="font-size:.78rem;color:var(--muted)">JPG, PNG, WebP, GIF · up to 10MB</div>
        </div>

        <!-- Uploading state -->
        <div v-if="uploading" class="upload-progress">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="spinner"></span>
            <span>Uploading {{ uploadProgress > 0 ? uploadProgress + '%' : '…' }}</span>
          </div>
        </div>

        <!-- Preview + metadata form -->
        <div v-if="uploadedUrl">
          <div class="upload-preview">
            <img :src="uploadedUrl" alt="preview" />
          </div>
          <div class="form-group" style="margin-top:12px"><label>R2 URL (read-only)</label><input :value="uploadedUrl" readonly style="font-family:monospace;font-size:.78rem;background:var(--neutral-100)" /></div>
          <div class="form-group"><label>Caption / Title</label><input v-model="uploadForm.caption" placeholder="e.g. Latte art at our Bole Road café" /></div>
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
import { ref, onMounted } from 'vue'
import { apiGet, apiPost, apiDelete, apiUpload } from '../api'
import { useToast } from '../composables/useToast'

const { toast, success: toastOk, error: toastErr, info: toastInfo } = useToast()
const SITE_ORIGIN = 'https://www.fufutcoffee.com'
const images   = ref([])
const showModal = ref(false)
const form      = ref({ url: '', caption: '', category: '' })
const syncing   = ref(false)
const syncMsg   = ref(null)

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
  return SITE_ORIGIN + '/' + url.replace(/^\//, '')
}

onMounted(loadData)

async function loadData() {
  try {
    const raw = await apiGet('gallery') || []
    // Filter out entries without a valid URL, or with non-image marker URLs
    images.value = raw.filter(img => img.url && !img.url.startsWith('__'))
  } catch {
    images.value = []
  }
}

function openAdd() {
  form.value = { url: '', caption: '', category: '' }
  showModal.value = true
}

// === Upload flow ===
function openUpload() {
  uploadedUrl.value   = ''
  uploading.value     = false
  uploadProgress.value = 0
  uploadError.value   = ''
  uploadForm.value    = { caption: '', category: '' }
  showUploadModal.value = true
}

function closeUpload() {
  showUploadModal.value = false
  uploadedUrl.value   = ''
  uploading.value     = false
  uploadProgress.value = 0
  uploadError.value   = ''
}

function triggerFileInput() {
  if (fileInputRef.value) fileInputRef.value.click()
}

function handleFileSelect(e) {
  const file = e.target.files && e.target.files[0]
  if (file) startUpload(file)
  // reset so selecting the same file again still fires change
  e.target.value = ''
}

function handleDrop(e) {
  dragActive.value = false
  const file = e.dataTransfer.files && e.dataTransfer.files[0]
  if (file) startUpload(file)
}

async function startUpload(file) {
  // Client-side validation
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

  // Simulate progress while uploading (XHR would give real progress, but fetch doesn't)
  const progressInterval = setInterval(() => {
    if (uploadProgress.value < 90) uploadProgress.value += 5
  }, 200)

  try {
    const res = await apiUpload(file)
    if (!res || !res.url) throw new Error('Upload returned no URL')
    uploadedUrl.value = res.url
    uploadProgress.value = 100
    toastOk('Image uploaded to R2')
  } catch (e) {
    uploadError.value = 'Upload failed: ' + (e && e.message || 'unknown error') + '. Check your connection and try again.'
  } finally {
    clearInterval(progressInterval)
    uploading.value = false
  }
}

async function saveUploaded() {
  if (!uploadedUrl.value) {
    uploadError.value = 'No image uploaded yet'
    throw new Error('no upload')
  }
  try {
    await apiPost('gallery', {
      url: uploadedUrl.value,
      caption: uploadForm.value.caption,
      category: uploadForm.value.category
    })
    toastOk('Image added to gallery')
    showUploadModal.value = false
    await loadData()
    await syncToContent()
  } catch (e) {
    uploadError.value = 'Failed to add to gallery: ' + (e && e.message || 'unknown error')
    throw e
  }
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
    toastErr('Cannot delete — this image has no ID')
    return
  }
  if (!confirm('Delete this image?')) return
  try {
    // Worker does not support DELETE /api/gallery/:id (returns 404).
    // Must use POST with _method override — but POST also creates a
    // duplicate entry, so we reload after to get the clean list.
    await apiPost('gallery', { id: img.id, _method: 'DELETE' })
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
    // 1. Load existing content so we don't wipe other fields.
    // If this fails, ABORT — saving with an empty object would overwrite
    // hero/story/signatureCoffee/etc. with empty values and wipe the site.
    let content
    try {
      content = await apiGet('content')
    } catch (e) {
      syncMsg.value = { ok: false, text: 'Could not load existing landing content — sync aborted to prevent data loss. Try again in a moment.' }
      return
    }
    if (!content || typeof content !== 'object' || Object.keys(content).length === 0) {
      // Defensive: if /api/content returned an empty object, treat it as a failure
      // rather than risk overwriting valid KV data with just {gallery}.
      syncMsg.value = { ok: false, text: 'Landing content returned empty — sync aborted to prevent data loss.' }
      return
    }

    // 2. Map gallery rows → { url, title, desc } that applyContent expects
    content.gallery = images.value
      .filter(img => img.url)
      .map(img => ({
        url:   img.url,
        title: img.caption || img.title || '',
        desc:  img.category || img.desc || ''
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
<style scoped>
.upload-dropzone {
  border: 2px dashed var(--border, #d1d5db);
  border-radius: 10px;
  padding: 36px 20px;
  text-align: center;
  cursor: pointer;
  transition: all .15s ease;
  background: var(--neutral-50, #fafafa);
}
.upload-dropzone:hover,
.upload-dropzone.drag-active {
  border-color: var(--primary, #0F7B78);
  background: var(--primary-light, rgba(15,123,120,.06));
}
.upload-progress {
  padding: 28px 20px;
  text-align: center;
  color: var(--text-muted, #666);
  font-size: .9rem;
}
.upload-preview {
  border-radius: 10px;
  overflow: hidden;
  background: var(--neutral-100, #f3f4f6);
  aspect-ratio: 4/3;
  display: flex;
  align-items: center;
  justify-content: center;
}
.upload-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.upload-error {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 6px;
  background: #fef2f2;
  color: #dc2626;
  font-size: .82rem;
  border: 1px solid #fecaca;
}
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--border, #d1d5db);
  border-top-color: var(--primary, #0F7B78);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
</style>
