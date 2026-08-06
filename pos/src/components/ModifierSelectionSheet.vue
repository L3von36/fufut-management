<template>
  <transition name="mod-sheet">
    <div v-if="visible" class="mod-overlay" @click.self="cancel">
      <div class="mod-sheet" @click.stop>
        <!-- Header -->
        <div class="mod-header">
          <div>
            <h3>{{ menuItem.name }}</h3>
            <p class="mod-base-price">ETB {{ parseFloat(menuItem.price || 0).toFixed(0) }}</p>
          </div>
          <button class="btn btn-sm btn-ghost" @click="cancel" aria-label="Close">✕</button>
        </div>

        <!-- Modifier groups -->
        <div class="mod-body">
          <!-- Notes -->
          <div class="mod-section">
            <label class="mod-section-label">Special Instructions</label>
            <input
              v-model="localNotes"
              type="text"
              placeholder="e.g. extra sugar, no ice..."
              class="input"
              @keydown.enter="confirm"
            />
          </div>

          <!-- Modifier options -->
          <div v-for="(mod, idx) in modifiers" :key="idx" class="mod-section">
            <label class="mod-section-label">{{ formatModName(mod) }}</label>
            <button
              class="mod-chip"
              :class="{ selected: selected.has(mod) }"
              @click="toggleMod(mod)"
            >
              <span class="mod-check" v-if="selected.has(mod)">✓</span>
              {{ formatModName(mod) }}
            </button>
          </div>

          <!-- Quantity -->
          <div class="mod-section mod-qty-section">
            <label class="mod-section-label">Quantity</label>
            <div class="mod-qty-controls">
              <button class="mod-qty-btn" @click="localQty > 1 && localQty--">−</button>
              <span class="mod-qty-value">{{ localQty }}</span>
              <button class="mod-qty-btn" @click="localQty++">+</button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="mod-footer">
          <button class="btn btn-secondary" @click="cancel">Cancel</button>
          <div class="mod-footer-right">
            <span class="mod-line-price">ETB {{ linePrice.toFixed(0) }}</span>
            <button class="btn btn-primary" @click="confirm">Add to Cart</button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  menuItem: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['confirm', 'cancel'])

const selected = ref(new Set())
const localNotes = ref('')
const localQty = ref(1)

// Modifier list from menu item
const modifiers = computed(() => {
  const raw = props.menuItem.modifiers
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean)
  return []
})

// Reset when a new item is shown
watch(() => props.menuItem.id, () => {
  selected.value = new Set()
  localNotes.value = ''
  localQty.value = 1
}, { immediate: true })

// Also reset when sheet opens
watch(() => props.visible, (v) => {
  if (v) {
    selected.value = new Set()
    localNotes.value = ''
    localQty.value = 1
  }
})

const basePrice = computed(() => parseFloat(props.menuItem.price || 0))

const linePrice = computed(() => {
  // All modifiers have priceDelta: 0 (menu.json doesn't encode modifier prices)
  // But the structure supports non-zero deltas for future use
  return basePrice.value * localQty.value
})

function toggleMod(mod) {
  const s = new Set(selected.value)
  if (s.has(mod)) s.delete(mod)
  else s.add(mod)
  selected.value = s
}

function formatModName(mod) {
  // Convert kebab-case to readable: "oat-milk" → "Oat Milk"
  return String(mod)
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function confirm() {
  emit('confirm', {
    menuItemId: props.menuItem.id,
    name: props.menuItem.name,
    basePrice: basePrice.value,
    qty: localQty.value,
    selectedModifiers: Array.from(selected.value).map(name => ({
      name,
      priceDelta: 0,
      type: 'option'
    })),
    notes: localNotes.value.trim()
  })
}

function cancel() {
  emit('cancel')
}
</script>

<style scoped>
/* Overlay */
.mod-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  background: rgba(28, 25, 23, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

/* Sheet */
.mod-sheet {
  background: var(--surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
  padding: 0;
}

/* Header */
.mod-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.mod-header h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-heading);
  margin-bottom: 2px;
}
.mod-base-price {
  font-size: .85rem;
  color: var(--primary);
  font-family: var(--font-mono);
  font-weight: 600;
}

/* Body */
.mod-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mod-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mod-section-label {
  font-size: .72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--text-muted);
}

/* Modifier chips */
.mod-chips-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.mod-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-body);
  font-size: .85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease);
  min-height: 44px;
}
.mod-chip:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--teal-50);
}
.mod-chip.selected {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.mod-chip.selected:hover {
  background: var(--primary-hover);
}
.mod-check {
  font-size: .8rem;
  font-weight: 700;
}

/* Quantity controls */
.mod-qty-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mod-qty-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-heading);
  font-size: 1.1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-fast);
}
.mod-qty-btn:hover {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.mod-qty-value {
  font-size: 1.2rem;
  font-weight: 700;
  font-family: var(--font-mono);
  min-width: 32px;
  text-align: center;
}

/* Footer */
.mod-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.mod-footer-right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.mod-line-price {
  font-size: 1.15rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-heading);
}

/* Transitions */
.mod-sheet-enter-active { transition: opacity .2s var(--ease); }
.mod-sheet-enter-active .mod-sheet { transition: transform .3s var(--ease-out); }
.mod-sheet-leave-active { transition: opacity .15s var(--ease); }
.mod-sheet-leave-active .mod-sheet { transition: transform .2s var(--ease); }
.mod-sheet-enter-from { opacity: 0; }
.mod-sheet-enter-from .mod-sheet { transform: translateY(100%); }
.mod-sheet-leave-to { opacity: 0; }
.mod-sheet-leave-to .mod-sheet { transform: translateY(100%); }

@media (max-width: 600px) {
  .mod-sheet { padding: 0; }
  .mod-header { padding: 16px; }
  .mod-body { padding: 12px 16px; }
  .mod-footer { padding: 12px 16px; }
}
</style>
