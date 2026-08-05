<template>
  <div class="menu-view-shell">
    <!-- Sticky Category Tabs -->
    <div class="menu-categories">
      <button v-for="cat in categories" :key="cat"
        class="cat-tab"
        :class="{ active: activeCategory === cat }"
        @click="activeCategory = cat"
      >
        <span class="cat-icon">{{ categoryIcons[cat] || '🍽️' }}</span>
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
    </div>

    <!-- Menu Grid -->
    <div class="menu-grid-wrapper">
      <div class="menu-grid">
        <div v-for="item in filteredItems" :key="item.id"
          class="menu-card"
          :class="{ unavailable: item.available === false, 'in-cart': cartCount(item.id) > 0 }"
          @click="addItem(item)"
        >
          <div class="menu-img">
            <img :src="item.image || getPlaceholder(item)" :alt="item.name" loading="lazy" />
            <div v-if="item.available === false" class="menu-img-overlay">Unavailable</div>
            <div v-if="cartCount(item.id) > 0" class="menu-badge">{{ cartCount(item.id) }}</div>
          </div>
          <div class="menu-info">
            <div class="menu-name-row">
              <h3>{{ item.name }}</h3>
              <span class="menu-price">ETB {{ parseFloat(item.price||0).toFixed(0) }}</span>
            </div>
            <p v-if="item.description" class="menu-desc">{{ item.description }}</p>
            <div class="menu-meta">
              <span class="menu-category-tag">{{ item.category }}</span>
              <span v-if="item.cost && parseFloat(item.cost) > 0" class="menu-cost-badge">Gross {{ ((parseFloat(item.price)-parseFloat(item.cost))/parseFloat(item.price)*100).toFixed(0) }}%</span>
            </div>
            <div v-if="item.modifiers?.length" class="menu-modifiers">
              <span v-for="mod in (typeof item.modifiers === 'string' ? item.modifiers.split(',') : item.modifiers).slice(0, 3)" :key="mod" class="mod-tag">{{ mod.trim() }}</span>
              <span v-if="(typeof item.modifiers === 'string' ? item.modifiers.split(',') : item.modifiers).length > 3" class="mod-tag mod-more">+{{ (typeof item.modifiers === 'string' ? item.modifiers.split(',') : item.modifiers).length - 3 }} more</span>
            </div>
          </div>
          <button class="menu-add-btn" @click.stop="addItem(item)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div v-if="!filteredItems.length" class="menu-empty">
          <div class="menu-empty-icon">🔍</div>
          <div v-if="search">No items matching "{{ search }}"</div>
          <div v-else>No items in this category</div>
        </div>
      </div>
    </div>

    <!-- Floating Cart -->
    <div v-if="cartTotal > 0" class="floating-cart" @click="showCart = !showCart">
      <div class="fc-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span class="fc-badge">{{ cartItemCount }}</span>
      </div>
      <div class="fc-details">
        <span class="fc-count">{{ cartItemCount }} item{{ cartItemCount !== 1 ? 's' : '' }}</span>
        <span class="fc-total">ETB {{ cartTotal.toFixed(0) }}</span>
      </div>
      <div class="fc-chevron">
        <svg :class="{ rotated: showCart }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>

    <!-- Cart Sheet -->
    <transition name="cart-slide">
      <div v-if="showCart" class="cart-sheet-overlay" @click.self="showCart=false">
        <div class="cart-sheet" @click.stop>
          <div class="cart-header">
            <h3>Current Order</h3>
            <button class="btn btn-sm btn-ghost" @click="clearCart">Clear All</button>
          </div>
          <div class="cart-items">
            <div v-for="(entry, idx) in cart" :key="entry.id + '-' + idx" class="cart-item">
              <div class="cart-item-info">
                <div class="cart-item-name">{{ entry.name }}</div>
                <div class="cart-item-price">ETB {{ (parseFloat(entry.price||0) * entry.quantity).toFixed(0) }}</div>
              </div>
              <div class="cart-qty">
                <button class="qty-btn" @click="decrementQty(idx)">−</button>
                <span class="qty-value">{{ entry.quantity }}</span>
                <button class="qty-btn" @click="incrementQty(idx)">+</button>
              </div>
              <button class="cart-remove" @click="removeItem(idx)">✕</button>
            </div>
          </div>
          <div class="cart-footer">
            <div class="cart-total-row">
              <span>Subtotal</span>
              <span>ETB {{ cartTotal.toFixed(0) }}</span>
            </div>
            <div class="cart-total-row cart-grand-total">
              <span>Total</span>
              <span>ETB {{ cartTotal.toFixed(0) }}</span>
            </div>
            <button class="btn btn-primary cart-checkout" @click="placeOrder" :disabled="orderBtnState.isBusy()" :aria-busy="orderBtnState.isBusy() ? 'true' : undefined">
              <span v-if="orderBtnState.isBusy()" class="btn-spinner" aria-hidden="true"></span>
              <span v-else-if="orderBtnState.isSuccess()" class="btn-check" aria-hidden="true">✓</span>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              {{ orderBtnState.isBusy() ? 'Sending...' : orderBtnState.isSuccess() ? 'Sent ✓' : orderBtnState.isError() ? 'Failed' : 'Send to Kitchen' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost } from '../api'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const items = ref([])
const activeCategory = ref('')
const search = ref('')
const cart = ref([])
const showCart = ref(false)
const orderSent = ref(false)
const orderBtnState = useButtonState()

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
  'Extra / ጭማሪዎች': '➕'
}

