<template>
  <div class="menu-view-shell" :class="{ 'check-docked': checkDocked }">
    <!--
      Everything the waiter picks from. On a landscape tablet this is the left
      column and the check sits permanently beside it; on a phone it is the
      whole screen and the check is a sheet.
    -->
    <div class="menu-main">
    <!-- Active table context — which table this order is being built for -->
    <div v-if="activeTable" class="table-context-bar">
      <span class="tcb-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
      </span>
      <span class="tcb-label">Ordering for <strong>Table {{ activeTable }}</strong></span>
      <button class="tcb-clear" @click="clearTable" title="Not for a table (takeaway)">Change</button>
    </div>

    <!-- Sticky Category Tabs -->
    <div class="menu-categories">
      <button v-for="cat in categories" :key="cat"
        class="cat-tab"
        :class="{ active: activeCategory === cat }"
        @click="activeCategory = cat"
      >
        <span class="cat-icon">{{ iconFor(cat) }}</span>
        <span class="cat-label">{{ cat }}</span>
        <span class="cat-count">{{ categoryCounts[cat] || 0 }}</span>
      </button>
      <button class="cat-tab cat-all" :class="{ active: activeCategory === '' }" @click="activeCategory = ''">
        <span class="cat-icon">📋</span>
        <span class="cat-label">All</span>
        <span class="cat-count">{{ items.length }}</span>
      </button>
    </div>

    <!-- Search Bar -->
    <div class="menu-search-bar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input v-model="search" type="text" placeholder="Search menu items..." class="menu-search-input" />
      <button v-if="search" class="search-clear" @click="search = ''">✕</button>
      <!--
        Photos help somebody who does not know the menu; a server who does
        wants as many names on screen as possible. Which is right depends on
        the venue and on how long the staff have been there, so it is a choice
        rather than a decision made here.
      -->
      <button class="density-toggle" @click="toggleDensity"
        :title="density === 'photo' ? 'Switch to a compact list' : 'Switch to photos'">
        <svg v-if="density === 'photo'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      </button>
    </div>

    <!--
      Which course the next items belong to. The kitchen already fires tickets
      by course and the column has existed since migration 012, but nothing on
      this screen ever set one, so every line went out as 'main' and coursing
      was unreachable from the place that decides it.
      Dine-in only: a takeaway or a delivery is one drop.
    -->
    <div v-if="orderStore.orderType === 'dine-in'" class="course-bar">
      <span class="course-label">Course</span>
      <button v-for="c in COURSES" :key="c.value"
        class="course-chip" :class="{ active: activeCourse === c.value }"
        @click="activeCourse = c.value"
      >{{ c.label }}</button>
    </div>

    <!-- Menu Grid -->
    <div class="menu-grid-wrapper">
      <div v-if="loading" class="menu-loading">
        <div class="menu-loading-spinner"></div>
        <div>Loading menu…</div>
      </div>
      <div v-else class="menu-grid" :class="{ 'is-list': density === 'list' }">
        <div v-for="item in filteredItems" :key="itemKey(item)"
          class="menu-card"
          :class="{ unavailable: item.available === false, 'in-cart': storeCartCount(item.id) > 0 }"
          @click="onTileClick(item)"
          @pointerdown="startHold(item)"
          @pointerup="endHold"
          @pointerleave="endHold"
          @pointercancel="endHold"
          @contextmenu.prevent
        >
          <div class="menu-img">
            <img :src="item.image || getPlaceholder(item)" :alt="item.name" loading="lazy" />
            <div v-if="item.available === false" class="menu-img-overlay">Unavailable</div>
          </div>
          <!-- Outside the image: list mode drops the photo, and the count of
               what is already on the order has to survive that. -->
          <div v-if="storeCartCount(item.id) > 0" class="menu-badge">{{ storeCartCount(item.id) }}</div>
          <div class="menu-info">
            <div class="menu-name-row">
              <h3>{{ item.name }}</h3>
              <span class="menu-price">ETB {{ parseFloat(item.price||0).toFixed(0) }}</span>
            </div>
            <p v-if="item.description" class="menu-desc">{{ item.description }}</p>
            <div class="menu-meta">
              <span class="menu-category-tag">{{ item.category }}</span>
              <span v-if="item.cost && parseFloat(item.cost) > 0 && parseFloat(item.price) > 0" class="menu-cost-badge">Gross {{ ((parseFloat(item.price)-parseFloat(item.cost))/parseFloat(item.price)*100).toFixed(0) }}%</span>
            </div>
            <div v-if="hasModifiers(item)" class="menu-modifiers">
              <span v-for="mod in getModifierList(item).slice(0, 3)" :key="mod" class="mod-tag">{{ formatModName(mod) }}</span>
              <span v-if="getModifierList(item).length > 3" class="mod-tag mod-more">+{{ getModifierList(item).length - 3 }} more</span>
            </div>
          </div>
          <button class="menu-add-btn" @click.stop="handleItemClick(item)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div v-if="!filteredItems.length" class="menu-empty">
          <div class="menu-empty-icon">🔍</div>
          <div v-if="search">No items matching "{{ search }}"</div>
          <div v-else>No items in this category</div>
          <button v-if="search" class="btn btn-sm btn-outline" style="margin-top:12px" @click="search = ''">Clear search</button>
        </div>
      </div>
    </div>

    </div><!-- /.menu-main -->

    <!-- How many? Opened by holding a tile. -->
    <div v-if="qtyTarget" class="qty-overlay" @click.self="qtyTarget = null">
      <div class="qty-sheet">
        <div class="qty-title">How many?</div>
        <div class="qty-item">{{ qtyTarget.name }}</div>
        <div class="qty-options">
          <button v-for="n in QUANTITIES" :key="n" class="qty-option" @click="addQuantity(n)">{{ n }}</button>
        </div>
        <button class="btn btn-secondary qty-cancel" @click="qtyTarget = null">Cancel</button>
      </div>
    </div>

    <!-- Floating Cart. Only on narrow screens: where the check is docked
         beside the grid there is nothing for it to reveal. -->
    <div v-if="orderStore.cartTotal > 0 && !checkDocked" class="floating-cart" @click="showCart = !showCart">
      <div class="fc-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span class="fc-badge">{{ orderStore.cartItemCount }}</span>
      </div>
      <div class="fc-details">
        <span class="fc-count">{{ orderStore.cartItemCount }} item{{ orderStore.cartItemCount !== 1 ? 's' : '' }}</span>
        <!-- Cart stage shows the cart subtotal; tip/discount are chosen at checkout. -->
        <span class="fc-total">ETB {{ orderStore.cartTotal.toFixed(0) }}</span>
      </div>
      <div class="fc-chevron">
        <svg :class="{ rotated: showCart }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>

    <!-- Cart Sheet -->
    <transition name="cart-slide">
      <div v-if="showCart || checkDocked" class="cart-sheet-overlay" @click.self="showCart=false">
        <div class="cart-sheet" @click.stop>
          <div class="cart-header">
            <h3>Current Order</h3>
            <!-- Fix #1: Clear All with confirmation -->
            <button v-if="orderStore.items.length" class="btn btn-sm btn-ghost" @click="showClearConfirm = true">Clear All</button>
          </div>
          <!-- Docked, the panel is on screen before anything is ordered, so it
               has to say what it is rather than sit there blank. -->
          <div v-if="!orderStore.items.length" class="cart-empty">
            <div class="cart-empty-title">Nothing on this order yet</div>
            <div class="cart-empty-hint">Tap a dish to add it. Press and hold to add several.</div>
          </div>
          <div class="cart-items">
            <div v-for="entry in orderStore.items" :key="entry.uid" class="cart-item">
              <div class="cart-item-info">
                <div class="cart-item-name">{{ orderStore.lineSummary(entry) }}</div>
                <div class="cart-item-price">ETB {{ (orderStore.lineTotal(entry) * entry.qty).toFixed(0) }}</div>
                <!-- Only when it is not the default, so a single-drop order
                     stays as quiet as it was. -->
                <div v-if="entry.course && entry.course !== 'main'" class="cart-item-course">{{ entry.course }}</div>
              </div>
              <div class="cart-qty">
                <button class="qty-btn" @click="orderStore.decrementQty(entry.uid)">−</button>
                <span class="qty-value">{{ entry.qty }}</span>
                <button class="qty-btn" @click="orderStore.incrementQty(entry.uid)">+</button>
              </div>
              <button class="cart-remove" @click="removeWithUndo(entry)">✕</button>
            </div>
          </div>
          <div class="cart-footer">
            <div class="cart-total-row">
              <span>Subtotal</span>
              <span>ETB {{ orderStore.cartTotal.toFixed(0) }}</span>
            </div>
            <div class="cart-total-row cart-grand-total">
              <span>Total</span>
              <span>ETB {{ orderStore.cartTotal.toFixed(0) }}</span>
            </div>
            <!--
              Which of these is the normal next step depends on the order.
              A seated table opens a tab and settles later; a counter sale
              takes the money now. The two used to look identical whatever
              you were doing, so the emphasis and the order follow the type.
            -->
            <div class="cart-actions" :class="{ 'settle-first': !isDineIn }">
              <button v-if="orderStore.isAddRound && orderStore.activeOpenOrderId" class="btn btn-success cart-action" @click="sendToKitchen" :disabled="sendingToKitchen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {{ sendingToKitchen ? 'Adding...' : 'Add to Order' }}
              </button>
              <button v-else class="btn cart-action" :class="isDineIn ? 'btn-primary' : 'btn-outline'" @click="sendToKitchen" :disabled="sendingToKitchen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {{ sendingToKitchen ? 'Sending...' : 'Send to Kitchen' }}
              </button>
              <button class="btn cart-checkout" :class="isDineIn ? 'btn-outline' : 'btn-primary'" @click="goToCheckout">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                {{ isDineIn ? 'Checkout' : 'Take Payment' }}
              </button>
            </div>
            <!-- Nobody should have to be told which button opens a tab. -->
            <p class="cart-action-hint">{{ actionHint }}</p>
          </div>
        </div>
      </div>
    </transition>

    <!-- Modifier Selection Sheet -->
    <ModifierSelectionSheet
      :visible="showModifierSheet"
      :menu-item="modifierTarget"
      @confirm="onModifierConfirm"
      @cancel="showModifierSheet = false"
    />

    <!-- Fix #1: Clear All confirmation -->
    <transition name="cart-slide">
      <div v-if="showClearConfirm" class="qty-overlay" @click.self="showClearConfirm = false">
        <div class="qty-sheet" style="max-width:340px;text-align:center">
          <div style="font-size:2.5rem;margin-bottom:12px">🗑️</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--text-heading);margin-bottom:8px">Clear All Items?</div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:20px;line-height:1.5">
            This will remove {{ orderStore.cartItemCount }} item{{ orderStore.cartItemCount !== 1 ? 's' : '' }} from the order. This can't be undone.
          </div>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="btn btn-danger" @click="clearOrder()">Yes, Clear All</button>
            <button class="btn btn-secondary" @click="showClearConfirm = false">Keep Items</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { apiGet, apiPost, apiPatch, apiPut } from '../api'
