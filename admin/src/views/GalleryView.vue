<template>
  <div>
    <div class="table-toolbar">
      <h3>Gallery</h3>
      <button class="btn btn-primary btn-sm" @click="openAdd">+ Add Image</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      <div v-for="img in images" :key="img.id" style="position:relative;border-radius:var(--radius-md);overflow:hidden;aspect-ratio:4/3;background:var(--neutral-100)">
        <img :src="img.url" :alt="img.caption||''" style="width:100%;height:100%;object-fit:cover" />
        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.6));padding:8px 10px;color:#fff;font-size:.72rem">{{ img.caption||'' }}</div>
        <button class="btn btn-sm" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.5);color:#fff;border:none;padding:4px 8px;border-radius:4px" @click="handleDelete(img)">✕</button>
      </div>
      <div v-if="!images.length" class="empty-state" style="grid-column:1/-1;padding:60px">
        <div class="empty-state-icon">🖼️</div><div>No images in gallery</div>
      </div>
    </div>
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>Add Image</h3>
        <p class="modal-sub">Add an image URL to the gallery</p>
        <div class="form-group"><label>Image URL</label><input v-model="form.url" placeholder="https://..." /></div>
        <div class="form-group"><label>Caption</label><input v-model="form.caption" /></div>
        <div class="form-group"><label>Category</label><select v-model="form.category" class="select"><option value="">General</option><option value="food">Food</option><option value="interior">Interior</option><option value="event">Event</option></select></div>
        <div class="modal-actions"><button class="btn btn-secondary" @click="showModal=false">Cancel</button><button class="btn btn-primary" @click="saveItem">Add</button></div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import { apiGet, apiPost, apiDelete } from '../api'
import { useToast } from '../composables/useToast'
const { toast } = useToast()
const images = ref([]); const showModal = ref(false)
const form = ref({ url:'', caption:'', category:'' })
onMounted(loadData)
async function loadData() { try { images.value = await apiGet('gallery') || [] } catch { images.value = [] } }
function openAdd() { form.value={url:'',caption:'',category:''}; showModal.value=true }
async function saveItem() { try { await apiPost('gallery',form.value); toast('Added'); showModal.value=false; await loadData() } catch { toast('Failed','error') } }
async function handleDelete(img) { if(!confirm('Delete?'))return; try { await apiDelete('gallery/'+img.id); toast('Deleted'); await loadData() } catch { toast('Failed','error') } }
</script>
