import { ref } from 'vue'

/**
 * Composable for toast notifications with multiple types, icons, and queuing
 * Supports: success, error, info, warning
 */
export function useToast() {
  const toasts = ref([])
  
  const TOAST_TYPES = {
    success: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      bg: 'rgba(46, 125, 50, 0.95)',
      border: 'rgba(46, 125, 50, 0.3)'
    },
    error: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      bg: 'rgba(211, 47, 47, 0.95)',
      border: 'rgba(211, 47, 47, 0.3)'
    },
    info: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      bg: 'rgba(37, 99, 235, 0.95)',
      border: 'rgba(37, 99, 235, 0.3)'
    },
    warning: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      bg: 'rgba(217, 119, 6, 0.95)',
      border: 'rgba(217, 119, 6, 0.3)'
    }
  }

  const DEFAULT_TITLES = {
    success: 'Success',
    error: 'Error',
    info: 'Info',
    warning: 'Warning'
  }

  function ensureContainer() {
    let container = document.getElementById('toastContainer')
    if (container) return container
    
    container = document.createElement('div')
    container.id = 'toastContainer'
    container.className = 'toast-container'
    container.setAttribute('aria-live', 'polite')
    container.setAttribute('aria-atomic', 'true')
    document.body.appendChild(container)
    
    if (!document.querySelector('style[data-toast-styles]')) {
      const style = document.createElement('style')
      style.setAttribute('data-toast-styles', 'true')
      style.textContent = `
        .toast-container { position: fixed; top: 16px; right: 16px; z-index: 9999; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
        .toast-notification { position: relative; pointer-events: auto; width: 100%; max-width: 400px; min-width: 280px; padding: 14px 18px; border-radius: 16px; display: flex; align-items: flex-start; gap: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.08); backdrop-filter: blur(10px); animation: toastSlideIn 320ms cubic-bezier(.4,0,.2,1) both; overflow: hidden; }
        .toast-notification.hidden { animation: toastSlideOut 320ms cubic-bezier(.4,0,.2,1) both; }
        @keyframes toastSlideIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes toastSlideOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }
        .toast-notification .toast-icon { flex-shrink: 0; width: 20px; height: 20px; }
        .toast-notification .toast-content { flex: 1; min-width: 0; }
        .toast-notification .toast-title { font-weight: 600; font-size: 14px; line-height: 1.3; color: #fff; margin-bottom: 4px; }
        .toast-notification .toast-message { font-size: 14px; line-height: 1.4; color: rgba(255,255,255,.9); }
        .toast-notification .toast-dismiss { flex-shrink: 0; background: none; border: none; color: rgba(255,255,255,.7); cursor: pointer; padding: 0; margin: -4px -4px -4px auto; opacity: .7; transition: opacity 180ms cubic-bezier(.2,.7,.2,1); }
        .toast-notification .toast-dismiss:hover { opacity: 1; color: #fff; }
        .toast-notification .toast-dismiss:focus { outline: none; opacity: 1; color: #fff; }
        .toast-notification .toast-dismiss svg { width: 18px; height: 18px; display: block; }
        .toast-notification.toast-success { background: rgba(46,125,50,.95); border: 1px solid rgba(46,125,50,.3); color: #fff; }
        .toast-notification.toast-error { background: rgba(211,47,47,.95); border: 1px solid rgba(211,47,47,.3); color: #fff; }
        .toast-notification.toast-info { background: rgba(37,99,235,.95); border: 1px solid rgba(37,99,235,.3); color: #fff; }
        .toast-notification.toast-warning { background: rgba(217,119,6,.95); border: 1px solid rgba(217,119,6,.3); color: #fff; }
        @media (max-width: 480px) { .toast-notification { max-width: calc(100vw - 32px); min-width: auto; } }
      `
      document.head.appendChild(style)
    }
    return container
  }

  function escapeHtml(text) {
    if (typeof text !== 'string') return text
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  function createToast(type, message, title, duration) {
    const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    const toastType = TOAST_TYPES[type] || TOAST_TYPES.info
    
    const toastEl = document.createElement('div')
    toastEl.id = toastId
    toastEl.className = 'toast-notification toast-' + type
    toastEl.setAttribute('role', 'alert')
    
    const iconHtml = toastType.icon || ''
    const titleHtml = title ? '<div class="toast-title">' + escapeHtml(title) + '</div>' : ''
    const messageHtml = '<div class="toast-message">' + escapeHtml(message) + '</div>'
    
    const dismissBtn = '<button class="toast-dismiss" aria-label="Dismiss notification">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
      '</svg>' +
      '</button>'
    
    toastEl.innerHTML = iconHtml + '<div class="toast-content">' + titleHtml + messageHtml + '</div>' + dismissBtn
    
    const dismissEl = toastEl.querySelector('.toast-dismiss')
    dismissEl.addEventListener('click', () => dismissToast(toastId))
    
    const autoDuration = duration !== undefined ? duration : 4000
    toastEl._autoDismissTimer = setTimeout(() => dismissToast(toastId), autoDuration)
    
    return { id: toastId, element: toastEl, type }
  }

  function showToast(type, message, options = {}) {
    const container = ensureContainer()
    const title = options.title || DEFAULT_TITLES[type] || 'Notification'
    const duration = options.duration !== undefined ? options.duration : 4000
    
    const toast = createToast(type, message, title, duration)
    toasts.value.push(toast)
    container.appendChild(toast.element)
    
    requestAnimationFrame(() => toast.element.classList.add('show'))
    
    toast.element.addEventListener('animationend', (e) => {
      if (e.animationName === 'toastSlideOut') {
        toast.element.remove()
        toasts.value = toasts.value.filter(t => t.id !== toast.id)
      }
    })
  }

  function dismissToast(toastId) {
    const index = toasts.value.findIndex(t => t.id === toastId)
    if (index === -1) return
    const toast = toasts.value[index]
    if (toast.element && toast.element._autoDismissTimer) {
      clearTimeout(toast.element._autoDismissTimer)
    }
    if (toast.element) {
      toast.element.classList.add('hidden')
    }
  }

  function dismissAll() {
    toasts.value.forEach(toast => {
      if (toast.element && toast.element._autoDismissTimer) {
        clearTimeout(toast.element._autoDismissTimer)
      }
      if (toast.element) {
        toast.element.classList.add('hidden')
      }
    })
    toasts.value = []
  }

  return {
    toasts,
    toast: showToast,
    success: (msg, opts) => showToast('success', msg, opts),
    error: (msg, opts) => showToast('error', msg, opts),
    info: (msg, opts) => showToast('info', msg, opts),
    warning: (msg, opts) => showToast('warning', msg, opts),
    dismiss: dismissToast,
    dismissAll
  }
}
