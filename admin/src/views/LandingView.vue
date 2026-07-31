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
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Feature Bullets</label>
        <div class="form-row">
          <div class="form-group"><label>Feature 1</label><input v-model="data.story.feat1" placeholder="Single Origin Beans" /></div>
          <div class="form-group"><label>Feature 2</label><input v-model="data.story.feat2" placeholder="Ethically Sourced" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Feature 3</label><input v-model="data.story.feat3" placeholder="Open Daily 7AM–10PM" /></div>
          <div class="form-group"><label>Feature 4</label><input v-model="data.story.feat4" placeholder="Friendly Community" /></div>
        </div>
      </div>
    </section>

    <!-- Signature Coffee -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Signature Coffee</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.signatureCoffee.eyebrow" placeholder="Single Origin" /></div>
        <div class="form-group"><label>Section Title</label><input v-model="data.signatureCoffee.title" placeholder="Signature Coffee" /></div>
      </div>
      <div v-for="(card, i) in data.signatureCoffee.cards" :key="i" style="margin-top:16px;padding:14px;background:var(--bg-subtle,#f7f7f7);border-radius:8px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px">Coffee Card {{ i + 1 }}</div>
        <div class="form-row">
          <div class="form-group"><label>Name</label><input v-model="card.name" :placeholder="i===0?'Yirgacheffe Pour-Over':i===1?'Sidamo Espresso':'Guji Natural'" /></div>
          <div class="form-group"><label>Meta (Origin · Roast)</label><input v-model="card.meta" :placeholder="i===0?'Yirgacheffe · Light Roast':i===1?'Sidamo · Medium Roast':'Guji · Medium-Light Roast'" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Price (ETB)</label><input v-model="card.price" type="number" :placeholder="i===0?'90':i===1?'80':'95'" /></div>
          <div class="form-group"><label>Badge Label</label><input v-model="card.badge" placeholder="Single Origin" /></div>
        </div>
        <div class="form-group"><label>Flavor Notes (short — shown on card)</label><input v-model="card.flavor" :placeholder="i===0?'Jasmine, citrus, bergamot':i===1?'Dark chocolate, plum':'Blueberry, wine, honey'" /></div>
        <div class="form-group"><label>Full Description (shown in modal)</label><textarea v-model="card.desc" rows="2" /></div>
        <div class="form-group">
          <label>Image URL</label>
          <input v-model="card.image" :placeholder="i===0?'assets/coffee-yirgacheffe.jpg':i===1?'assets/coffee-sidamo.jpg':'assets/coffee-guji.jpg'" />
        </div>
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
        <div v-if="data.ceremony.image" style="margin-top:8px">
          <img :src="data.ceremony.image" alt="Ceremony preview"
               style="max-width:220px;border-radius:8px;border:1px solid var(--border)"
               @error="$event.target.style.display='none'" />
        </div>
      </div>
    </section>

    <!-- Gallery -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3>Gallery</h3>
        <button class="btn btn-sm btn-outline" @click="addGalleryItem">+ Add Photo</button>
      </div>
      <div v-if="data.gallery.length === 0" style="padding:16px;color:var(--text-muted);font-size:13px">
        No photos added yet. Click "+ Add Photo" to start.
      </div>
      <div v-for="(item, i) in data.gallery" :key="i"
           style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
        <img v-if="item.url" :src="item.url" style="width:64px;height:64px;object-fit:cover;border-radius:6px;flex-shrink:0"
             @error="$event.target.style.display='none'" />
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <input v-model="item.url"   placeholder="Image URL" style="width:100%" />
          <input v-model="item.title" placeholder="Caption (optional)" />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <button class="btn btn-sm btn-outline" @click="moveGalleryItem(i,-1)" :disabled="i===0">↑</button>
          <button class="btn btn-sm btn-outline" @click="moveGalleryItem(i,1)" :disabled="i===data.gallery.length-1">↓</button>
          <button class="btn btn-sm" style="color:var(--danger,#c0392b)" @click="removeGalleryItem(i)">✕</button>
        </div>
      </div>
    </section>

    <!-- Reservation Info -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Reservation Section</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.reservation.eyebrow" placeholder="Book Your Table" /></div>
        <div class="form-group"><label>Title</label><input v-model="data.reservation.title" placeholder="Join Us for an Unforgettable Experience" /></div>
      </div>
      <div class="form-group"><label>Description</label><textarea v-model="data.reservation.desc" rows="2" placeholder="Whether it's a cozy dinner for two or a celebration with friends..." /></div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Info Cards</label>
        <div class="form-group"><label>Opening Hours</label><input v-model="data.reservation.hoursVal" placeholder="Mon – Fri: 7am – 10pm · Sat: 8am – 11pm · Sun: 8am – 9pm" /></div>
        <div class="form-group"><label>Location</label><input v-model="data.reservation.locationVal" placeholder="Bole Road, Addis Ababa" /></div>
        <div class="form-group"><label>Phone / Contact</label><input v-model="data.reservation.contactVal" placeholder="+251 931 190 440" /></div>
      </div>
    </section>

    <!-- Footer -->
    <section class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Footer</h3></div>
      <div class="form-group"><label>Brand Description</label><textarea v-model="data.footer.desc" rows="2"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Copyright Year</label><input v-model="data.footer.year" /></div>
        <div class="form-group"><label>Tagline (Amharic)</label><input v-model="data.footer.craft" /></div>
      </div>

      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Opening Hours Column</label>
        <div class="form-row">
          <div class="form-group"><label>Mon – Fri</label><input v-model="data.footer.monFri" placeholder="Mon – Fri: 7am – 10pm" /></div>
          <div class="form-group"><label>Saturday</label><input v-model="data.footer.sat" placeholder="Saturday: 8am – 11pm" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Sunday</label><input v-model="data.footer.sun" placeholder="Sunday: 8am – 9pm" /></div>
          <div class="form-group"><label>Holidays</label><input v-model="data.footer.holidays" placeholder="Holidays: 9am – 6pm" /></div>
        </div>
      </div>

      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Contact Column</label>
        <div class="form-row">
          <div class="form-group"><label>Phone</label><input v-model="data.footer.phone" placeholder="+251 931 190 440" /></div>
          <div class="form-group"><label>Email</label><input v-model="data.footer.email" placeholder="hello@futfutcoffee.com" /></div>
        </div>
        <div class="form-group"><label>Address Line 1</label><input v-model="data.footer.address1" placeholder="Bole Road" /></div>
        <div class="form-group"><label>Address Line 2</label><input v-model="data.footer.address2" placeholder="Addis Ababa, Ethiopia" /></div>
      </div>

      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Social Links</label>
        <div class="form-row">
          <div class="form-group"><label>Instagram URL</label><input v-model="data.footer.instagram" placeholder="https://instagram.com/fufutcoffee" /></div>
          <div class="form-group"><label>Facebook URL</label><input v-model="data.footer.facebook" placeholder="https://facebook.com/fufutcoffee" /></div>
        </div>
        <div class="form-group"><label>Twitter / X URL</label><input v-model="data.footer.twitter" placeholder="https://twitter.com/fufutcoffee" /></div>
      </div>
    </section>

  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { apiGet, apiPost } from '../api/index.js'