import { useOrderStore } from '../stores/order'
import ModifierSelectionSheet from '../components/ModifierSelectionSheet.vue'

const router = useRouter()
const route = useRoute()
const toast = inject('toast')
const orderStore = useOrderStore()
const items = ref([])
const loading = ref(true)
const activeCategory = ref('')
const search = ref('')
const showCart = ref(false)

/**
 * Whether the check is docked beside the grid rather than hidden behind a pill.
 *
 * A server reads the order back to the guest while building it, and a mis-tap
 * three items ago is expensive to find once the food is fired — so on anything
 * with the room for it, the check stays on screen. Landscape rather than plain
 * width: a phone held sideways is still a phone, but it does have the room.
 */
/**
 * Photo tiles or a compact list.
 *
 * Kept per device rather than per account: it follows the tablet on the pass
 * or the phone in an apron, which is what it is really a property of.
 */
/**
 * Which course the next thing tapped belongs to.
 *
 * 'main' matches the server's default, so a waiter who never touches this
 * behaves exactly as before. Resets to main whenever the cart is cleared, so
 * the next table does not inherit the last one's dessert round.
 */
const COURSES = [
  { value: 'starters', label: 'Starters' },
  { value: 'main', label: 'Main' },
  { value: 'dessert', label: 'Dessert' },
]
const activeCourse = ref('main')

