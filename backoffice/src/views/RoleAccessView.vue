<template>
  <div>
    <div class="table-toolbar">
      <h3>Role Access</h3>
      <button class="btn btn-outline" @click="load">Refresh</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <p style="margin:0;font-size:.84rem;color:var(--text-body);line-height:1.55">
        Give a role extra screens — and for inventory, choose exactly which stock categories they
        may see. The barista only needs the bar's stock (coffee, milk, cups); the kitchen needs the
        food stock. What you set here is what their app shows, and nothing outside it reaches their
        device. Grants are read-shaped: they never hand over money screens, staff data or delete
        powers. The manager account always sees everything.
      </p>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="form-group" style="max-width:420px">
        <label>Choose a role</label>
        <select v-model="pickedRole" class="select">
          <option value="" disabled>Select a role…</option>
          <option v-for="r in roles" :key="r.key" :value="r.key">{{ r.label }} — {{ r.blurb }}</option>
        </select>
      </div>

      <template v-if="pickedRole">
        <div v-for="(s, i) in screens" :key="s.key" class="ra-screen" :style="i === 0 ? 'border-top:none;padding-top:0' : ''">
          <div class="ra-screen-head">
            <div>
              <div class="ra-screen-title">{{ s.label }}</div>
              <div class="ra-screen-sub">{{ s.blurb }}</div>
            </div>
            <label class="ra-switch">
              <input type="checkbox" :checked="screenState[s.key]?.enabled" @change="toggleScreen(s.key, $event)" />
              <span>{{ screenState[s.key]?.enabled ? 'On' : 'Off' }}</span>
            </label>
          </div>

          <template v-if="s.key === 'inventory' && screenState.inventory?.enabled">
            <div class="ra-presets">
              <span style="font-size:.75rem;color:var(--text-muted);align-self:center">Quick pick:</span>
              <button class="btn btn-sm btn-outline" type="button" @click="applyPreset('drinks')">Bar / drinks</button>
              <button class="btn btn-sm btn-outline" type="button" @click="applyPreset('food')">Kitchen / food</button>
              <button class="btn btn-sm btn-outline" type="button" @click="applyPreset('all')">Everything</button>
              <button class="btn btn-sm btn-outline" type="button" @click="selectedCategories = new Set()">None</button>
            </div>
            <div class="ra-cats">
              <label v-for="c in categories" :key="c.name" class="ra-cat" :class="{ 'is-picked': selectedCategories.has(c.name) }">
                <input type="checkbox" :checked="selectedCategories.has(c.name)" @change="toggleCategory(c.name)" />
                <span class="ra-cat-name">{{ c.name }}</span>
                <span class="ra-cat-count">{{ c.count }}</span>
              </label>
            </div>
            <div class="ra-items-head">
              <div>
                <div class="ra-items-title">Individual items</div>
                <div class="ra-items-sub">Hand-pick single items on top of the categories — an item ticked here is visible even when its category above is not.</div>
              </div>
              <span class="ra-item-count">{{ selectedItems.size }} picked</span>
            </div>
            <input v-model="itemSearch" class="input ra-item-search" type="search" placeholder="Search items by name or category…" />
            <div class="ra-items">
              <label v-for="it in visibleItems" :key="it.id" class="ra-item" :class="{ 'is-picked': selectedItems.has(it.id), 'via-cat': selectedCategories.has(it.category) }">
                <input type="checkbox" :checked="selectedItems.has(it.id)" @change="toggleItem(it.id)" />
                <span class="ra-item-name">{{ it.name }}</span>
                <span class="ra-item-cat">{{ it.category }}<template v-if="selectedCategories.has(it.category)"> · via category</template></span>
              </label>
              <div v-if="!items.length" class="ra-items-empty">Item list unavailable — the category pick above still works.</div>
              <div v-else-if="!visibleItems.length" class="ra-items-empty">No items match the search.</div>
            </div>
            <div v-if="!selectedCategories.size && !selectedItems.size" class="ra-warn">
              Turned on with nothing picked — this role would see an empty stock list. Pick at least one category or item, or switch it off.
            </div>
          </template>
        </div>

        <div class="ra-actions">
          <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save Access' }}</button>
          <button v-if="savedScope" class="btn btn-secondary" :disabled="saving" @click="revoke">Revoke (back to default)</button>
          <span v-if="savedScope && savedScope.updatedAt" class="ra-meta">
            Last saved {{ shortTime(savedScope.updatedAt) }}<template v-if="savedScope.updatedBy"> by {{ savedScope.updatedBy }}</template>
          </span>
        </div>
        <p class="ra-note">Takes effect within about a minute, or the next time someone on this role signs in or reloads the POS. Grants only ever add screens — a role's own screens stay.</p>
      </template>
    </div>

    <div class="card">
      <h3 style="font-size:.9rem;margin:0 0 10px;font-weight:600;color:var(--text-heading)">Saved access</h3>
      <div v-if="!scopes.length" style="font-size:.84rem;color:var(--text-muted)">Nothing granted yet — every role is on its default screens.</div>
      <div v-else class="ra-saved">
        <div v-for="s in scopes" :key="s.role" class="ra-saved-row">
          <strong>{{ roleLabel(s.role) }}</strong>
          <span v-for="chip in scopeChips(s.scope)" :key="chip" class="badge badge-success">{{ chip }}</span>
          <span v-if="!scopeChips(s.scope).length" class="badge badge-cancelled">all off</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { apiGet, apiPut } from '../api'

