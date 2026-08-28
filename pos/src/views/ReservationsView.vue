<template>
  <div>
    <div class="rv-toolbar">
      <div class="rv-toolbar-left">
        <span class="rv-toolbar-title">Reservations</span>
        <span class="rv-toolbar-count">{{ filteredReservations.length }} result{{ filteredReservations.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="rv-toolbar-actions">
        <div class="rv-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="search" type="text" placeholder="Search guests..." class="rv-search-input" />
          <button v-if="search" class="rv-search-clear" @click="search=''" aria-label="Clear search">&times;</button>
        </div>
        <select v-model="statusFilter" class="select"><option value="">All</option><option value="new">New</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select>
        <!-- Taking a booking is floor-staff work, so this follows the reservations
             permission rather than a manager check. Confirm and Complete below were
             already open to any permitted role; gating only create and cancel to
             managers left a waiter able to advance a booking but not raise or drop
             one. The API agrees: MANAGER_ONLY covers /api/staff and /api/migrate
             only, so reservation writes were never restricted server-side. -->
        <button v-if="auth.hasPermission('reservations')" class="btn btn-primary" @click="openAdd">New Reservation</button>
        <button class="btn btn-ghost btn-sm" @click="loadData" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table class="rv-compact">
          <thead><tr><th>Guest</th><th>Date</th><th>Time</th><th>Guests</th><th>Table</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="r in filteredReservations" :key="r.id">
              <td data-label="Guest"><strong>{{ r.name||r.guest }}</strong></td>
              <td data-label="Date">{{ r.date||'—' }}</td>
              <td data-label="Time">{{ r.time||'—' }}</td>
              <td data-label="Guests">{{ r.guests||'-' }}</td>
              <td data-label="Table">{{ tableLabel(r) }}</td>
              <td data-label="Contact">{{ r.phone||r.contact||'—' }}</td>
              <td data-label="Status"><span class="badge" :class="'badge-'+r.status">{{ r.status }}</span></td>
              <td data-label="Actions">
                <button v-if="r.status==='new'" class="btn btn-sm btn-success" @click="updateStatus(r,'confirmed')">Confirm</button>
                <button v-if="r.status==='confirmed'" class="btn btn-sm btn-primary" @click="updateStatus(r,'completed')">Complete</button>
                <button v-if="auth.hasPermission('reservations') && r.status !== 'cancelled'" class="btn btn-sm btn-ghost danger" @click="handleCancel(r)">Cancel</button>
              </td>
            </tr>
            <tr v-if="!filteredReservations.length"><td colspan="8">
              <div class="rv-empty">
                <div class="rv-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div class="rv-empty-text">{{ search ? 'No reservations match your search' : 'No reservations' }}</div>
                <div class="rv-empty-hint">{{ search ? 'Try a different name or clear search.' : 'Reservations will appear here once created by a manager.' }}</div>
              </div>
            </td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredReservations.length }} reservation(s)</span></div>
    </div>
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <!-- The form body scrolls; the title and the Create row do not. On a
           short phone the old sheet scrolled as one block, so Create started
           below the fold and the waiter had to discover the scroll. -->
      <div class="modal rv-modal" role="dialog" aria-modal="true" aria-label="New reservation">
        <h3>New Reservation</h3>
        <p class="modal-sub">Add a guest reservation</p>
        <div class="rv-modal-body">
        <div class="form-row">
          <div class="form-group"><label for="rv-name">Guest Name</label><input id="rv-name" v-model="form.name" :class="{ 'input-error': vErrors.name }" /><span v-if="vErrors.name" class="field-error">{{ vErrors.name }}</span></div>
          <div class="form-group"><label for="rv-guests">Guests</label><input id="rv-guests" v-model.number="form.guests" type="number" :class="{ 'input-error': vErrors.guests }" /><span v-if="vErrors.guests" class="field-error">{{ vErrors.guests }}</span></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="rv-date">Date</label><input id="rv-date" v-model="form.date" type="date" :class="{ 'input-error': vErrors.date }" @change="refreshAvailability" /><span v-if="vErrors.date" class="field-error">{{ vErrors.date }}</span></div>
          <div class="form-group"><label for="rv-time">Time</label><input id="rv-time" v-model="form.time" type="time" @change="refreshAvailability" /></div>
        </div>
        <div class="form-row">
          <!-- A table is chosen from the tables that exist, not typed. The old
               free-text box was posted as tableNum while the API only read
               tableId, so every booking silently lost its table. -->
          <div class="form-group">
            <label for="rv-table">Table</label>
            <select id="rv-table" v-model="form.tableNum" class="select" :class="{ 'input-error': vErrors.tableNum }">
              <option value="">No table yet</option>
              <option
                v-for="t in tables"
                :key="t.id"
                :value="t.number"
                :disabled="isTaken(t)"
              >
                Table {{ t.number }} &middot; {{ t.capacity }} seats &middot; {{ t.section }}{{ isTaken(t) ? ' — booked' : '' }}
              </option>
            </select>
            <span v-if="vErrors.tableNum" class="field-error">{{ vErrors.tableNum }}</span>
            <span v-else-if="tooSmall" class="field-error">This table seats {{ tooSmall.capacity }}; you have {{ form.guests }} guests.</span>
          </div>
          <div class="form-group">
            <label for="rv-duration">Holds for</label>
            <select id="rv-duration" v-model.number="form.durationMin" class="select" @change="refreshAvailability">
              <option :value="60">1 hour</option>
              <option :value="90">1½ hours</option>
              <option :value="120">2 hours</option>
              <option :value="180">3 hours</option>
            </select>
          </div>
        </div>
        <!-- The server rejects an overlapping booking outright; this says so
             before the guest is told their table is confirmed. -->
        <div v-if="clashMessage" class="rv-clash">{{ clashMessage }}</div>
        <div class="form-group"><label for="rv-phone">Phone</label><input id="rv-phone" v-model="form.phone" :class="{ 'input-error': vErrors.phone }" /><span v-if="vErrors.phone" class="field-error">{{ vErrors.phone }}</span></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button class="btn btn-primary" @click="saveItem">Create</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted , inject} from 'vue'