/**
 * Empty the cart and go back to the main course, so the next table does not
 * inherit the last one's dessert round.
 */
const showClearConfirm = ref(false)

/**
 * Remove a cart line with a 3-second undo window.
 * Matches the CheckoutView behavior so the waiter can recover from a mis-tap.
 */
function removeWithUndo(entry) {
  const name = entry.name
  const uid = entry.uid
  orderStore.removeItem(uid)
  if (!orderStore.items.length) showCart.value = false
  toast(`${name} removed — 3s to undo`, 'info', {
    action: {
      label: 'Undo',
      onClick: () => {
        for (let i = 0; i < entry.qty; i++) {
          orderStore.addItem({
            menuItemId: entry.menuItemId,
            name: entry.name,
            basePrice: entry.basePrice,
            selectedModifiers: entry.selectedModifiers || [],
            notes: entry.notes || '',
            course: entry.course || 'main'
          })
        }
        toast(`${name} restored`, 'success')
      }
    },
    duration: 3000
  })
}

function clearOrder() {
  orderStore.clearCart()
  activeCourse.value = 'main'
  showCart.value = false
  showClearConfirm.value = false
}

const isDineIn = computed(() => orderStore.orderType === 'dine-in')

/**
 * What the buttons below actually do, in a sentence.
 *
 * The distinction matters and was invisible: one fires the food and leaves the
 * bill open, the other collects the money. A waiter who picks the wrong one
 * either takes payment before the kitchen has seen the order, or leaves a
 * counter sale sitting as an unpaid tab nobody settles.
 */
const actionHint = computed(() => {
  if (orderStore.isAddRound && orderStore.activeOpenOrderId) {
    return 'Adds these to the tab already open on this table.'
  }
  return isDineIn.value
    ? 'Send to Kitchen opens a tab for this table — settle it when they leave.'
    : 'Take Payment now; the kitchen gets it when the sale goes through.'
})

/** A takeaway or a delivery goes out in one drop, so it is always 'main'. */
const courseForNewLines = computed(() =>
  orderStore.orderType === 'dine-in' ? activeCourse.value : 'main'
)

const DENSITY_KEY = 'fufut.pos.menuDensity'
const density = ref('photo')
try {
  const saved = localStorage.getItem(DENSITY_KEY)
  if (saved === 'list' || saved === 'photo') density.value = saved
} catch { /* private mode: the default is fine */ }

function toggleDensity() {
  density.value = density.value === 'photo' ? 'list' : 'photo'
  try { localStorage.setItem(DENSITY_KEY, density.value) } catch { /* not worth failing over */ }
}

const CHECK_DOCK_QUERY = '(min-width: 1024px) and (orientation: landscape)'
const checkDocked = ref(false)
let dockQuery = null
function syncDock(e) { checkDocked.value = e.matches }
const showModifierSheet = ref(false)
const modifierTarget = ref({})
const categories = ref([])

const categoryIcons = {
  'Breakfast / ቁርስ': '🍳',
  'Salad / ሰላጣ': '🥗',
  'Ethiopian Dish / የሀበሻ ምግብ': '🫕',
  'Half Bitt Half Foods / ግማሽ ግማሽ ምግቦች': '🍱',
  'Pasta / ፓስታ': '🍝',
  'Sandwich & Wrap / ሳንድዊች ና መለወ': '🥪',
  'Burger / በርገር': '🍔',
  'Pizza / ፒዛ': '🍕',
  'Break time foods / መከሰስ': '🍟',
  'Hot Drink / ትኩስ መጠጦች': '☕',
  'Seasonal Juice / የፍራፍሬ ጭማቂዎች': '🧃',
  'Soft Drink / ቀዝቃዛ መጠጦች': '🥤',
  'Extra / ጭማሪዎች': '➕',
  'Coffee': '☕',
  'Drinks': '🥤',
  'Pastries': '🥐',
  'Breakfast': '🍳',
  'Appetizers': '🍟',
  'Salads': '🥗',
  'Mains': '🍽️',
  'Desserts': '🍰',
  // Live categories from /api/menu (2026-08-14). Kept alongside the legacy keys
  // above because the live menu still serves these exact names. Lookup is
  // case-insensitive (see iconFor), so these would match anyway.
  'ETHIOPIAN DISH': '🫕',
  'HOT DRINKS': '☕',
  'SALAD BOWL': '🥗'
}

function iconFor(category) {
  if (!category) return '🍽️'
  const direct = categoryIcons[category]
  if (direct) return direct
  const norm = category.trim().toLowerCase()
  for (const key of Object.keys(categoryIcons)) {
    if (key.trim().toLowerCase() === norm) return categoryIcons[key]
  }
  return '🍽️'
}

const foodImages = [
  '/assets/menu-1488477181946.jpg','/assets/menu-1512058564366.jpg','/assets/menu-1514432324607.jpg',
  '/assets/menu-1525351484163.jpg','/assets/menu-1540189549336.jpg','/assets/menu-1544025162.jpg',
  '/assets/menu-1546833999.jpg','/assets/menu-1547592180.jpg','/assets/menu-1555939594.jpg',
  '/assets/menu-1561047029.jpg','/assets/menu-1565958011703.jpg','/assets/menu-1567620905732.jpg',
  '/assets/menu-1576092768241.jpg','/assets/menu-1578985545062.jpg','/assets/menu-1606787366850.jpg',
  '/assets/menu-1608039829572.jpg','/assets/menu-1627308595229.jpg'
]