function toast(msg, type = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:24px;right:24px;background:${type==='error'?'#c0392b':'#0F7B78'};color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.18)`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

const data = reactive({
  hero:     { amharic:'', title:'', subtitle:'', btn1:'', btn2:'' },
  story:    { eyebrow:'', title:'', p1:'', p2:'', badge1Num:'', badge1Label:'', badge2Num:'', badge2Label:'', feat1:'', feat2:'', feat3:'', feat4:'' },
  signatureCoffee: {
    eyebrow: '',
    title: '',
    cards: [
      { name:'', meta:'', price:'', badge:'', flavor:'', desc:'', image:'' },
      { name:'', meta:'', price:'', badge:'', flavor:'', desc:'', image:'' },
      { name:'', meta:'', price:'', badge:'', flavor:'', desc:'', image:'' },
    ]
  },
  stats:    [{value:0,label:''},{value:0,label:''},{value:0,label:''},{value:0,label:''}],
  ceremony: { eyebrow:'', title:'', desc:'', steps:[{title:'',text:''},{title:'',text:''},{title:'',text:''}], cta:'', image:'' },
  gallery:  [],
  reservation: { eyebrow:'', title:'', desc:'', hoursVal:'', locationVal:'', contactVal:'' },
  footer:   { desc:'', year:'2026', craft:'', monFri:'', sat:'', sun:'', holidays:'', phone:'', email:'', address1:'', address2:'', instagram:'', facebook:'', twitter:'' }
})

async function loadContent() {
  try {
    const json = await apiGet('content')
    if (json.hero)     Object.assign(data.hero, json.hero)
    if (json.story)    Object.assign(data.story, json.story)
    if (json.signatureCoffee && typeof json.signatureCoffee === 'object') {
      if (json.signatureCoffee.eyebrow) data.signatureCoffee.eyebrow = json.signatureCoffee.eyebrow
      if (json.signatureCoffee.title)   data.signatureCoffee.title   = json.signatureCoffee.title
      if (Array.isArray(json.signatureCoffee.cards)) {
        json.signatureCoffee.cards.forEach((card, i) => {
          if (data.signatureCoffee.cards[i]) Object.assign(data.signatureCoffee.cards[i], card)
        })
      }
    }
    if (json.stats && Array.isArray(json.stats)) {
      json.stats.forEach((s, i) => { if (data.stats[i]) Object.assign(data.stats[i], s) })
    }
    if (json.ceremony) Object.assign(data.ceremony, json.ceremony)
    if (Array.isArray(json.gallery)) {
      data.gallery.splice(0, data.gallery.length, ...json.gallery)
    }
    if (json.reservation) Object.assign(data.reservation, json.reservation)
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
function addGalleryItem()      { data.gallery.push({ url: '', title: '' }) }
function removeGalleryItem(i)  { data.gallery.splice(i, 1) }
function moveGalleryItem(i, d) {
  const j = i + d
  if (j < 0 || j >= data.gallery.length) return
  ;[data.gallery[i], data.gallery[j]] = [data.gallery[j], data.gallery[i]]
}
</script>