import { apiGet, apiPost, apiPut } from '../api'
import { useFormValidation } from '../composables/useFormValidation'
import { useAuthStore } from '../stores/auth'

const toast = inject('toast')
const confirmDelete = inject('confirm')
const auth = useAuthStore()
const schema = {
  name: { required: true, label: 'Guest Name', max: 100 },
  guests: { required: true, label: 'Guests', min: 1, maxVal: 50 },
  date: { required: true, label: 'Date' },
  tableNum: { label: 'Table #' },
  phone: { label: 'Phone', pattern: /^\+?\d{8,15}$/ }
}
const { errors: vErrors, validate } = useFormValidation(schema)

const reservations = ref([])
const statusFilter = ref('')
const search = ref('')
const showModal = ref(false)
const form = ref({ name: '', guests: 2, date: '', time: '', tableNum: '', phone: '', durationMin: 90 })
const tables = ref([])
// table_ids already booked for the window currently in the form.
const takenTableIds = ref(new Set())
const clashMessage = ref('')
const saving = ref(false)

/**
 * Tables already held for the chosen window, asked of the server rather than
 * worked out here: the overlap rule and the grace period live in the worker,
 * and a second copy in the browser would drift out of step with it.
 */
async function refreshAvailability() {
  clashMessage.value = ''
  if (!form.value.date || !form.value.time) {
    takenTableIds.value = new Set()
    return
  }
  try {
    const res = await apiGet(
      `reservations/availability?date=${encodeURIComponent(form.value.date)}` +
      `&time=${encodeURIComponent(form.value.time)}&duration=${form.value.durationMin || 90}`
    )
    takenTableIds.value = new Set((res.taken || []).map(t => t.table_id))
    // A table already chosen can become unavailable when the time is edited.
    const chosen = tables.value.find(t => String(t.number) === String(form.value.tableNum))
    if (chosen && takenTableIds.value.has(chosen.id)) {
      form.value.tableNum = ''
      clashMessage.value = 'That table is taken at the new time, so the selection was cleared.'
    }
  } catch {
    // Availability is a convenience; the server still refuses a real clash on
    // save, so a failed lookup must not block taking a booking.
    takenTableIds.value = new Set()
  }
}

function isTaken(table) {
  return takenTableIds.value.has(table.id)
}

/**
 * Reservations store a table_id; the floor talks in table numbers. The legacy
 * rows have neither, and show a dash rather than a blank cell so it is clear
 * the booking has no table rather than the column being broken.
 */