// ─── Helpers ───
function getModifierList(item) {
  const raw = item.modifiers
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

function hasModifiers(item) {
  return getModifierList(item).length > 0
}

function formatModName(mod) {
  return String(mod).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function getPlaceholder(item) {
  const idx = items.value.findIndex(i => i.id === item.id)
  return foodImages[((idx >= 0 ? idx : Math.abs(hashCode(item.name || ''))) % foodImages.length)]
}

function hashCode(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0
  return h
}

// v-for key. Falls back to a composite when an item has no id, so a regressed
// feed cannot hand Vue 45 duplicate keys and break list reconciliation.
function itemKey(item) {
  return item.id || `${item.category || ''}::${item.name || ''}::${item.price || 0}`
}

// Cart count for badge (aggregates all cart lines matching this menu item id).
// A blank id must never match: when the API served every item with id:"" this
// comparison was true for all 45 cards, so a single add lit up the whole grid.
function storeCartCount(menuItemId) {
  if (!menuItemId) return 0
  return orderStore.items
    .filter(i => i.menuItemId && i.menuItemId === menuItemId)
    .reduce((s, i) => s + i.qty, 0)
}

// ─── Item click → modifier sheet or direct add ───
function handleItemClick(item, qty = 1) {
  if (item.available === false) return
  if (hasModifiers(item)) {
    modifierTarget.value = item
    showModifierSheet.value = true
  } else {
    // No modifiers — add directly
    for (let i = 0; i < qty; i++) {
      orderStore.addItem({
        menuItemId: item.id,
        name: item.name,
        basePrice: parseFloat(item.price || 0),
        course: courseForNewLines.value
      })
    }
  }
}

/**
 * Press and hold to order several at once.
 *
 * Adding was one tap for one unit, so a round of four coffees was four taps on
 * the same tile, or one tap and then a trip into the check to press + three
 * times. Quantity is the most repeated interaction on this screen and it had
 * no shortcut.
 *
 * Hold rather than a separate control because the grid is already dense and
 * every tile would otherwise need a stepper it rarely uses.
 */
const qtyTarget = ref(null)
const QUANTITIES = [2, 3, 4, 5, 6, 8, 10, 12]
let holdTimer = null
let heldFired = false

function startHold(item) {
  if (item.available === false) return
  heldFired = false
  holdTimer = setTimeout(() => {
    heldFired = true
    qtyTarget.value = item
  }, 450)
}

function endHold() {
  clearTimeout(holdTimer)
  holdTimer = null
}

/**
 * The tap handler, suppressed when a hold has already opened the picker —
 * otherwise letting go would add one on top of the quantity chosen.
 */
function onTileClick(item) {
  if (heldFired) { heldFired = false; return }
  handleItemClick(item)
}

function addQuantity(n) {
  const item = qtyTarget.value
  qtyTarget.value = null
  if (item) handleItemClick(item, n)
}

function onModifierConfirm(selection) {
  showModifierSheet.value = false
  orderStore.addItem({ ...selection, course: courseForNewLines.value })
}

// ─── Navigate to checkout ───
function goToCheckout() {
  if (orderStore.isEmpty) return
  // Keep table/customer context — the waiter already chose it on the floor plan.
  orderStore.resetCheckout({ keepOrderContext: true })
  orderStore.checkoutStep = 'cart'
  showCart.value = false
  router.push('/app/checkout')
}

/**
 * Hold the table for this party, and say so plainly when we cannot.
 *
 * The server owns exclusivity — it refuses a table that already has a party on
 * it or that sits inside a booking's window — and answers 409 with who holds
 * it. `newSeating` tells it this is a fresh party rather than another round on
 * the tab already there, which is the one thing it cannot work out for itself.
 *
 * Returns false when the table could not be taken, and has already explained
 * why, so the caller can stop rather than fire food at it.
 */
async function claimTable(tableNum) {
  try {
    const tableRes = await apiGet('tables')
    const tables = Array.isArray(tableRes) ? tableRes : []
    const match = tables.find(t => String(t.number) === String(tableNum))
    // A table the floor plan does not know about is not ours to hold, and
    // blocking the order over it would be worse than letting it through.
    if (!match) return true

    await apiPut('tables/' + match.id, {
      ...match,
      status: 'occupied',
      seated_at: new Date().toISOString(),
      newSeating: !orderStore.isAddRound,
    })
    return true
  } catch (e) {
    toast(e.message || `Table ${tableNum} is not available`, 'error')
    return false
  }
}

// ─── Send to Kitchen (Task 8) ───
// Creates the order immediately so the kitchen sees it before payment.
const sendingToKitchen = ref(false)
async function sendToKitchen() {
  if (orderStore.isEmpty || sendingToKitchen.value) return
  sendingToKitchen.value = true
  try {
    if (orderStore.isAddRound && orderStore.activeOpenOrderId) {
      // Adding a round to an existing open tab — PATCH
      const res = await apiPatch(
        `orders/${orderStore.activeOpenOrderId}/items`,
        { orderItems: orderStore.serializeOrderItems() }
      )
      if (res.ok) {
        toast(`Round added to order #${orderStore.activeOpenOrderId.slice(-4)}`, 'success')
      } else {
        throw new Error(res.error || 'Failed to add round')
      }
    } else {
      // New order — POST with status 'new', payment 'unpaid'
      const payload = orderStore.buildOrderPayload({
        payment: 'unpaid',
        status: 'new',
        paymentBreakdown: [],
        tip: 0,
        tipType: 'none',
      })
      // Take the table before firing anything. This ran after the order was
      // posted and discarded its answer, so a waiter could send a round to a
      // table that was reserved or already had a party on it, hear nothing,
      // and leave the kitchen cooking for a table that was never theirs.
      if (orderStore.orderType === 'dine-in' && orderStore.tableNum) {
        const claimed = await claimTable(orderStore.tableNum)
        if (!claimed) return
      }

      const res = await apiPost('orders', payload)
      if (res.ok || res.id) {
        orderStore.activeOpenOrderId = res.id || res.orderId
        toast(`Order #${(res.id || res.orderId || '').slice(-4)} sent to kitchen!`, 'success')
      } else {
        throw new Error('Failed to send order')
      }
    }
    clearOrder()
  } catch (e) {
    toast('Could not send to kitchen: ' + e.message, 'error')
  } finally {
    sendingToKitchen.value = false
  }
}

// ─── Category / search ───
const categoryCounts = computed(() => {
  const c = {}
  items.value.forEach(i => { c[i.category] = (c[i.category] || 0) + 1 })
  return c
})

const filteredItems = computed(() => {
  let result = items.value
  if (activeCategory.value) result = result.filter(i => i.category === activeCategory.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(i => i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q))
  }
  return result
})

// ─── Table context ───
// TablesView sends the waiter here as /app/menu-view?table=N. Bind that to the
// order so the table survives all the way to checkout without being retyped.
const activeTable = computed(() => orderStore.tableNum)

function clearTable() {
  orderStore.tableNum = ''
  orderStore.orderType = 'takeaway'
}

// ─── Init ───
// ─── Keyboard shortcuts ───
// Escape closes cart / qty sheet; Enter opens checkout when cart has items.
function handleKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
  if (e.key === 'Escape') {
    if (qtyTarget.value) { qtyTarget.value = null; return }
    if (showClearConfirm.value) { showClearConfirm.value = false; return }
    if (showCart.value) { showCart.value = false; return }
  }
  if (e.key === 'Enter' && orderStore.items.length && !showCart.value) {
    e.preventDefault()
    goToCheckout()
  }
}

