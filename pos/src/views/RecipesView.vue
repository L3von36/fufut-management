<template>
  <div>
    <div class="table-toolbar">
      <h3>Recipes</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="filter" class="select">
          <option value="">All dishes</option>
          <option value="none">Missing a recipe</option>
          <option value="provisional">Needs real quantities</option>
          <option value="thin">Margin under 50%</option>
        </select>
        <button v-if="canEdit" class="btn btn-primary" @click="openNew()">New Recipe</button>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>

    <!--
      The engine is inert until recipes exist: a dish with no recipe consumes
      nothing when it sells. This banner is the only place that fact is visible,
      so it leads rather than sitting at the bottom of a list.
    -->
    <div v-if="withoutRecipe.length" class="alert-banner warning">
      ⚠ {{ withoutRecipe.length }} menu item(s) have no recipe — selling them does not reduce stock
    </div>
    <div v-else-if="recipes.length" class="alert-banner success">
      ✅ Every menu item has a recipe
    </div>

    <!--
      Separate from the "no recipe" banner above, and deliberately not merged
      with it: a dish with no recipe consumes nothing, while a dish with an
      estimated one consumes the wrong amount. The second is easier to miss
      because every figure on the row looks finished.
    -->
    <div v-if="provisionalRecipes.length" class="alert-banner warning">
      ⚠ {{ provisionalRecipes.length }} recipe(s) still use estimated quantities — their
      cost and margin are guesses until the kitchen weighs them.
      <button class="btn btn-sm btn-outline" style="margin-left:8px" @click="filter = 'provisional'">
        Show them
      </button>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ recipes.length }}</div><div class="lbl">Recipes</div></div>
      <div class="summary-card"><div class="num">{{ avgFoodCostPct }}%</div><div class="lbl">Avg Food Cost</div></div>
      <div class="summary-card"><div class="num" style="color:var(--danger)">{{ withoutRecipe.length }}</div><div class="lbl">Not Costed</div></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Dish</th><th>Ver</th><th>Lines</th>
              <th>Ingredient</th><th>Packaging</th><th>Total Cost</th>
              <th>Price</th><th>Gross Margin</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredRecipes" :key="r.id">
              <td data-label="Dish">
                <strong>{{ r.menu_item_name || r.name }}</strong>
                <span v-if="r.variant" class="badge badge-pending" style="margin-left:6px">{{ r.variant }}</span>
                <span
                  v-if="r.provisional"
                  class="badge badge-pending"
                  style="margin-left:6px"
                  title="Quantities are estimates, not weighed. Revise this recipe with the real amounts."
                >estimated</span>
              </td>
              <td data-label="Ver">v{{ r.version }}</td>
              <td data-label="Lines">{{ r.lineCount }}</td>
              <td data-label="Ingredient">ETB {{ fmt(r.cost.ingredientCost) }}</td>
              <td data-label="Packaging">ETB {{ fmt(r.cost.packagingCost) }}</td>
              <td data-label="Total Cost">ETB {{ fmt(r.cost.totalCost) }}</td>
              <td data-label="Price">{{ r.menu_item_price != null ? 'ETB ' + fmt(r.menu_item_price) : '—' }}</td>
              <td data-label="Gross Margin">
                <!--
                  A margin computed from a guessed weight is a guessed margin.
                  The tilde is there so it cannot be read off this screen and
                  quoted into a pricing decision as though it were measured.
                -->
                <span
                  v-if="r.margin"
                  class="badge"
                  :class="marginClass(r.margin.grossMarginPct)"
                  :title="r.provisional ? 'Provisional — derived from estimated quantities' : undefined"
                >
                  {{ r.provisional ? '≈ ' : '' }}ETB {{ fmt(r.margin.grossMargin) }} ({{ r.margin.grossMarginPct }}%)
                </span>
                <span v-else style="color:var(--text-muted)">—</span>
              </td>
              <td data-label="Actions">
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <button class="btn btn-sm btn-ghost" @click="openCapacity(r)">Can Make</button>
                  <button v-if="canEdit" class="btn btn-sm btn-ghost" @click="openEdit(r)">Revise</button>
                  <button class="btn btn-sm btn-ghost" @click="openHistory(r)">History</button>
                </div>
              </td>
            </tr>
            <tr v-if="!filteredRecipes.length">
              <td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">No recipes yet</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredRecipes.length }} recipe(s)</span></div>
    </div>

    <!-- Dishes with nothing behind them, so they can be costed in one place. -->
    <div v-if="withoutRecipe.length" class="table-wrap" style="margin-top:20px">
      <div class="table-toolbar"><h3 style="font-size:.95rem">Menu items without a recipe</h3></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Dish</th><th>Price</th><th></th></tr></thead>
          <tbody>
            <tr v-for="m in withoutRecipe" :key="m.id">
              <td data-label="Dish">{{ m.name }}</td>
              <td data-label="Price">ETB {{ fmt(m.price) }}</td>
              <td data-label="">
                <button v-if="canEdit" class="btn btn-sm btn-primary" @click="openNew(m)">Add Recipe</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ─── Recipe editor ─── -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal modal-lg">
        <h3>{{ editing ? 'Revise Recipe' : 'New Recipe' }}</h3>
        <p class="modal-sub">
          <template v-if="editing">
            Saving creates <strong>version {{ (editing.version || 1) + 1 }}</strong>. The current
            version is kept, so past sales keep the cost they were actually made at.
          </template>
          <template v-else>What one serving consumes.</template>
        </p>

        <div class="form-row">
          <div class="form-group">
            <label>Menu Item</label>
            <select v-model="form.menuItemId" class="select" :disabled="!!editing">
              <option value="">Not linked to a dish</option>
              <option v-for="m in menuItems" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Recipe Name</label>
            <input v-model="form.name" :class="{ 'input-error': !form.name && attempted }" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Makes (servings)</label>
            <input v-model.number="form.yieldQty" type="number" min="1" step="1" />
            <span class="field-hint">Use 1 for a drink; use 100 for a pot cooked in advance.</span>
          </div>
          <div class="form-group">
            <label>Size / Variant</label>
            <input v-model="form.variant" list="variant-options" placeholder="Leave blank for all sizes" :disabled="!!editing" />
            <datalist id="variant-options">
              <option v-for="v in variantSuggestions" :key="v" :value="v" />
            </datalist>
            <!--
              A variant is matched against the modifier the guest chose, so the
              name has to be the modifier's name. Typing a size nobody can order
              produces a recipe that is never used.
            -->
            <span class="field-hint">
              Must match a modifier on the dish, e.g. Large. Blank means it applies to every size.
            </span>
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <input v-model="form.notes" placeholder="Optional" />
        </div>

        <h4 style="margin:16px 0 8px;font-size:.9rem">Ingredients</h4>
        <div class="bom-lines">
          <div v-for="(line, i) in form.lines" :key="i" class="bom-line">
            <select v-model="line.inventoryId" class="select bom-item">
              <option value="">Choose ingredient…</option>
              <option v-for="inv in inventory" :key="inv.id" :value="inv.id">
                {{ inv.name }} ({{ inv.unit }})
              </option>
            </select>
            <input v-model.number="line.qty" type="number" step="any" min="0" class="bom-qty" placeholder="Qty" />
            <select v-model="line.unit" class="select bom-unit">
              <option v-for="u in unitsFor(line.inventoryId)" :key="u.unit" :value="u.unit">{{ u.label }}</option>
            </select>
            <label class="bom-pack" title="Cups, lids, napkins and bags — consumed on takeaway and delivery only">
              <input type="checkbox" v-model="line.isPackaging" /> Pkg
            </label>
            <button class="btn btn-sm btn-ghost danger" @click="form.lines.splice(i, 1)">×</button>
          </div>
        </div>
        <button class="btn btn-sm btn-outline" @click="addLine" style="margin-top:8px">Add Ingredient</button>

        <div v-if="problems.length" class="alert-banner warning" style="margin-top:12px">
          <div v-for="(p, i) in problems" :key="i">{{ p }}</div>
        </div>

        <div class="cost-preview" v-if="livePreview">
          <div><span>Ingredient</span><strong>ETB {{ fmt(livePreview.ingredient) }}</strong></div>
          <div><span>Packaging</span><strong>ETB {{ fmt(livePreview.packaging) }}</strong></div>
          <div><span>Cost per serving</span><strong>ETB {{ fmt(livePreview.total) }}</strong></div>
          <div v-if="livePreview.price">
            <span>Estimated gross margin</span>
            <strong>ETB {{ fmt(livePreview.price - livePreview.total) }}</strong>
          </div>
          <!-- Named precisely: labour, rent and utilities are not in this figure. -->
          <p class="cost-note">Gross margin — ingredients and packaging only. Labour, rent and utilities are not included.</p>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button class="btn btn-primary" @click="save">{{ editing ? 'Save as new version' : 'Create Recipe' }}</button>
        </div>
      </div>
    </div>

    <!-- ─── Capacity ─── -->
    <div class="modal-overlay" v-if="capacity" @click.self="capacity=null">
      <div class="modal">
        <h3>{{ capacity.recipe.name }}</h3>
        <p class="modal-sub">What current stock supports.</p>
        <div class="capacity-headline">
          <div class="num">{{ capacity.possible ?? '—' }}</div>
          <div class="lbl">servings possible</div>
          <div v-if="capacity.limiting" class="limiting">Limited by <strong>{{ capacity.limiting }}</strong></div>
        </div>
        <table class="mini-table">
          <thead><tr><th>Ingredient</th><th>In stock</th><th>Per serving</th><th>Supports</th></tr></thead>
          <tbody>
            <tr v-for="ing in capacity.perIngredient" :key="ing.inventoryId"
                :class="{ 'row-limiting': ing.inventoryId === capacity.limitingId }">
              <td>{{ ing.name }}</td>
              <td>{{ ing.stock }} {{ ing.unit }}</td>
              <td>{{ ing.perServing }} {{ ing.unit }}</td>
              <td><strong>{{ ing.capacity }}</strong></td>
            </tr>
          </tbody>
        </table>
        <div class="modal-actions"><button class="btn btn-secondary" @click="capacity=null">Close</button></div>
      </div>
    </div>

    <!-- ─── Version history ─── -->
    <div class="modal-overlay" v-if="history" @click.self="history=null">
      <div class="modal">
        <h3>Version history</h3>
        <p class="modal-sub">Past sales keep the version they were made with.</p>
        <table class="mini-table">
          <thead><tr><th>Version</th><th>Status</th><th>From</th><th>By</th></tr></thead>
          <tbody>
            <tr v-for="v in history" :key="v.id">
              <td>v{{ v.version }}</td>
              <td><span class="badge" :class="v.status === 'active' ? 'badge-ok' : 'badge-pending'">{{ v.status }}</span></td>
              <td>{{ (v.effective_from || '').slice(0, 10) || '—' }}</td>
              <td>{{ v.created_by_name || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div class="modal-actions"><button class="btn btn-secondary" @click="history=null">Close</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost } from '../api'
import { useAuthStore } from '../stores/auth'

const toast = inject('toast')
const auth = useAuthStore()

/**
 * Recipes belong to whoever answers for food cost. That is the head chef and
 * the manager; the assistant chef cooks from them but does not set them, which
 * mirrors the server matrix in fufut-api/src/auth.js. Anyone who can reach this
 * screen can read it — hiding the numbers from the people cooking would defeat
 * the point.
 */
const canEdit = computed(() => ['manager', 'head-chef'].includes(auth.roleKey))

const recipes = ref([])
const inventory = ref([])
const menuItems = ref([])
const units = ref({ mass: [], volume: [], count: [] })
const filter = ref('')
const showModal = ref(false)
const editing = ref(null)
const attempted = ref(false)
const problems = ref([])
const capacity = ref(null)
const history = ref(null)

const form = ref({ menuItemId: '', name: '', variant: '', yieldQty: 1, notes: '', lines: [] })

function fmt(n) { return (Number(n) || 0).toFixed(0) }

/**
 * A variant has to name a modifier the guest can actually choose, or the recipe
 * is written for a size nobody can order and is never consumed. Suggestions
 * come from the selected dish's own modifiers.
 */
const variantSuggestions = computed(() => {
  const item = menuItems.value.find(m => String(m.id) === String(form.value.menuItemId))
  if (!item) return []
  let mods = item.modifiers
  if (typeof mods === 'string') {
    try { mods = JSON.parse(mods) } catch { return [] }
  }
  if (!Array.isArray(mods)) return []
  return mods.map(m => (typeof m === 'string' ? m : m && m.name)).filter(Boolean)
})

const withoutRecipe = computed(() => {
  // A dish is covered once it has any recipe — default or per-size. Treating a
  // dish with only a Large recipe as uncovered would nag forever.
  const covered = new Set(recipes.value.map(r => String(r.menu_item_id)))
  return menuItems.value.filter(m => !covered.has(String(m.id)))
})

// Flagged by the seeding that created them: the ingredient list is right, the
// amounts are estimates. Cleared automatically when a corrected version is
// saved, because the version INSERT omits the column and it defaults to 0.
const provisionalRecipes = computed(() => recipes.value.filter(r => r.provisional))

const filteredRecipes = computed(() => {
  if (filter.value === 'thin') {
    return recipes.value.filter(r => r.margin && r.margin.grossMarginPct != null && r.margin.grossMarginPct < 50)
  }
  if (filter.value === 'provisional') return provisionalRecipes.value
  if (filter.value === 'none') return []
  return recipes.value
})

const avgFoodCostPct = computed(() => {
  const costed = recipes.value.filter(r => r.margin && r.menu_item_price > 0)
  if (!costed.length) return 0
  const pct = costed.reduce((s, r) => s + (r.cost.totalCost / r.menu_item_price) * 100, 0) / costed.length
  return Math.round(pct)
})

function marginClass(pct) {
  if (pct == null) return 'badge-pending'
  if (pct < 40) return 'badge-low'
  if (pct < 60) return 'badge-pending'
  return 'badge-ok'
}

/**
 * Only units that can actually express this ingredient.
 *
 * A recipe in millilitres against sugar stocked in kilograms is refused by the
 * server, so offering it here would only produce a save that fails. The list is
 * narrowed to the item's own dimension; count items get their own unit alone,
 * because a box is not a fixed number of pieces.
 */
function unitsFor(inventoryId) {
  const item = inventory.value.find(i => String(i.id) === String(inventoryId))
  if (!item) return [...units.value.mass, ...units.value.volume, ...units.value.count]
  const u = String(item.unit || '').toLowerCase()
  if (units.value.mass.some(x => x.unit === u)) return units.value.mass
  if (units.value.volume.some(x => x.unit === u)) return units.value.volume
  return units.value.count.filter(x => x.label === (units.value.count.find(c => c.unit === u) || {}).label)
}

/**
 * Cost as the chef types, so a recipe is never saved before its margin is
 * visible. Mirrors the server's arithmetic; the server's figure is what is
 * stored, and this is only a preview.
 */
const livePreview = computed(() => {
  if (!form.value.lines.length) return null
  const servings = Math.max(1, Number(form.value.yieldQty) || 1)
  let ingredient = 0
  let packaging = 0
  for (const line of form.value.lines) {
    const item = inventory.value.find(i => String(i.id) === String(line.inventoryId))
    if (!item || !line.qty) continue
    const unitCost = Number(item.avg_cost ?? item.cost ?? 0)
    // Converted the same way the engine does: into the item's stocking unit.
    const factor = conversionFactor(line.unit, item.unit)
    if (factor == null) continue
    const perServing = (Number(line.qty) / servings) * factor
    const cost = perServing * unitCost
    if (line.isPackaging) packaging += cost
    else ingredient += cost
  }
  const menuItem = menuItems.value.find(m => String(m.id) === String(form.value.menuItemId))
  return { ingredient, packaging, total: ingredient + packaging, price: menuItem ? Number(menuItem.price) : null }
})

/** Local mirror of the server's conversion table, for the preview only. */
const TO_BASE = { mg: 0.001, g: 1, kg: 1000, ml: 1, cl: 10, l: 1000, litre: 1000 }
function conversionFactor(from, to) {
  const f = TO_BASE[String(from || '').toLowerCase()]
  const t = TO_BASE[String(to || '').toLowerCase()]
  if (f && t) return f / t
  // Count units: same unit or nothing, matching the server's refusal to invent
  // a pack size.
  if (!f && !t) return String(from).toLowerCase() === String(to).toLowerCase() ? 1 : null
  return null
}

onMounted(loadData)

async function loadData() {
  try {
    const [r, inv, menu, u] = await Promise.all([
      apiGet('recipes'),
      apiGet('inventory'),
      apiGet('menu'),
      apiGet('units').catch(() => ({ units: { mass: [], volume: [], count: [] } })),
    ])
    recipes.value = r.recipes || []
    inventory.value = Array.isArray(inv) ? inv : []
    // /api/menu returns the grouped catalogue the order screens render; flatten
    // to the items themselves.
    menuItems.value = flattenMenu(menu)
    units.value = u.units || units.value
  } catch (e) {
    console.error(e)
    toast('Could not load recipes', 'error')
  }
}

function flattenMenu(menu) {
  if (Array.isArray(menu)) {
    return menu.flatMap(c => (Array.isArray(c.items) ? c.items : [c])).filter(m => m && m.id && m.name)
  }
  if (menu && Array.isArray(menu.categories)) {
    return menu.categories.flatMap(c => c.items || [])
  }
  return []
}

function openNew(menuItem) {
  editing.value = null
  attempted.value = false
  problems.value = []
  form.value = {
    menuItemId: menuItem ? menuItem.id : '',
    name: menuItem ? menuItem.name : '',
    variant: '',
    yieldQty: 1,
    notes: '',
    lines: [],
  }
  showModal.value = true
}

async function openEdit(recipe) {
  attempted.value = false
  problems.value = []
  try {
    const full = await apiGet('recipes/' + recipe.id)
    editing.value = full.recipe
    form.value = {
      menuItemId: full.recipe.menu_item_id || '',
      name: full.recipe.name,
      // Locked on a revision: changing it would supersede a different size's
      // recipe rather than this one.
      variant: full.recipe.variant || '',
      yieldQty: Number(full.recipe.yield_qty) || 1,
      notes: full.recipe.notes || '',
      lines: (full.recipe.lines || []).map(l => ({
        inventoryId: l.inventory_id,
        qty: Number(l.qty),
        unit: l.unit,
        isPackaging: !!l.is_packaging,
      })),
    }
    showModal.value = true
  } catch (e) {
    console.error(e)
    toast('Could not open that recipe', 'error')
  }
}

function addLine() {
  form.value.lines.push({ inventoryId: '', qty: null, unit: 'g', isPackaging: false })
}

async function save() {
  attempted.value = true
  problems.value = []
  if (!form.value.name) { toast('A recipe needs a name', 'error'); return }
  if (!form.value.lines.length) { toast('Add at least one ingredient', 'error'); return }

  try {
    const res = await apiPost('recipes', {
      menuItemId: form.value.menuItemId || null,
      name: form.value.name,
      variant: form.value.variant || null,
      yieldQty: form.value.yieldQty,
      notes: form.value.notes,
      lines: form.value.lines.map(l => ({
        inventoryId: l.inventoryId,
        qty: l.qty,
        unit: l.unit,
        isPackaging: l.isPackaging,
      })),
    })
    // The server validates units against how each item is actually stocked, so
    // its complaints are shown in place rather than collapsed into one toast.
    if (res.problems) { problems.value = res.problems; toast('Recipe is not valid', 'error'); return }
    toast(res.version > 1 ? `Saved as version ${res.version}` : 'Recipe created')
    showModal.value = false
    await loadData()
  } catch (e) {
    console.error(e)
    problems.value = [e?.message || 'Could not save the recipe']
    toast(e?.message || 'Could not save', 'error')
  }
}

async function openCapacity(recipe) {
  try {
    capacity.value = await apiGet(`recipes/${recipe.id}/capacity`)
  } catch (e) { console.error(e); toast('Could not work that out', 'error') }
}

async function openHistory(recipe) {
  try {
    const res = await apiGet(`recipes/${recipe.id}/versions`)
    history.value = res.versions || []
  } catch (e) { console.error(e); toast('Could not load history', 'error') }
}
</script>

<style scoped>
.modal-lg { max-width: 720px; width: 100%; }
.field-hint { display:block; color: var(--text-muted); font-size: .72rem; margin-top: 2px; }
.input-error { border-color: var(--danger, #e74c3c) !important; }

.bom-lines { display: flex; flex-direction: column; gap: 8px; }
.bom-line { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.bom-item { flex: 3; min-width: 150px; }
.bom-qty  { flex: 1; min-width: 70px; }
.bom-unit { flex: 1; min-width: 80px; }
.bom-pack { display: flex; align-items: center; gap: 4px; font-size: .75rem; white-space: nowrap; }

.cost-preview {
  margin-top: 16px; padding: 12px; border-radius: 8px;
  background: var(--surface-2, rgba(0,0,0,.04));
}
.cost-preview > div { display: flex; justify-content: space-between; padding: 3px 0; font-size: .85rem; }
.cost-note { margin: 8px 0 0; font-size: .72rem; color: var(--text-muted); }

.capacity-headline { text-align: center; padding: 16px 0; }
.capacity-headline .num { font-size: 2.4rem; font-weight: 700; color: var(--primary); }
.capacity-headline .lbl { color: var(--text-muted); font-size: .8rem; }
.capacity-headline .limiting { margin-top: 6px; font-size: .85rem; }

.mini-table { width: 100%; font-size: .8rem; }
.mini-table th, .mini-table td { padding: 6px 8px; text-align: left; }
.row-limiting { background: var(--gold-50, rgba(255,193,7,.12)); font-weight: 600; }
</style>
