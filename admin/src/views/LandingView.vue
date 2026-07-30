<template>
  <div>
    <div class="table-toolbar">
      <h3>Landing Page Content</h3>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-outline" @click="exportContent">Download JSON</button>
        <button class="btn btn-sm btn-primary" @click="saveAll">Save All</button>
      </div>
    </div>

    <!-- Hero -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Hero Section</h3></div>
      <div class="form-group"><label>Amharic Text</label><input v-model="data.hero.amharic" /></div>
      <div class="form-group"><label>Headline</label><textarea v-model="data.hero.title" rows="2"></textarea></div>
      <div class="form-group"><label>Subtitle</label><textarea v-model="data.hero.subtitle" rows="2"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Primary Button</label><input v-model="data.hero.btn1" /></div>
        <div class="form-group"><label>Secondary Button</label><input v-model="data.hero.btn2" /></div>
      </div>
    </section>

    <!-- Brand Story -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Brand Story</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.story.eyebrow" /></div>
        <div class="form-group"><label>Title</label><input v-model="data.story.title" /></div>
      </div>
      <div class="form-group"><label>Paragraph 1</label><textarea v-model="data.story.p1" rows="3"></textarea></div>
      <div class="form-group"><label>Paragraph 2</label><textarea v-model="data.story.p2" rows="3"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Badge 1 Number</label><input v-model="data.story.badge1Num" /></div>
        <div class="form-group"><label>Badge 1 Label</label><input v-model="data.story.badge1Label" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Badge 2 Number</label><input v-model="data.story.badge2Num" /></div>
        <div class="form-group"><label>Badge 2 Label</label><input v-model="data.story.badge2Label" /></div>
      </div>
    </section>

    <!-- Stats -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Stats Counters</h3></div>
      <div v-for="(stat, i) in data.stats" :key="i" class="form-row" style="margin-bottom:8px">
        <div class="form-group"><label>Stat {{ i+1 }} Value</label><input v-model.number="stat.value" type="number" /></div>
        <div class="form-group"><label>Stat {{ i+1 }} Label</label><input v-model="stat.label" /></div>
      </div>
    </section>

    <!-- Ceremony -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Coffee Ceremony</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.ceremony.eyebrow" /></div>
        <div class="form-group"><label>Title</label><input v-model="data.ceremony.title" /></div>
      </div>
      <div class="form-group"><label>Description</label><textarea v-model="data.ceremony.desc" rows="2"></textarea></div>
      <div v-for="(step, i) in data.ceremony.steps" :key="i" class="form-row" style="margin-bottom:6px">
        <div class="form-group"><label>Step {{ i+1 }} Title</label><input v-model="step.title" /></div>
        <div class="form-group"><label>Step {{ i+1 }} Text</label><input v-model="step.text" /></div>
      </div>
      <div class="form-group"><label>CTA Button</label><input v-model="data.ceremony.cta" /></div>

      <!-- Ceremony Photo -->
      <div class="form-group" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label>Ceremony Photo URL</label>
        <input v-model="data.ceremony.image" placeholder="https://example.com/my-ceremony-photo.jpg" />
        <small style="color:var(--muted);font-size:.75rem;display:block;margin-top:4px">
          Replaces the default ceremony photo. Paste a direct public image URL (Cloudflare R2, Imgur, Google Photos public link, etc.).
        </small>
        <div v-if="data.ceremony.image" style="margin-top:8px;border-radius:8px;overflow:hidden;max-width:300px;border:1px solid var(--border)">
          <img :src="data.ceremony.image" alt="Ceremony preview" style="width:100%;height:160px;object-fit:cover;display:block" @error="e => e.target.style.display='none'" />
        </div>
      </div>
    </section>

    <!-- Gallery Images -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
        <h3>Gallery Images</h3>
        <button class="btn btn-sm btn-outline" @click="addGalleryItem">+ Add Image</button>
      </div>
      <small style="color:var(--muted);font-size:.75rem;display:block;margin-bottom:12px">
        These replace the landing page gallery. Add at least 5 images for the best layout.
        Use direct public image URLs — Cloudflare R2, Imgur, Unsplash, or any CDN link.
      </small>

      <div v-if="!data.gallery.length" style="text-align:center;padding:32px;color:var(--muted);border:1.5px dashed var(--border);border-radius:8px;margin-bottom:8px">
        No gallery images yet — click <strong>+ Add Image</strong> to add your first photo.
      </div>

      <div
        v-for="(img, i) in data.gallery"
        :key="i"
        style="display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--neutral-50)"
      >
        <!-- Thumbnail preview -->
        <div style="width:80px;height:60px;border-radius:6px;overflow:hidden;flex-shrink:0;background:var(--neutral-200);border:1px solid var(--border);display:flex;align-items:center;justify-content:center">
          <img
            v-if="img.url"
            :src="img.url"
            :alt="img.title||''"
            style="width:100%;height:100%;object-fit:cover;display:block"
            @error="e => e.target.style.display='none'"
          />
          <span v-else style="font-size:1.5rem">🖼️</span>
        </div>

        <!-- Fields -->
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">
          <input v-model="img.url" placeholder="Image URL (https://...)" style="width:100%" />
          <div style="display:flex;gap:8px">
            <input v-model="img.title" placeholder="Title (e.g. Warm Welcome)" style="flex:1;min-width:0" />
            <input v-model="img.desc"  placeholder="Short description" style="flex:2;min-width:0" />
          </div>
        </div>

        <!-- Reorder + delete -->
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button class="btn btn-sm btn-ghost" title="Move up"   @click="moveGalleryItem(i,-1)" :disabled="i===0">↑</button>
          <button class="btn btn-sm btn-ghost" title="Move down" @click="moveGalleryItem(i, 1)" :disabled="i===data.gallery.length-1">↓</button>
          <button class="btn btn-sm btn-ghost" title="Remove"    @click="removeGalleryItem(i)" style="color:var(--danger)">✕</button>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Footer</h3></div>
      <div class="form-group"><label>Brand Description</label><textarea v-model="data.footer.desc" rows="2"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Copyright Year</label><input v-model="data.footer.year" /></div>
        <div class="form-group"><label>Craft Line</label><input v-model="data.footer.craft" /></div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { useToast } from '../composables/useToast'