onMounted(() => {
  const t = route.query.table
  if (t) {
    orderStore.tableNum = String(t)
    orderStore.orderType = 'dine-in'
  }
  // Guarded: jsdom and older browsers have no matchMedia, and a missing check
  // panel must not take the rest of the screen down with it.
  if (typeof window !== 'undefined' && window.matchMedia) {
    dockQuery = window.matchMedia(CHECK_DOCK_QUERY)
    checkDocked.value = dockQuery.matches
    if (dockQuery.addEventListener) dockQuery.addEventListener('change', syncDock)
    else dockQuery.addListener(syncDock)
  }
  document.addEventListener('keydown', handleKeydown)
  loadData()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (!dockQuery) return
  if (dockQuery.removeEventListener) dockQuery.removeEventListener('change', syncDock)
  else dockQuery.removeListener(syncDock)
})
async function loadData() {
  try {
    items.value = await apiGet('menu')
    const catSet = new Set()
    items.value.forEach(i => { if (i.category) catSet.add(i.category) })
    categories.value = Array.from(catSet)
  } catch (e) { console.error(e) }
  loading.value = false
}
</script>

<style scoped>
.menu-view-shell{display:flex;flex-direction:column;height:100%}
.menu-main{display:flex;flex-direction:column;min-height:0;flex:1}

/* ── Docked check ──────────────────────────────────────────────────────────
   On a landscape tablet the shell becomes two columns and the cart sheet stops
   being a sheet: no backdrop, no slide, no dismissing it. The same markup does
   both jobs, so the order can never disagree between the two presentations. */
.menu-view-shell.check-docked{flex-direction:row;gap:14px}
.check-docked .menu-main{min-width:0}
.check-docked .cart-sheet-overlay{position:static;inset:auto;z-index:auto;background:none;backdrop-filter:none;display:block;flex:0 0 340px;width:340px}
.check-docked .cart-sheet{width:340px;max-width:none;max-height:100%;height:100%;border-radius:var(--radius-md);border:1px solid var(--border);padding:16px;padding-bottom:16px;box-shadow:var(--shadow-card)}
/* The sheet animation is for something that arrives; a docked panel is simply
   there, and sliding it in on every resize would be noise. */
.check-docked .cart-slide-enter-active .cart-sheet,
.check-docked .cart-slide-leave-active .cart-sheet{transition:none}
.check-docked .menu-grid-wrapper{padding-bottom:16px}

/* ── Course selector ───────────────────────────────────────────────────────
   Sets what the next tap belongs to. Quiet by default: most orders are one
   drop and the main course is already the answer, so this must not compete
   with the categories above it. */
