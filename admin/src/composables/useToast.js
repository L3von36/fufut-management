import { ref } from 'vue'

/**
 * Toast notification composable.
 * Styles live in assets/styles.css — no runtime <style> injection.
 */
export function useToast() {
  const toasts = ref([])

  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  }

  const DEFAULT_TITLES = {
    success: 'Success',
    error: 'Error',
    info: 'Info',
    warning: 'Warning'
  }

  function getContainer() {
    let c = document.getElementById('toastContainer')
    if (c) return c
    c = document.createElement('div')
    c.id = 'toastContainer'
    c.className = 'toast-container'
    c.setAttribute('aria-live', 'polite')
    document.body.appendChild(c)
    return c
  }

  function escapeHtml(text) {
    if (typeof text !== 'string') return String(text)
    const d = document.createElement('div')
    d.textContent = text
    return d.innerHTML
  }

  function showToast(message, type, options = {}) {
    const container = getContainer()
    // Normalize: if message looks like a valid type and type is a message string, swap
    const VALID = new Set(['success', 'error', 'info', 'warning'])
    if (VALID.has(message) && typeof type === 'string' && type.length > 0) {
      const tmp = message; message = type; type = tmp
    }
    const toastType = VALID.has(type) ? type : 'info'
    const title = options.title || DEFAULT_TITLES[toastType] || ''
    const duration = options.duration !== undefined ? options.duration : 3500
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)

    const el = document.createElement('div')
    el.id = id
    el.className = 'toast-notification toast-' + toastType
    el.setAttribute('role', 'alert')

    const icon = TOAST_ICONS[toastType] || TOAST_ICONS.info
    const titleHtml = title ? '<div class="toast-title">' + escapeHtml(title) + '</div>' : ''

    el.innerHTML =
      '<div class="toast-icon">' + icon + '</div>' +
      '<div class="toast-content">' + titleHtml + '<div class="toast-message">' + escapeHtml(message) + '</div></div>' +
      '<button class="toast-dismiss" aria-label="Dismiss"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'

    el.querySelector('.toast-dismiss').addEventListener('click', () => dismiss(id))

    const timer = setTimeout(() => dismiss(id), duration)

    const toast = { id, element: el, timer }
    toasts.value.push(toast)
    container.appendChild(el)

    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'toastOut') {
        el.remove()
        toasts.value = toasts.value.filter(t => t.id !== id)
      }
    })
  }

  function dismiss(id) {
    const t = toasts.value.find(t => t.id === id)
    if (!t) return
    clearTimeout(t.timer)
    t.element.classList.add('removing')
    // Fallback removal if animation doesn't fire
    setTimeout(() => {
      if (t.element.parentNode) {
        t.element.remove()
        toasts.value = toasts.value.filter(x => x.id !== id)
      }
    }, 300)
  }

  function dismissAll() {
    toasts.value.forEach(t => {
      clearTimeout(t.timer)
      t.element.classList.add('removing')
      setTimeout(() => { if (t.element.parentNode) t.element.remove() }, 300)
    })
    toasts.value = []
  }

  return {
    toasts,
    toast: showToast,
    success: (msg, opts) => showToast(msg, 'success', opts),
    error: (msg, opts) => showToast(msg, 'error', opts),
    info: (msg, opts) => showToast(msg, 'info', opts),
    warning: (msg, opts) => showToast(msg, 'warning', opts),
    dismiss,
    dismissAll
  }
}