const toast = inject('toast')

const screens = ref([])
const roles = ref([])
const categories = ref([])
const scopes = ref([])
const pickedRole = ref('')
const screenState = ref({})
const selectedCategories = ref(new Set())
const saving = ref(false)
const savedScope = ref(null)

// Hand-picked items sit beside whole categories: an item is visible when its
// category OR its id is picked. The picker is fed from the same inventory
// fetch that paints the category counts.
const items = ref([])
const selectedItems = ref(new Set())
const itemSearch = ref('')

const itemById = computed(() => new Map(items.value.map((it) => [it.id, it])))

const visibleItems = computed(() => {
  const sorted = [...items.value].sort(
    (a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name))
  )
  const q = itemSearch.value.trim().toLowerCase()
  if (!q) return sorted
  return sorted.filter(
    (it) => String(it.name).toLowerCase().includes(q) || String(it.category || '').toLowerCase().includes(q)
  )
})

function toggleItem(id) {
  const next = new Set(selectedItems.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedItems.value = next
}

const ROLE_BLURBS = {
  'head-chef': 'runs the kitchen',
  'assistant-chef': 'kitchen support',
  barista: 'the drinks station',
  'head-waiter': 'floor lead',
  cashier: 'counter and payments',
  'delivery-staff': 'deliveries',
  cleaner: 'cleaning',
  accountant: 'the books',
}

function roleLabel(key) {
  const r = roles.value.find((x) => x.key === key)
  if (r) return r.label
  return String(key || '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function roleFromScopes(key) {
  return scopes.value.find((s) => s.role === key) || null
}

const PRESETS = {
  drinks: ['Coffee & Tea', 'Dairy & Eggs', 'Bought In', 'Packaging'],
  food: ['Fruit', 'Vegetables', 'Proteins', 'Staples', 'Dairy & Eggs', 'Oil & Spice'],
}

function applyPreset(name) {
  if (name === 'all') {
    selectedCategories.value = new Set(categories.value.map((c) => c.name))
    return
  }
  // Presets name groups; only the categories that actually exist today are picked.
  const live = new Set(categories.value.map((c) => c.name))
  selectedCategories.value = new Set((PRESETS[name] || []).filter((c) => live.has(c)))
}

function toggleCategory(name) {
  const next = new Set(selectedCategories.value)
  next.has(name) ? next.delete(name) : next.add(name)
  selectedCategories.value = next
}

function toggleScreen(key, evt) {
  screenState.value = { ...screenState.value, [key]: { ...screenState.value[key], enabled: evt.target.checked } }
}

// Chips for the saved-access list, one per enabled screen; inventory's shows
// how it is scoped — categories first, then hand-picked item names.
function scopeChips(scope) {
  if (!scope) return []
  return screens.value
    .filter((s) => scope[s.key] && scope[s.key].enabled)
    .map((s) => {
      if (s.key === 'inventory' && scope.inventory) {
        const cats = scope.inventory.categories || []
        const picked = (scope.inventory.itemIds || []).map((id) => (itemById.value.get(id) || {}).name || id)
        const parts = [...cats, ...picked]
        if (!parts.length) return 'Inventory'
        if (parts.length > 8) {
          const bits = []
          if (cats.length) bits.push(`${cats.length} categories`)
          if (picked.length) bits.push(`${picked.length} items`)
          return `Inventory: ${bits.join(' + ')}`
        }
        return `Inventory: ${parts.join(', ')}`
      }
      return s.label
    })
}

async function load() {
  try {
    const res = await apiGet('role-scopes')
    screens.value = res.screens || []
    roles.value = (res.roles || []).map((key) => ({ key, label: roleLabel(key), blurb: ROLE_BLURBS[key] || '' }))
    const counts = {}
    const rows = []
    // The category list rides along with live item counts so the owner can
    // see how big each slice is before handing it out — and the same rows
    // feed the individual-item picker.
    try {
      const inv = await apiGet('inventory')
      for (const it of Array.isArray(inv) ? inv : []) {
        if (it.category) counts[it.category] = (counts[it.category] || 0) + 1
        if (it.id) rows.push({ id: it.id, name: it.name, category: it.category })
      }
    } catch { /* counts are decorative; the checkbox list still works */ }
    items.value = rows
    categories.value = (res.categories || []).map((name) => ({ name, count: counts[name] || 0 }))
    scopes.value = res.scopes || []
    syncFromSaved()
  } catch (e) {
    toast(e.message || 'Could not load role access', 'error')
  }
}

function syncFromSaved() {
  const saved = roleFromScopes(pickedRole.value)
  savedScope.value = saved
  const state = {}
  for (const s of screens.value) {
    const savedScreen = saved && saved.scope && saved.scope[s.key]
    state[s.key] = { enabled: !!(savedScreen && savedScreen.enabled) }
  }
  screenState.value = state
  const inv = saved && saved.scope && saved.scope.inventory
  selectedCategories.value = new Set(inv && inv.enabled ? inv.categories || [] : [])
  selectedItems.value = new Set(inv && inv.enabled ? inv.itemIds || [] : [])
  itemSearch.value = ''
}

// Switching roles must show THAT role's saved state, not the previous one's.
watch(pickedRole, syncFromSaved)

async function save() {
  saving.value = true
  try {
    const payload = {}
    for (const s of screens.value) {
      if (s.key === 'inventory') {
        payload.inventory = {
          enabled: !!screenState.value.inventory?.enabled,
          categories: [...selectedCategories.value],
          itemIds: [...selectedItems.value],
        }
      } else {
        payload[s.key] = { enabled: !!screenState.value[s.key]?.enabled }
      }
    }
    const res = await apiPut('role-scopes/' + pickedRole.value, { screens: payload })
    if (!res.ok) throw new Error(res.error || 'Could not save')
    const granted = screens.value.filter((s) => payload[s.key] && payload[s.key].enabled).map((s) => s.label)
    toast(granted.length ? `Saved — ${roleLabel(pickedRole.value)} granted: ${granted.join(', ')}` : `Saved — ${roleLabel(pickedRole.value)} has no granted screens`)
    await load()
  } catch (e) {
    toast(e.message || 'Could not save access', 'error')
  } finally {
    saving.value = false
  }
}

async function revoke() {
  saving.value = true
  try {
    const res = await apiPut('role-scopes/' + pickedRole.value, { clear: true })
    if (!res.ok) throw new Error(res.error || 'Could not revoke')
    toast(`Revoked — ${roleLabel(pickedRole.value)} is back on its default screens`)
    await load()
  } catch (e) {
    toast(e.message || 'Could not revoke access', 'error')
  } finally {
    saving.value = false
  }
}

function shortTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

onMounted(load)
</script>

<style scoped>
.ra-screen { border-top: 1px solid var(--border); padding-top: 14px; margin-top: 14px; }
.ra-screen-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.ra-screen-title { font-weight: 600; color: var(--text-heading); }
.ra-screen-sub { font-size: .76rem; color: var(--text-muted); margin-top: 2px; max-width: 560px; }
.ra-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: .8rem; font-weight: 600; color: var(--text-heading); white-space: nowrap; }
.ra-switch input { width: 18px; height: 18px; accent-color: #0f7b78; cursor: pointer; }
.ra-presets { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
.ra-cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin: 4px 0 12px; }
.ra-cat {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border: 1.5px solid var(--border); border-radius: 8px; cursor: pointer;
  font-size: .8rem; color: var(--text-body); transition: border-color .15s, background .15s;
}
.ra-cat:hover { border-color: var(--border-strong); }
.ra-cat.is-picked { border-color: #0f7b78; background: rgba(15, 123, 120, .06); }
.ra-cat input { accent-color: #0f7b78; }
.ra-cat-name { flex: 1; min-width: 0; }
.ra-cat-count { font-size: .7rem; color: var(--text-muted); white-space: nowrap; }
.ra-warn { font-size: .78rem; color: #b45309; background: rgba(180, 83, 9, .08); border: 1px solid rgba(180, 83, 9, .25); border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; }
.ra-items-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin: 2px 0 8px; }
.ra-items-title { font-size: .8rem; font-weight: 600; color: var(--text-heading); }
.ra-items-sub { font-size: .74rem; color: var(--text-muted); margin-top: 2px; max-width: 560px; }
.ra-item-count { font-size: .72rem; color: var(--text-muted); white-space: nowrap; }
.ra-item-search { max-width: 380px; padding: 8px 12px !important; font-size: .8rem !important; margin-bottom: 8px; }
.ra-items { max-height: 240px; overflow-y: auto; border: 1.5px solid var(--border); border-radius: 8px; padding: 4px; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 4px; margin-bottom: 12px; }
.ra-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border: 1.5px solid transparent; border-radius: 6px; cursor: pointer;
  font-size: .76rem; color: var(--text-body); transition: border-color .15s, background .15s;
}
.ra-item:hover { background: rgba(15, 123, 120, .05); }
.ra-item.is-picked { border-color: #0f7b78; background: rgba(15, 123, 120, .08); }
.ra-item input { accent-color: #0f7b78; flex: none; }
.ra-item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ra-item-cat { font-size: .66rem; color: var(--text-muted); white-space: nowrap; }
.ra-items-empty { grid-column: 1 / -1; font-size: .76rem; color: var(--text-muted); padding: 10px; }
.ra-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.ra-meta { font-size: .74rem; color: var(--text-muted); }
.ra-note { font-size: .74rem; color: var(--text-muted); margin: 10px 0 0; }
.ra-saved { display: flex; flex-direction: column; gap: 8px; }
.ra-saved-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: .82rem; }
</style>