import { apiGet, apiPost } from '../api'

const { toast } = useToast()

const data = reactive({
  hero:     { amharic:'', title:'', subtitle:'', btn1:'', btn2:'' },
  story:    { eyebrow:'', title:'', p1:'', p2:'', badge1Num:'', badge1Label:'', badge2Num:'', badge2Label:'' },
  stats:    [{value:0,label:''},{value:0,label:''},{value:0,label:''},{value:0,label:''}],
  ceremony: { eyebrow:'', title:'', desc:'', steps:[{title:'',text:''},{title:'',text:''},{title:'',text:''}], cta:'', image:'' },
  gallery:  [],
  footer:   { desc:'', year:'2026', craft:'' }
})

async function loadContent() {
  try {
    const json = await apiGet('content')
    if (json.hero)     Object.assign(data.hero, json.hero)
    if (json.story)    Object.assign(data.story, json.story)
    if (json.stats && Array.isArray(json.stats)) {
      json.stats.forEach((s, i) => { if (data.stats[i]) Object.assign(data.stats[i], s) })
    }
    if (json.ceremony) Object.assign(data.ceremony, json.ceremony)
    if (Array.isArray(json.gallery)) {
      data.gallery.splice(0, data.gallery.length, ...json.gallery)
    }
    if (json.footer)   Object.assign(data.footer, json.footer)
  } catch {}
}
onMounted(loadContent)

async function saveAll() {
  try {
    const res = await apiPost('save-content', data)
    if (res.ok) toast('Content saved')
    else toast('Save failed', 'error')
  } catch { toast('Save failed', 'error') }
}

function exportContent() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'content.json'
  a.click()
}

// Gallery helpers
function addGalleryItem()      { data.gallery.push({ url: '', title: '', desc: '' }) }
function removeGalleryItem(i)  { data.gallery.splice(i, 1) }
function moveGalleryItem(i, d) {
  const j = i + d
  if (j < 0 || j >= data.gallery.length) return
  ;[data.gallery[i], data.gallery[j]] = [data.gallery[j], data.gallery[i]]
}
</script>