const foodImages = [
  '/assets/menu-1488477181946.jpg','/assets/menu-1512058564366.jpg','/assets/menu-1514432324607.jpg',
  '/assets/menu-1525351484163.jpg','/assets/menu-1540189549336.jpg','/assets/menu-1544025162.jpg',
  '/assets/menu-1546833999.jpg','/assets/menu-1547592180.jpg','/assets/menu-1555939594.jpg',
  '/assets/menu-1561047029.jpg','/assets/menu-1565958011703.jpg','/assets/menu-1567620905732.jpg',
  '/assets/menu-1576092768241.jpg','/assets/menu-1578985545062.jpg','/assets/menu-1606787366850.jpg',
  '/assets/menu-1608039829572.jpg','/assets/menu-1627308595229.jpg'
]

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

const cartItemCount = computed(() => cart.value.reduce((s, e) => s + e.quantity, 0))
const cartTotal = computed(() => cart.value.reduce((s, e) => s + parseFloat(e.price||0) * e.quantity, 0))

function getPlaceholder(item) {
  const idx = items.value.findIndex(i => i.id === item.id)
  return foodImages[((idx >= 0 ? idx : Math.abs(hashCode(item.name || ''))) % foodImages.length)]
}

function hashCode(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0
  return h
}

function cartCount(id) {
  const entry = cart.value.find(e => e.id === id)
  return entry ? entry.quantity : 0
}

function addItem(item) {
  if (item.available === false) return
  const existing = cart.value.find(e => e.id === item.id)
  if (existing) {
    existing.quantity++
  } else {
    cart.value.push({ ...item, quantity: 1, modifiers: item.modifiers || [] })
  }
  // Brief pulse feedback
  const el = document.querySelector(`.menu-card[data-id="${item.id}"]`)
  if (el) { el.classList.add('pulse-add'); setTimeout(() => el.classList.remove('pulse-add'), 400) }
}

function incrementQty(idx) { cart.value[idx].quantity++ }
function decrementQty(idx) {
  if (cart.value[idx].quantity <= 1) { cart.value.splice(idx, 1); if (!cart.value.length) showCart.value = false }
  else cart.value[idx].quantity--
}
function removeItem(idx) { cart.value.splice(idx, 1); if (!cart.value.length) showCart.value = false }
function clearCart() { cart.value = []; showCart.value = false }

async function placeOrder() {
  if (!cart.value.length || orderBtnState.isBusy()) return
  orderBtnState.setLoading()
  const orderItems = cart.value.map(i => `${i.name} x${i.quantity}`).join(', ')
  const total = cartTotal.value

  try {
    await apiPost('orders', {
      items: orderItems,
      total,
      status: 'new',
      payment: 'unpaid',
      created: new Date().toISOString()
    })
    orderBtnState.setSuccess()
    toast('Order sent to kitchen!')
    cart.value = []
    showCart.value = false
  } catch (e) {
    orderBtnState.setError('Failed to place order')
    toast('Failed to place order', 'error')
  }
}

onMounted(loadData)
async function loadData() {
  try {
    items.value = await apiGet('menu')
    // Derive categories from actual data, preserving order of first appearance
    const catSet = new Set()
    items.value.forEach(i => { if (i.category) catSet.add(i.category) })
    categories.value = Array.from(catSet)
  } catch (e) { console.error(e) }
}
</script>

<style scoped>
.menu-view-shell{display:flex;flex-direction:column;height:100%}

/* Category tabs */
.menu-categories{display:flex;gap:6px;overflow-x:auto;padding-bottom:12px;flex-shrink:0;scrollbar-width:none}
.menu-categories::-webkit-scrollbar{display:none}
.cat-tab{display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:99px;border:1.5px solid var(--border);background:var(--surface);color:var(--text-body);font-size:.78rem;font-weight:500;white-space:nowrap;cursor:pointer;transition:all var(--duration-fast) var(--ease);flex-shrink:0}
.cat-tab:hover{border-color:var(--primary);color:var(--primary);background:var(--teal-50)}
.cat-tab.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.cat-tab .cat-icon{font-size:1rem}
.cat-tab .cat-count{font-size:.65rem;font-weight:600;background:var(--neutral-100);padding:0 6px;border-radius:99px;min-width:18px;text-align:center}
.cat-tab.active .cat-count{background:rgba(255,255,255,.2);color:#fff}

/* Search */
.menu-search-bar{display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-md);margin-bottom:16px;transition:border-color var(--duration-fast)}
.menu-search-bar:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px rgba(15,123,120,.1)}
.search-icon{width:18px;height:18px;color:var(--text-muted);flex-shrink:0}
.menu-search-input{border:none;outline:none;background:transparent;flex:1;font-size:.88rem;color:var(--text-heading)}
.menu-search-input::placeholder{color:var(--neutral-400)}
.search-clear{background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:.9rem;padding:2px 6px}

