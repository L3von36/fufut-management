<template>
  <div>
    <div class="table-toolbar">
      <h3>Role Access</h3>
      <button class="btn btn-outline" @click="load">Refresh</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <p style="margin:0;font-size:.84rem;color:var(--text-body);line-height:1.55">
        Give a role an extra screen, and — for inventory — choose exactly which stock categories
        they may see. The barista only needs the bar's stock (coffee, milk, cups); the kitchen
        needs the food stock. What you set here is what their list shows: nothing outside the
        chosen categories reaches their device, and stock reports stay with full-stock roles.
        The manager account always sees everything.
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
        <div class="ra-screen">
          <div class="ra-screen-head">
            <div>
              <div class="ra-screen-title">Inventory</div>
              <div class="ra-screen-sub">Stock levels and the item list (also narrows what their Waste Log can name).</div>
            </div>
            <label class="ra-switch">
              <input type="checkbox" v-model="invEnabled" />
              <span>{{ invEnabled ? 'On' : 'Off' }}</span>
            </label>
          </div>

          <template v-if="invEnabled">
            <div class="ra-presets">
              <span style="font-size:.75rem;color:var(--text-muted);align-self:center">Quick pick:</span>
              <button class="btn btn-sm btn-outline" @click="applyPreset('drinks')">Bar / drinks</button>
              <button class="btn btn-sm btn-outline" @click="applyPreset('food')">Kitchen / food</button>
              <button class="btn btn-sm btn-outline" @click="applyPreset('all')">Everything</button>
              <button class="btn btn-sm btn-outline" @click="selectedCategories.clear()">None</button>
            </div>
            <div class="ra-cats">
              <label v-for="c in categories" :key="c.name" class="ra-cat" :class="{ 'is-picked': selectedCategories.has(c.name) }">
                <input type="checkbox" :checked="selectedCategories.has(c.name)" @change="toggleCategory(c.name)" />
                <span class="ra-cat-name">{{ c.name }}</span>
                <span class="ra-cat-count">{{ c.count }}</span>
              </label>
            </div>
            <div v-if="!selectedCategories.size" class="ra-warn">
              Turned on with no categories picked — this role would see an empty stock list. Pick at least one, or switch it off.
            </div>
          </template>

          <div class="ra-actions">
            <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save Access' }}</button>
            <button v-if="savedScope" class="btn btn-secondary" :disabled="saving" @click="clearScope">Revoke (back to default)</button>
            <span v-if="savedScope && savedScope.updatedAt" class="ra-meta">
              Last saved {{ shortTime(savedScope.updatedAt) }}<template v-if="savedScope.updatedBy"> by {{ savedScope.updatedBy }}</template>
            </span>
          </div>
          <p class="ra-note">Takes effect the next time someone on this role signs in or reloads the POS. They always keep their own screens — this page only adds.</p>
        </div>
      </template>
    </div>

    <div class="card">
      <h3 style="font-size:.9rem;margin:0 0 10px;font-weight:600;color:var(--text-heading)">Saved access</h3>
      <div v-if="!scopes.length" style="font-size:.84rem;color:var(--text-muted)">Nothing granted yet — every role is on its default screens.</div>
      <div v-else class="ra-saved">
        <div v-for="s in scopes" :key="s.role" class="ra-saved-row">
          <strong>{{ roleLabel(s.role) }}</strong>
          <span v-if="s.scope && s.scope.inventory && s.scope.inventory.enabled" class="badge badge-success">
            Inventory: {{ s.scope.inventory.categories.join(', ') }}
          </span>
          <span v-else class="badge badge-cancelled">off</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { apiGet, apiPut } from '../api'

const toast = inject('toast')

const roles = ref([])
const categories = ref([])
const scopes = ref([])
const pickedRole = ref('')
const invEnabled = ref(false)
const selectedCategories = ref(new Set())
const saving = ref(false)
const savedScope = ref(null)

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
  if (name === 'drinks' || name === 'food') {
    // Presets name groups; only the categories that actually exist today are picked.
    const live = new Set(categories.value.map((c) => c.name))
    selectedCategories.value = new Set(PRESETS[name].filter((c) => live.has(c)))
  }
}

function toggleCategory(name) {
  const next = new Set(selectedCategories.value)
  next.has(name) ? next.delete(name) : next.add(name)
  selectedCategories.value = next
}

async function load() {
  try {
    const res = await apiGet('role-scopes')
    roles.value = (res.roles || []).map((key) => ({ key, label: roleLabel(key), blurb: ROLE_BLURBS[key] || '' }))
    const counts = {}
    // The category list rides along with live item counts so the owner can
    // see how big each slice is before handing it out.
    try {
      const items = await apiGet('inventory')
      for (const it of Array.isArray(items) ? items : []) {
        if (it.category) counts[it.category] = (counts[it.category] || 0) + 1
      }
    } catch { /* counts are decorative; the checkbox list still works */ }
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
  const inv = saved && saved.scope && saved.scope.inventory
  invEnabled.value = !!(inv && inv.enabled)
  selectedCategories.value = new Set(inv && inv.enabled ? inv.categories || [] : [])
}

// Switching roles must show THAT role's saved state, not the previous one's.
watch(pickedRole, syncFromSaved)

async function save() {
  saving.value = true
  try {
    const body = { inventory: { enabled: invEnabled.value, categories: [...selectedCategories.value] } }
    const res = await apiPut('role-scopes/' + pickedRole.value, body)
    if (!res.ok) throw new Error(res.error || 'Could not save')
    toast(`Saved — ${roleLabel(pickedRole.value)} inventory ${invEnabled.value ? 'granted (' + selectedCategories.value.size + ' categories)' : 'off'}`)
    await load()
  } catch (e) {
    toast(e.message || 'Could not save access', 'error')
  } finally {
    saving.value = false
  }
}

async function clearScope() {
  saving.value = true
  try {
    const res = await apiPut('role-scopes/' + pickedRole.value, { inventory: null })
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
.ra-screen { border-top: 1px solid var(--border); padding-top: 14px; }
.ra-screen-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.ra-screen-title { font-weight: 600; color: var(--text-heading); }
.ra-screen-sub { font-size: .76rem; color: var(--text-muted); margin-top: 2px; }
.ra-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: .8rem; font-weight: 600; color: var(--text-heading); white-space: nowrap; }
.ra-switch input { width: 18px; height: 18px; accent-color: var(--primary, #0f7b78); cursor: pointer; }
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
.ra-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ra-meta { font-size: .74rem; color: var(--text-muted); }
.ra-note { font-size: .74rem; color: var(--text-muted); margin: 10px 0 0; }
.ra-saved { display: flex; flex-direction: column; gap: 8px; }
.ra-saved-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: .82rem; }
</style>
