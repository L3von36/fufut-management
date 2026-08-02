<template>
  <div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px">
      <!-- Business Hours -->
      <div class="card">
        <div class="card-header"><h3>Business Hours</h3></div>
        <div v-for="(h, day) in hours" :key="day" class="form-row" style="margin-bottom:6px;align-items:center">
          <span style="font-size:.82rem;font-weight:500;text-transform:capitalize">{{ day }}</span>
          <div style="display:flex;gap:6px;align-items:center">
            <select v-model="hours[day].open" class="select select-sm">
              <option v-for="t in timeSlots" :key="t" :value="t">{{ t }}</option>
            </select>
            <span style="font-size:.7rem">to</span>
            <select v-model="hours[day].close" class="select select-sm">
              <option v-for="t in timeSlots" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:12px" @click="saveHours">Save Hours</button>
      </div>

      <!-- Contact -->
      <div class="card">
        <div class="card-header"><h3>Contact Info</h3></div>
        <div class="form-group"><label>Phone</label><input v-model="contact.phone" /></div>
        <div class="form-group"><label>Email</label><input v-model="contact.email" /></div>
        <div class="form-group"><label>Address</label><input v-model="contact.address" /></div>
        <div class="form-group"><label>Map URL</label><input v-model="contact.map" /></div>
        <button class="btn btn-primary btn-sm" @click="saveContact">Save Contact</button>
      </div>

      <!-- Holidays -->
      <div class="card">
        <div class="card-header"><h3>Holiday Closures</h3></div>
        <div v-for="(h, i) in holidays" :key="i" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:.8rem">
          <span>{{ h.date }} — {{ h.reason }}</span>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click="holidays.splice(i,1); saveHolidays()">✕</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <input v-model="holidayForm.date" type="date" class="input input-sm" />
          <input v-model="holidayForm.reason" placeholder="Reason" class="input input-sm" />
          <button class="btn btn-primary btn-sm" @click="addHoliday">Add</button>
        </div>
      </div>

      <!-- Announcement -->
      <div class="card">
        <div class="card-header"><h3>Announcement Banner</h3></div>
        <div class="form-group"><label>Banner Text</label><textarea v-model="banner.text" rows="2" placeholder="e.g. Closed for Meskel — Sept 27"></textarea></div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <label class="toggle"><input type="checkbox" v-model="banner.show"><span class="slider"></span></label>
          <span style="font-size:.8rem">Show banner on site</span>
        </div>
        <button class="btn btn-primary btn-sm" @click="saveBanner">Save Banner</button>
      </div>

      <!-- Password -->
      <div class="card">
        <div class="card-header"><h3>Admin Password</h3></div>
        <div class="form-group"><label>Current Password</label><input v-model="passForm.current" type="password" /></div>
        <div class="form-group"><label>New Password</label><input v-model="passForm.newPass" type="password" /></div>
        <div class="form-group"><label>Confirm</label><input v-model="passForm.confirm" type="password" /></div>
        <button class="btn btn-primary btn-sm" @click="savePassword">Change</button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useToast } from '../composables/useToast'
const { toast, success: toastOk, error: toastErr, info: toastInfo } = useToast()

const timeSlots = Array.from({length:24}, (_,i) => `${String(i).padStart(2,'0')}:00`).concat(Array.from({length:23}, (_,i) => `${String(i).padStart(2,'0')}:30`)).sort()
const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
const hours = reactive(Object.fromEntries(days.map(d => [d, {open:'08:00',close:'22:00'}])))
const contact = reactive({phone:'+251 931 190 440',email:'hello@futfutcoffee.com',address:'Bole Road, Addis Ababa',map:''})
const holidays = ref([])
const holidayForm = ref({date:'',reason:''})
const banner = reactive({text:'',show:false})
const passForm = reactive({current:'',newPass:'',confirm:''})

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('admin_settings') || '{}')
    if (saved.hours) Object.assign(hours, saved.hours)
    if (saved.contact) Object.assign(contact, saved.contact)
    if (saved.holidays) holidays.value = saved.holidays
    if (saved.banner) Object.assign(banner, saved.banner)
  } catch {}
})

function saveAll() {
  localStorage.setItem('admin_settings', JSON.stringify({
    hours: {...hours}, contact: {...contact},
    holidays: holidays.value, banner: {...banner}
  }))
}
function saveHours() { saveAll(); toastOk('Hours saved') }
function saveContact() { saveAll(); toastOk('Contact saved') }
function saveHolidays() { saveAll() }
function saveBanner() { saveAll(); toastOk('Banner saved') }
function addHoliday() { if (!holidayForm.value.date||!holidayForm.value.reason) return; holidays.value.push({...holidayForm.value}); holidayForm.value={date:'',reason:''}; saveAll(); toastOk('Holiday added') }
function savePassword() {
  if (passForm.value.current !== 'fufut2026') { toastErr('Current password wrong'); return }
  if (passForm.value.newPass !== passForm.value.confirm) { toastErr('Passwords mismatch'); return }
  if (passForm.value.newPass.length < 4) { toastErr('Min 4 characters'); return }
  // In production this would call /api/auth/change-password
  toastOk('Password changed (session only)')
  passForm.value = {current:'',newPass:'',confirm:''}
}
</script>