function tableLabel(r) {
  const id = r.table_id || r.tableId
  if (!id) return '—'
  const t = tables.value.find(x => x.id === id)
  return t ? `Table ${t.number}` : id
}

/** Warn, but do not block: staff sometimes seat five at a four-top. */
const tooSmall = computed(() => {
  const t = tables.value.find(x => String(x.number) === String(form.value.tableNum))
  if (!t) return null
  return Number(form.value.guests) > Number(t.capacity) ? t : null
})

const filteredReservations = computed(() => {
  let result = !statusFilter.value ? reservations.value : reservations.value.filter(r => r.status === statusFilter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(r =>
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.guest && r.guest.toLowerCase().includes(q)) ||
      (r.phone && r.phone.includes(q))
    )
  }
  return result
})

onMounted(() => {
  const n = new Date()
  form.value.date = n.toISOString().slice(0, 10)
  form.value.time = n.toTimeString().slice(0, 5)
  loadData()
})

async function loadData() {
  // The table list is what the picker is built from, so it is loaded with the
  // bookings rather than on demand; a booking must point at a table that exists.
  const [res, tbl] = await Promise.allSettled([apiGet('reservations'), apiGet('tables')])
  if (res.status === 'fulfilled') reservations.value = res.value
  else console.error(res.reason)
  if (tbl.status === 'fulfilled' && Array.isArray(tbl.value)) {
    tables.value = tbl.value.slice().sort((a, b) => (a.number || 0) - (b.number || 0))
  }
}

async function saveItem() {
  if (!validate(form.value)) { toast('Please fix the errors', 'error'); return }
  if (saving.value) return
  saving.value = true
  clashMessage.value = ''
  try {
    await apiPost('reservations', {
      ...form.value,
      duration_min: form.value.durationMin,
      status: 'new'
    })
    toast('Created')
    showModal.value = false
    await loadData()
  } catch (e) {
    // A 409 means another booking already holds that table for an overlapping
    // window. It is shown in the form rather than as a toast, because the fix
    // is to change the table or the time and the form is where that happens.
    //
    // Refresh first, then set the message: refreshAvailability clears
    // clashMessage on entry, so setting it beforehand would wipe the very
    // explanation the person needs.
    await refreshAvailability()
    clashMessage.value = e.message || 'Could not create the reservation'
    toast('Could not create the reservation', 'error')
  } finally {
    saving.value = false
  }
}

async function updateStatus(r, s) {
  r.status = s
  try { await apiPut('reservations/' + r.id, r); toast(s); await loadData() } catch (e) { console.error(e); toast('Failed', 'error') }
}

function openAdd() {
  const n = new Date()
  form.value = {
    name: '', guests: 2,
    date: n.toISOString().slice(0, 10),
    time: n.toTimeString().slice(0, 5),
    tableNum: '', phone: '', durationMin: 90
  }
  clashMessage.value = ''
  showModal.value = true
  refreshAvailability()
}

/**
 * Cancelling marks the booking cancelled rather than deleting the row. The
 * button has always read "Cancel", but it used to hard-delete: the guest's
 * history vanished, the status filter's "Cancelled" option could never match
 * anything, and a no-show could not be told apart from a booking that was
 * never made. Now that floor staff hold this control too, a mis-tap must not
 * destroy a record.
 */
async function handleCancel(r) {
  if (!await confirmDelete('Cancel this reservation?')) return
  await updateStatus(r, 'cancelled')
}
</script>
<style scoped>
/* Shown in the form, not as a toast: the fix for a clash is to change the table
   or the time, and both are right here. A toast would vanish before the person
   had finished reading which booking blocked them. */
.rv-clash {
  margin: 4px 0 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--red-50, #FEF2F2);
  border: 1.5px solid var(--danger);
  color: var(--danger-text);
  font-size: .82rem;
  font-weight: 500;
}

