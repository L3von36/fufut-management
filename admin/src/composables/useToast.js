import { ref } from 'vue'

/**
 * Toast notification store (singleton).
 *
 * API: toast(message, type?, options?)  — matches all existing call sites
 * Shortcut methods: success(msg, opts), error(msg, opts), info(msg, opts), warning(msg, opts)
 *
 * Toasts are a module-level reactive array. ToastContainer.vue (mounted once in
 * App.vue) renders them and handles enter/leave animations via Vue's
 * TransitionGroup, which removes elements from the DOM even when the browser
 * forces `prefers-reduced-motion` (a case where the old `animationend`-based
 * cleanup silently never ran and toasts never disappeared).
 */
const VALID_TYPES = new Set(['success', 'error', 'info', 'warning'])

const toasts = ref([])
let idSeq = 0
const timers = new Map()

function showToast(message, type, options = {}) {
  // Normalize swapped args: toast('error', 'Something broke')
  if (VALID_TYPES.has(message) && typeof type === 'string' && type.length > 0) {
    const tmp = message
    message = type
    type = tmp
  }
  const toastType = VALID_TYPES.has(type) ? type : 'info'
  const title = options.title || ''
  const duration = options.duration !== undefined ? options.duration : 4000
  const id = ++idSeq

  toasts.value.push({ id, type: toastType, message, title })

  if (duration > 0) {
    timers.set(id, setTimeout(() => dismissToast(id), duration))
  }
  return id
}

function dismissToast(id) {
  const timer = timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(id)
  }
  const index = toasts.value.findIndex(t => t.id === id)
  if (index !== -1) toasts.value.splice(index, 1)
}

function dismissAll() {
  timers.forEach(t => clearTimeout(t))
  timers.clear()
  toasts.value = []
}

export function useToast() {
  return {
    toasts,
    toast: showToast,
    success: (msg, opts) => showToast(msg, 'success', opts),
    error: (msg, opts) => showToast(msg, 'error', opts),
    info: (msg, opts) => showToast(msg, 'info', opts),
    warning: (msg, opts) => showToast(msg, 'warning', opts),
    dismiss: dismissToast,
    dismissAll
  }
}
