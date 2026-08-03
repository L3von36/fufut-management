<template>
  <div>
    <!-- Loading state -->
    <div v-if="loading" style="text-align:center;padding:40px;color:var(--text-muted)">
      Loading settings…
    </div>

    <div v-else style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px">
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
        <button class="btn btn-primary btn-sm" style="margin-top:12px" :disabled="saving.hours" @click="saveHours">
          {{ saving.hours ? 'Saving\u2026' : 'Save Hours' }}
        </button>
      </div>

      <!-- Contact -->
      <div class="card">
        <div class="card-header"><h3>Contact Info</h3></div>
        <div class="form-group"><label>Phone</label><input v-model="contact.phone" /></div>
        <div class="form-group"><label>Email</label><input v-model="contact.email" /></div>
        <div class="form-group"><label>Address</label><input v-model="contact.address" /></div>
        <div class="form-group"><label>Map URL</label><input v-model="contact.map" /></div>
        <button class="btn btn-primary btn-sm" :disabled="saving.contact" @click="saveContact">
          {{ saving.contact ? 'Saving\u2026' : 'Save Contact' }}
        </button>
      </div>

      <!-- Holidays -->
      <div class="card">
        <div class="card-header"><h3>Holiday Closures</h3></div>
        <div v-for="(h, i) in holidays" :key="h.date + h.reason + i" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:.8rem">
          <span>{{ h.date }} \u2014 {{ h.reason }}</span>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" @click="removeHoliday(i)">\u2715</button>
        </div>
        <div v-if="holidays.length === 0" style="padding:12px 0;color:var(--text-muted);font-size:.82rem">No holidays added yet</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <input v-model="holidayForm.date" type="date" class="input input-sm" />
          <input v-model="holidayForm.reason" placeholder="Reason" class="input input-sm" />
          <button class="btn btn-primary btn-sm" @click="addHoliday">Add</button>
        </div>
      </div>

      <!-- Announcement -->
      <div class="card">
        <div class="card-header"><h3>Announcement Banner</h3></div>
        <div class="form-group"><label>Banner Text</label><textarea v-model="banner.text" rows="2" placeholder="e.g. Closed for Meskel \u2014 Sept 27"></textarea></div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <label class="toggle"><input type="checkbox" v-model="banner.show"><span class="slider"></span></label>
          <span style="font-size:.8rem">Show banner on site</span>
        </div>
        <button class="btn btn-primary btn-sm" :disabled="saving.banner" @click="saveBanner">
          {{ saving.banner ? 'Saving\u2026' : 'Save Banner' }}
        </button>
      </div>

      <!-- Password -->
      <div class="card">
        <div class="card-header"><h3>Admin Password</h3></div>
        <div class="form-group"><label>Current Password</label><input v-model="passForm.current" type="password" /></div>
        <div class="form-group"><label>New Password</label><input v-model="passForm.newPass" type="password" /></div>
        <div class="form-group"><label>Confirm</label><input v-model="passForm.confirm" type="password" /></div>
        <button class="btn btn-primary btn-sm" :disabled="saving.password" @click="savePassword">
          {{ saving.password ? 'Updating\u2026' : 'Change Password' }}
        </button>
      </div>

      <!-- Storage status -->
      <div class="card" style="grid-column:1/-1">
        <div class="card-header"><h3>Storage Status</h3></div>
        <div style="display:flex;align-items:center;gap:8px;font-size:.82rem">
          <span class="badge" :class="storageMode === 'api' ? 'badge-success' : 'badge-pending'">{{ storageMode === 'api' ? 'Cloud (API)' : 'Local (browser only)' }}</span>
          <span style="color:var(--text-muted)">
            {{ storageMode === 'api' ? 'Settings persist across devices' : 'Settings stored in this browser only' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, onMounted } from 'vue'
import { apiGet, apiPost, apiPut } from '../api'
import { useToast } from '../composables/useToast'

const { success: toastOk, error: toastErr, info: toastInfo } = useToast()

// ── Time slots for hours dropdowns ──
const timeSlots = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)
  .concat(Array.from({ length: 23 }, (_, i) => `${String(i).padStart(2, '0')}:30`))
  .sort()

// ── Default values ──
const DEFAULTS = {
  hours: Object.fromEntries(
    ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
      .map(d => [d, { open: '08:00', close: '22:00' }])
  ),
  contact: { phone: '+251 931 190 440', email: 'hello@futfutcoffee.com', address: 'Bole Road, Addis Ababa', map: '' },
  holidays: [],
  banner: { text: '', show: false }
}