.rv-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}
.rv-toolbar-left { display: flex; align-items: baseline; gap: 10px; }
.rv-toolbar-title { font-size: 1.15rem; font-weight: 700; color: var(--text-heading); }
.rv-toolbar-count { font-size: .78rem; color: var(--text-muted); }
.rv-toolbar-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.rv-search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  transition: border-color var(--duration-fast) var(--ease);
  min-width: 180px;
}
.rv-search:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(15,123,120,.1); }
.rv-search-input { border: none; background: transparent; padding: 7px 0; font-size: .82rem; color: var(--text-heading); width: 100%; outline: none; font-family: inherit; }
.rv-search-input::placeholder { color: var(--neutral-400); }
.rv-search-clear { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; padding: 0 2px; line-height: 1; }
.rv-search-clear:hover { color: var(--text-heading); }

.rv-empty { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; text-align: center; }
.rv-empty-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--neutral-50); display: flex; align-items: center; justify-content: center; color: var(--neutral-400); margin-bottom: 12px; }
.rv-empty-text { font-size: .88rem; font-weight: 600; color: var(--text-heading); }
.rv-empty-hint { font-size: .78rem; color: var(--text-muted); margin-top: 4px; }

.input-error { border-color: var(--danger, #e74c3c) !important; }
.field-error { display: block; color: var(--danger, #e74c3c); font-size: 0.75rem; margin-top: 2px; }

@media (max-width: 768px) {
  .rv-toolbar { flex-direction: column; align-items: stretch; }
  .rv-toolbar-left { margin-bottom: 4px; }
  .rv-search { min-width: 0; }
}


/* ── UX-4: the New Reservation sheet pins its title and actions; only the
   form body scrolls. Before, the whole sheet scrolled as one block, so on a
   short phone (SE class, ~667px) the Create button started below the fold. */
.rv-modal {
  display: flex;
  flex-direction: column;
  overflow: hidden; /* the body scrolls, not the sheet */
}
.rv-modal-body {
  min-height: 0;           /* lets it shrink inside the flex column */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.rv-modal .modal-actions {
  flex-shrink: 0;          /* never scrolled away */
  margin-bottom: 0;
}

/* ── UX-3: compact booking cards on phones. The generic narrow-screen rules
   in styles.css stack every cell as a label:value line (8 lines a booking);
   the waiter's actual question is "who's coming at 2?", so the same cells
   are re-laid-out on a 12-column grid into three lines:

     Guest Name ──────────────────  [status]
     date · time · guests · table · phone
     [Confirm] [Cancel]

   The DOM is untouched — only placement changes, so table behaviour tests
   and the desktop layout are unaffected. */
@media (max-width: 768px) {
  .rv-compact tr {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    column-gap: 6px;
    row-gap: 4px;
  }
  .rv-compact td {
    display: block;
    border: none;
    padding: 0;
    font-size: .82rem;
    text-align: left;
    white-space: normal;
  }
  .rv-compact td::before { content: none; } /* no per-cell labels */
  .rv-compact td:not(:last-child) { border-bottom: none; }

  .rv-compact td[data-label="Guest"]   { grid-area: 1 / 1 / 2 / 9;  font-weight: 700; font-family: inherit; }
  .rv-compact td[data-label="Status"]  { grid-area: 1 / 9 / 2 / 13; justify-self: end; }
  .rv-compact td[data-label="Date"]    { grid-area: 2 / 1 / 3 / 4;  color: var(--text-muted); }
  .rv-compact td[data-label="Time"]    { grid-area: 2 / 4 / 3 / 6;  color: var(--text-muted); }
  .rv-compact td[data-label="Guests"]  { grid-area: 2 / 6 / 3 / 8;  color: var(--text-muted); }
  .rv-compact td[data-label="Table"]   { grid-area: 2 / 8 / 3 / 10; color: var(--text-muted); }
  .rv-compact td[data-label="Contact"] { grid-area: 2 / 10 / 3 / 13; color: var(--text-muted); text-align: right; }
  .rv-compact td[data-label="Actions"] { grid-area: 3 / 1 / 4 / 13; justify-content: flex-start; margin-top: 2px; padding-top: 0; }

  /* mid-line separators: date · time · guests · table */
  .rv-compact td[data-label="Date"]::after,
  .rv-compact td[data-label="Time"]::after,
  .rv-compact td[data-label="Guests"]::after,
  .rv-compact td[data-label="Table"]::after { content: "·"; margin-left: 6px; color: var(--text-muted); opacity: .6; }
}
/* The empty-state row (colspan) must still span the card. */
@media (max-width: 768px) {
  .rv-compact td[colspan] { grid-column: 1 / -1; }
}
</style>