/* Grid — LARGER CARDS */
.menu-grid-wrapper{flex:1;overflow-y:auto;padding-bottom:80px}
.menu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}

.menu-card{background:var(--surface);border-radius:var(--radius-md);border:1.5px solid var(--border);overflow:hidden;cursor:pointer;position:relative;transition:all var(--duration-base) var(--ease-out);box-shadow:var(--shadow-xs)}
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

/* Card info — BIGGER TEXT & PADDING */
.menu-info{padding:14px 16px 16px}
.menu-name-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px}
.menu-info h3{font-size:1.05rem;font-weight:700;color:var(--text-heading);line-height:1.3}
.menu-price{font-size:1.05rem;font-weight:700;color:var(--primary);font-family:var(--font-mono);white-space:nowrap;flex-shrink:0}

/* Description — NEW */
.menu-desc{font-size:.82rem;color:var(--text-muted);line-height:1.45;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

.menu-meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.menu-category-tag{font-size:.62rem;color:var(--text-muted);background:var(--neutral-50);padding:2px 8px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em;font-weight:500}
.menu-cost-badge{font-size:.6rem;color:var(--success);background:var(--green-50);padding:2px 8px;border-radius:99px;font-weight:600}
.menu-modifiers{display:flex;gap:4px;flex-wrap:wrap}
.mod-tag{font-size:.65rem;color:var(--text-muted);background:var(--neutral-50);padding:2px 8px;border-radius:4px;border:1px solid var(--border)}
.mod-more{color:var(--primary);background:var(--teal-50);border-color:var(--teal-200)}

/* Add button — BIGGER */
.menu-add-btn{position:absolute;bottom:14px;right:14px;width:40px;height:40px;border-radius:50%;border:none;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:all var(--duration-base) var(--ease-out);box-shadow:var(--shadow-primary)}
.menu-card:hover .menu-add-btn{opacity:1;transform:translateY(0)}
.menu-add-btn:hover{background:var(--primary-hover);transform:scale(1.1)!important}
.menu-add-btn svg{width:20px;height:20px}

.menu-empty{grid-column:1/-1;text-align:center;padding:48px 20px;color:var(--text-muted)}
.menu-empty-icon{font-size:2.5rem;margin-bottom:12px}

/* Floating Cart */
.floating-cart{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:200;background:var(--teal-800);color:#fff;border-radius:var(--radius-lg);padding:12px 20px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(7,55,53,.3);cursor:pointer;transition:all var(--duration-base) var(--ease-out);min-width:240px;max-width:90vw;border:1px solid rgba(255,255,255,.1)}
.floating-cart:hover{transform:translateX(-50%) translateY(-2px);box-shadow:0 12px 40px rgba(7,55,53,.4)}
.fc-icon{position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center}
.fc-icon svg{width:24px;height:24px}
.fc-badge{position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:var(--accent);color:var(--teal-900);font-size:.65rem;font-weight:700;display:flex;align-items:center;justify-content:center}
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
.qty-btn{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--surface);color:var(--text-heading);font-size:1rem;font-weight:600;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all var(--duration-fast)}
.qty-btn:hover{background:var(--primary);color:#fff;border-color:var(--primary)}
.qty-value{font-size:.95rem;font-weight:700;font-family:var(--font-mono);min-width:24px;text-align:center;color:var(--text-heading)}
.cart-remove{width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.78rem;transition:all var(--duration-fast)}
.cart-remove:hover{background:var(--red-50);color:var(--danger)}

.cart-footer{flex-shrink:0;border-top:1px solid var(--border);padding-top:12px}
.cart-total-row{display:flex;justify-content:space-between;font-size:.82rem;color:var(--text-muted);padding:2px 0}
.cart-grand-total{font-size:1.05rem;font-weight:700;color:var(--text-heading);padding:6px 0 12px;border-top:1px solid var(--border);margin-top:4px}
.cart-checkout{width:100%;justify-content:center;padding:14px;font-size:.95rem;gap:8px}
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
  .menu-grid{grid-template-columns:repeat(2,1fr);gap:10px}
  .menu-card:hover{transform:none}
  .menu-card:hover .menu-img img{transform:none}
  .menu-add-btn{opacity:1;bottom:10px;right:10px;width:34px;height:34px}
  .menu-add-btn svg{width:16px;height:16px}
  .menu-info{padding:10px 12px 12px}
  .menu-info h3{font-size:.95rem}
  .menu-price{font-size:.95rem}
  .menu-desc{font-size:.75rem;-webkit-line-clamp:1}
  .floating-cart{bottom:80px;padding:10px 16px;min-width:200px}
  .cart-sheet{padding:16px;border-radius:var(--radius-md) var(--radius-md) 0 0}
}
</style>