// ── Reactive state ──
const hours = reactive({ ...DEFAULTS.hours })
const contact = reactive({ ...DEFAULTS.contact })
const holidays = ref([...DEFAULTS.holidays])
const banner = reactive({ ...DEFAULTS.banner })
const holidayForm = ref({ date: '', reason: '' })
const passForm = ref({ current: '', newPass: '', confirm: '' })

const loading = ref(true)
const storageMode = ref('local') // 'api' or 'local'
const saving = reactive({ hours: false, contact: false, holidays: false, banner: false, password: false })

// ── localStorage helpers (fallback / cache) ──
const LS_KEY = 'admin_settings'

function loadFromLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    if (saved.hours) Object.assign(hours, saved.hours)
    if (saved.contact) Object.assign(contact, saved.contact)
    if (Array.isArray(saved.holidays)) holidays.value = saved.holidays
    if (saved.banner) Object.assign(banner, saved.banner)
  } catch { /* ignore */ }
}

function cacheLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      hours: { ...hours },
      contact: { ...contact },
      holidays: holidays.value,
      banner: { ...banner }
    }))
  } catch { /* quota exceeded — ignore */ }
}

function buildPayload() {
  return JSON.stringify({
    hours: { ...hours },
    contact: { ...contact },
    holidays: holidays.value,
    banner: { ...banner }
  })
}

// ── Load settings on mount (try Worker collection API, fall back to localStorage) ──
onMounted(async () => {
  try {
    const raw = await apiGet('settings')
    // The Worker returns an array of records; find the latest one with data
    const items = Array.isArray(raw) ? raw : []
    const record = items
      .filter(r => r.data && !r.data.startsWith('__'))
      .sort((a, b) => (b.created || '').localeCompare(a.created || ''))[0]
    if (record) {
      let data = record.data
      if (typeof data === 'string') {
        try { data = JSON.parse(data) } catch { data = {} }
      }
      if (data.hours) Object.assign(hours, data.hours)
      if (data.contact) Object.assign(contact, data.contact)
      if (Array.isArray(data.holidays)) holidays.value = data.holidays
      if (data.banner) Object.assign(banner, data.banner)
      storageMode.value = 'api'
    } else {
      loadFromLocal()
    }
  } catch {
    loadFromLocal()
  }
  cacheLocal()
  loading.value = false
})

// ── Save functions: POST to Worker's settings collection + cache locally ──
async function saveAll(label) {
  saving[label] = true
  try {
    await apiPost('settings', { id: 'admin_settings', data: buildPayload() })
    storageMode.value = 'api'
    cacheLocal()
    toastOk(`${label} saved`)
  } catch (e) {
    cacheLocal() // always persist locally as fallback
    toastErr(`Save failed: ${e.message || 'unknown error'}`)
  } finally {
    saving[label] = false
  }
}

const saveHours = () => saveAll('Hours')
const saveContact = () => saveAll('Contact')
async function saveHolidays() {
  saving.holidays = true
  try {
    await apiPost('settings', { id: 'admin_settings', data: buildPayload() })
    storageMode.value = 'api'
    cacheLocal()
  } catch {
    cacheLocal()
  } finally {
    saving.holidays = false
  }
}

const saveBanner = () => saveAll('Banner')

function addHoliday() {
  if (!holidayForm.value.date || !holidayForm.value.reason.trim()) {
    toastErr('Date and reason are required')
    return
  }
  holidays.value.push({ date: holidayForm.value.date, reason: holidayForm.value.reason.trim() })
  holidayForm.value = { date: '', reason: '' }
  saveHolidays()
  toastOk('Holiday added')
}

function removeHoliday(index) {
  holidays.value.splice(index, 1)
  saveHolidays()
  toastInfo('Holiday removed')
}

// ── Password change (real API call) ──
async function savePassword() {
  if (!passForm.value.current) { toastErr('Enter current password'); return }
  if (passForm.value.newPass !== passForm.value.confirm) { toastErr('Passwords do not match'); return }
  if (passForm.value.newPass.length < 4) { toastErr('New password must be at least 4 characters'); return }

  saving.password = true
  try {
    await apiPost('auth/change-password', {
      currentPassword: passForm.value.current,
      newPassword: passForm.value.newPass
    })
    toastOk('Password updated')
    passForm.value = { current: '', newPass: '', confirm: '' }
  } catch (e) {
    toastErr(e.message || 'Password change failed')
  } finally {
    saving.password = false
  }
}
</script>