.course-bar{display:flex;align-items:center;gap:6px;padding:0 16px 8px;flex-shrink:0}
.course-label{font-size:.66rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-right:2px}
.course-chip{padding:5px 12px;border-radius:99px;border:1.5px solid var(--border);background:var(--surface);font-size:.74rem;font-weight:600;color:var(--text-muted);cursor:pointer;min-height:32px;transition:all var(--duration-fast) var(--ease)}
.course-chip.active{background:var(--primary);border-color:var(--primary);color:#fff}

.cart-item-course{font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px}

/* ── Compact list mode ─────────────────────────────────────────────────────
   The same cards laid out as rows with the photo dropped, for somebody who
   knows the menu and is locating a known name rather than recognising a
   picture.

   Worth being honest about where it wins. On a narrow phone it does not: the
   photo grid is three squares to a row and beats a single column of rows on
   items per screen. It pays off from tablet width up, where the photo grid
   thins to two tall tiles a row and the list runs two or three short rows
   instead — and on a phone it still buys full, untruncated dish names. */
.density-toggle{flex-shrink:0;width:38px;height:38px;border-radius:var(--radius-sm);border:1.5px solid var(--border);background:var(--surface);color:var(--text-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all var(--duration-fast) var(--ease)}
.density-toggle:hover{border-color:var(--primary);color:var(--primary)}
.density-toggle svg{width:18px;height:18px}

.menu-grid.is-list{grid-template-columns:1fr;gap:6px}
@media(min-width:640px){.menu-grid.is-list{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1400px){.menu-grid.is-list{grid-template-columns:repeat(3,1fr)}}
.is-list .menu-card{aspect-ratio:auto;display:flex;align-items:center;min-height:52px}
.is-list .menu-card .menu-img{display:none}
/* Beats the narrow-container rules, which lift the caption onto the photo. */
.is-list .menu-card .menu-info{position:static;background:none;padding:9px 12px;flex:1;min-width:0}
.is-list .menu-card .menu-name-row{flex-direction:row;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:0}
.is-list .menu-card .menu-info h3{color:var(--text-heading);font-size:.88rem;text-shadow:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.is-list .menu-card .menu-price{color:var(--primary);font-size:.9rem;text-shadow:none}
.is-list .menu-card .menu-desc,.is-list .menu-card .menu-meta,.is-list .menu-card .menu-modifiers{display:none}
.is-list .menu-card .menu-add-btn{display:none}
.is-list .menu-card:hover{transform:none}
/* The in-cart count has no photo to sit on any more. */
.is-list .menu-badge{position:static;margin-right:10px;flex-shrink:0}

/* ── Quantity picker ───────────────────────────────────────────────────────
   Deliberately large targets: this is used mid-service, one-handed, while
   holding something else. */
.qty-overlay{position:fixed;inset:0;z-index:400;background:rgba(28,25,23,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px}
.qty-sheet{background:var(--surface);border-radius:var(--radius-lg);padding:20px;width:100%;max-width:340px;box-shadow:var(--shadow-xl)}
.qty-title{font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:2px}
.qty-item{font-size:1rem;font-weight:700;color:var(--text-heading);margin-bottom:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qty-options{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.qty-option{min-height:56px;border-radius:var(--radius-md);border:1.5px solid var(--border);background:var(--surface);font-size:1.15rem;font-weight:700;font-family:var(--font-mono);color:var(--text-heading);cursor:pointer;transition:all var(--duration-fast) var(--ease)}
.qty-option:hover,.qty-option:active{background:var(--primary);border-color:var(--primary);color:#fff}
.qty-cancel{width:100%;justify-content:center}

.cart-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px 12px;color:var(--text-muted)}
.cart-empty-title{font-weight:600;color:var(--text-heading);margin-bottom:4px}
.cart-empty-hint{font-size:.8rem}

/* Active table context bar */
.table-context-bar{display:flex;align-items:center;gap:10px;padding:9px 14px;margin-bottom:12px;border-radius:var(--radius-md);background:var(--teal-50);border:1.5px solid var(--primary);flex-shrink:0}
.tcb-icon{display:flex;color:var(--primary);flex-shrink:0}
.tcb-icon svg{width:17px;height:17px}
.tcb-label{flex:1;font-size:.85rem;color:var(--text-heading)}
.tcb-label strong{color:var(--primary);font-weight:700}
.tcb-clear{background:none;border:none;color:var(--primary);font-size:.78rem;font-weight:600;cursor:pointer;padding:4px 8px;border-radius:var(--radius-sm)}
.tcb-clear:hover{background:rgba(15,123,120,.1)}
:global([data-theme="dark"]) .table-context-bar{background:rgba(15,123,120,.15)}

/* Category tabs */
.menu-categories{display:flex;gap:6px;overflow-x:auto;padding-bottom:12px;flex-shrink:0;scrollbar-width:none}
.menu-categories::-webkit-scrollbar{display:none}
.cat-tab{display:flex;align-items:center;gap:6px;padding:8px 14px;min-height:44px;border-radius:99px;border:1.5px solid var(--border);background:var(--surface);color:var(--text-body);font-size:.78rem;font-weight:500;white-space:nowrap;cursor:pointer;transition:all var(--duration-fast) var(--ease);flex-shrink:0}
.cat-tab:hover{border-color:var(--primary);color:var(--primary);background:var(--teal-50)}
.cat-tab.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.cat-tab .cat-icon{font-size:1rem}
.cat-tab .cat-count{font-size:.72rem;font-weight:600;background:var(--neutral-100);padding:0 6px;border-radius:99px;min-width:18px;text-align:center}
.cat-tab.active .cat-count{background:rgba(255,255,255,.2);color:#fff}

/* Search */
.menu-search-bar{display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-md);margin-bottom:16px;transition:border-color var(--duration-fast)}
.menu-search-bar:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px rgba(15,123,120,.1)}
.search-icon{width:18px;height:18px;color:var(--text-muted);flex-shrink:0}
.menu-search-input{border:none;outline:none;background:transparent;flex:1;font-size:.88rem;color:var(--text-heading)}
.menu-search-input::placeholder{color:var(--neutral-400)}
.search-clear{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.9rem;padding:2px 6px}

/* Grid */
.menu-grid-wrapper{flex:1;overflow-y:auto;padding-bottom:80px}
/* 300px minimum fitted only three cards on a laptop: the sidebar takes 240px, so
   a 1366px screen leaves ~1080px of grid and 1080/300 rounds down to 3. Table
   service POS layouts sit at four to five columns, and a waiter scanning for a
   dish is served far better by seeing most of a category at once than by large
   photographs. 190px lands at five columns on that same laptop and six on a
   1600px screen, while still leaving room for the name and price to stay at
   full size - the card gets denser, the text does not get smaller. */
.menu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}

/* The card is its own container, so what gets dropped depends on how wide THAT
   card actually is rather than on the viewport. A phone in landscape and a
   narrow column on a laptop are the same problem, and a viewport media query
   cannot tell them apart. Name and price are never hidden - they are the whole
   point of the card - so shrinking can never make an item unidentifiable. */
.menu-card{container-type:inline-size}
/* Selectors are deliberately two-deep. The max-width:600px block at the bottom
   of this file also sets .menu-info padding, and being later in source order it
   would otherwise win on a phone - which is exactly where these rules matter
   most. */
@container (max-width:230px){
  .menu-card .menu-desc{display:none}
  .menu-card .menu-info{padding:10px 12px 12px}
}
@container (max-width:175px){
  .menu-card .menu-meta,.menu-card .menu-modifiers{display:none}

  /* Below this width the card holds nothing but a picture, a name and a price,
     so the picture becomes the card and the two lines sit on it.
     Stacked, this was a 67px strip of photo under 110px of text and reserved
     button space — two thirds of a tile whose job is to let somebody recognise
     a dish at a glance.
     Square rather than 16/10, because the height freed by dropping the caption
     is better spent on the image than on shorter rows. */
  /* The image stays in flow and gives the card its height; only the caption is
     lifted out. Setting aspect-ratio on the card instead collapsed it to
     nothing: the card is its own container, so with both children taken out of
     flow there was no content left to size it from. */
  .menu-card .menu-img{aspect-ratio:1/1}
  .menu-card .menu-info{position:absolute;left:0;right:0;bottom:0;
    padding:22px 9px 7px;
    background:linear-gradient(to top,rgba(0,0,0,.9) 0%,rgba(0,0,0,.5) 60%,transparent 100%)}
  .menu-card .menu-name-row{flex-direction:column;gap:1px;margin-bottom:0}
  .menu-card .menu-info h3{color:#fff;font-size:.78rem;line-height:1.25;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.5)}
  .menu-card .menu-price{color:#fff;font-size:.8rem;text-shadow:0 1px 2px rgba(0,0,0,.5)}

  /* The button and the card fire the same handler — it is an affordance, not a
     second action — and a card this size is already several times the touch
     minimum. Dropping it here returns the whole width to the name, which was
     otherwise squeezed into whatever the 44px button left over. */
  .menu-card .menu-add-btn{display:none}
}

/* Holding a tile picks a quantity, so the hold must not also select the dish
   name or raise the iOS press-and-hold callout. */
.menu-card{background:var(--surface);border-radius:var(--radius-md);border:1.5px solid var(--border);overflow:hidden;cursor:pointer;position:relative;transition:all var(--duration-base) var(--ease-out);box-shadow:var(--shadow-xs);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.menu-card:hover{transform:translateY(-3px);box-shadow:var(--shadow-card-hover);border-color:var(--primary)}
.menu-card:active{transform:translateY(-1px);transition-duration:50ms}
.menu-card.unavailable{opacity:.5;pointer-events:none}
.menu-card.in-cart{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary)}
.menu-card.pulse-add{animation:pulse-add .4s var(--ease-out)}
@keyframes pulse-add{0%{transform:scale(1)}30%{transform:scale(.97)}60%{transform:scale(1.02)}100%{transform:scale(1)}}

.menu-img{position:relative;width:100%;aspect-ratio:16/10;overflow:hidden;background:var(--neutral-50)}
.menu-img img{width:100%;height:100%;object-fit:cover;transition:transform var(--duration-slow) var(--ease-out)}
.menu-card:hover .menu-img img{transform:scale(1.08)}
.menu-img-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:.82rem;text-transform:uppercase;letter-spacing:.06em}
.menu-badge{position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;font-size:.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(15,123,120,.3);animation:badge-pop .3s var(--ease-out)}
@keyframes badge-pop{0%{transform:scale(0)}50%{transform:scale(1.15)}100%{transform:scale(1)}}

.menu-info{padding:14px 16px 16px}
.menu-name-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px}
.menu-info h3{font-size:1.05rem;font-weight:700;color:var(--text-heading);line-height:1.3}
.menu-price{font-size:1.05rem;font-weight:700;color:var(--primary);font-family:var(--font-mono);white-space:nowrap;flex-shrink:0}

.menu-desc{font-size:.82rem;color:var(--text-muted);line-height:1.45;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

.menu-meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.menu-category-tag{font-size:.72rem;color:var(--text-muted);background:var(--neutral-50);padding:2px 8px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em;font-weight:500}
.menu-cost-badge{font-size:.72rem;color:var(--success);background:var(--green-50);padding:2px 8px;border-radius:99px;font-weight:600}
.menu-modifiers{display:flex;gap:4px;flex-wrap:wrap}
.mod-tag{font-size:.72rem;color:var(--text-muted);background:var(--neutral-50);padding:2px 8px;border-radius:4px;border:1px solid var(--border)}
.mod-more{color:var(--primary);background:var(--teal-50);border-color:var(--teal-200)}

/* 44x44 is the baseline, not a mobile-only override — this is the single most
   tapped control in the app (one per menu card) and the POS runs on tablets at
   >=1024px, which never matched the old mobile breakpoint. */
.menu-add-btn{position:absolute;bottom:14px;right:14px;width:44px;height:44px;border-radius:50%;border:none;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:all var(--duration-base) var(--ease-out);box-shadow:var(--shadow-primary)}
.menu-card:hover .menu-add-btn{opacity:1;transform:translateY(0)}
/* Reveal-on-hover hid this button completely on the hardware the POS actually
   runs on. It was forced visible only under max-width:600px, but the tablets are
   >=1024px touch screens with no hover at all, so the primary add control was
   invisible there and staff had to know the whole card was tappable. Any device
   without hover gets it permanently. */
@media(hover:none){
  .menu-add-btn{opacity:1}
}
/* Keyboard users need it too - it was reachable by Tab but never painted. */
.menu-add-btn:focus-visible{opacity:1;outline:2px solid var(--primary);outline-offset:2px}
.menu-add-btn:hover{background:var(--primary-hover);transform:scale(1.1)!important}
.menu-add-btn svg{width:20px;height:20px}

.menu-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:var(--text-muted);gap:12px}
.menu-loading-spinner{width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.menu-empty{grid-column:1/-1;text-align:center;padding:48px 20px;color:var(--text-muted)}
.menu-empty-icon{font-size:2.5rem;margin-bottom:12px}

/* Floating Cart */
.floating-cart{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:200;background:var(--teal-800);color:#fff;border-radius:var(--radius-lg);padding:12px 20px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(7,55,53,.3);cursor:pointer;transition:all var(--duration-base) var(--ease-out);min-width:240px;max-width:90vw;border:1px solid rgba(255,255,255,.1)}
.floating-cart:hover{transform:translateX(-50%) translateY(-2px);box-shadow:0 12px 40px rgba(7,55,53,.4)}
.fc-icon{position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center}
.fc-icon svg{width:24px;height:24px}
.fc-badge{position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:var(--accent);color:var(--teal-900);font-size:.72rem;font-weight:700;display:flex;align-items:center;justify-content:center}
.fc-details{display:flex;flex-direction:column;gap:1px;flex:1}
.fc-count{font-size:.7rem;opacity:.7;text-transform:uppercase;letter-spacing:.05em}
.fc-total{font-size:1.05rem;font-weight:700;font-family:var(--font-mono)}
.fc-chevron svg{width:18px;height:18px;transition:transform var(--duration-fast)}
.fc-chevron svg.rotated{transform:rotate(180deg)}

/* Cart Sheet */
.cart-sheet-overlay{position:fixed;inset:0;z-index:300;background:rgba(28,25,23,.5);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center}
.cart-sheet{background:var(--surface);border-radius:var(--radius-lg) var(--radius-lg) 0 0;width:100%;max-width:500px;max-height:70vh;display:flex;flex-direction:column;box-shadow:var(--shadow-xl);padding:20px 24px;padding-bottom:calc(20px + env(safe-area-inset-bottom))}
.cart-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border);flex-shrink:0}
.cart-header h3{font-size:1.1rem;color:var(--text-heading);font-weight:600}
.cart-items{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
.cart-item{display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--neutral-50);border-radius:var(--radius-sm);border:1px solid var(--border)}
.cart-item-info{flex:1;min-width:0}
.cart-item-name{font-size:.85rem;font-weight:600;color:var(--text-heading);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cart-item-price{font-size:.72rem;color:var(--text-muted);font-family:var(--font-mono)}
.cart-qty{display:flex;align-items:center;gap:6px;flex-shrink:0}
/* 44px minimum touch target — these steppers change the guest's bill and are
   tapped constantly on a handheld tablet. */
.qty-btn{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--border);background:var(--surface);color:var(--text-heading);font-size:1.1rem;font-weight:600;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all var(--duration-fast);flex-shrink:0}
.qty-btn:hover{background:var(--primary);color:#fff;border-color:var(--primary)}
.qty-value{font-size:.95rem;font-weight:700;font-family:var(--font-mono);min-width:24px;text-align:center;color:var(--text-heading)}
/* Destructive, so it gets its own 44px target and is spaced away from −/+ to
   stop mis-taps that silently change the bill. */
.cart-remove{width:44px;height:44px;margin-left:6px;border-radius:50%;border:none;background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem;transition:all var(--duration-fast);flex-shrink:0}
.cart-remove:hover{background:var(--red-50);color:var(--danger)}

.cart-footer{flex-shrink:0;border-top:1px solid var(--border);padding-top:12px}
.cart-total-row{display:flex;justify-content:space-between;font-size:.82rem;color:var(--text-muted);padding:2px 0}
.cart-grand-total{font-size:1.05rem;font-weight:700;color:var(--text-heading);padding:6px 0 12px;border-top:1px solid var(--border);margin-top:4px}
/* The primary action sits on top. `order` rather than two copies of the
   markup, so there is one Send button and one Checkout button whatever the
   order type. */
.cart-actions{display:flex;flex-direction:column;gap:8px}
.cart-actions.settle-first .cart-checkout{order:-1}
.cart-action{width:100%;justify-content:center;padding:12px;font-size:.92rem;gap:8px}
.cart-checkout{width:100%;justify-content:center;padding:12px;font-size:.92rem;gap:8px}
.cart-action-hint{margin:8px 2px 0;font-size:.72rem;line-height:1.35;color:var(--text-muted);text-align:center}
.cart-checkout svg{width:20px;height:20px}

.cart-slide-enter-active{transition:opacity .2s var(--ease)}
.cart-slide-enter-active .cart-sheet{transition:transform .3s var(--ease-out)}
.cart-slide-leave-active{transition:opacity .15s var(--ease)}
.cart-slide-leave-active .cart-sheet{transition:transform .2s var(--ease)}
.cart-slide-enter-from{opacity:0}
.cart-slide-enter-from .cart-sheet{transform:translateY(100%)}
.cart-slide-leave-to{opacity:0}
.cart-slide-leave-to .cart-sheet{transform:translateY(100%)}

@media(max-width:600px){
  /* Three across on a phone. The container queries above have already dropped
     the description and tags by this width, so what remains is the photo, the
     name and the price - which is what a waiter taps against. */
  .menu-grid{grid-template-columns:repeat(3,1fr);gap:8px}
  .menu-card:hover{transform:none}
  .menu-card:hover .menu-img img{transform:none}
  .menu-add-btn{opacity:1;bottom:10px;right:10px;width:44px;height:44px}
  .menu-add-btn svg{width:20px;height:20px}
  .menu-info{padding:10px 12px 12px}
  .menu-info h3{font-size:.95rem}
  .menu-price{font-size:.95rem}
  .menu-desc{font-size:.75rem;-webkit-line-clamp:1}
  .floating-cart{bottom:80px;padding:10px 16px;min-width:200px}
  .cart-sheet{padding:16px;border-radius:var(--radius-md) var(--radius-md) 0 0}
}

/* Must come after the 600px block, which also sets menu-grid columns. Below
   ~360px three across leaves under 100px per card, where a dish name wraps to
   four lines and stops being scannable, so two is the floor. */
@media(max-width:360px){
  .menu-grid{grid-template-columns:repeat(2,1fr)}
}
</style>
