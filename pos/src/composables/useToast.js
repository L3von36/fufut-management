import { ref } from 'vue'

/**
 * Toast notification composable
 * API: toast(message, type?, options?)  — matches all existing call sites
 * Shortcut methods: toast.success(msg), toast.error(msg), etc.
 */
export function useToast() {
  const toasts = ref([])

  const TOAST_TYPES = {
    success: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    },
    error: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    },
    info: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    },
    warning: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    }
  }

  const VALID_TYPES = new Set(Object.keys(TOAST_TYPES))

  function ensureContainer() {
    let container = document.getElementById('toastContainer')
    if (!container) {
      container = document.createElement('div')
      container.id = 'toastContainer'
      container.className = 'toast-container'
      document.body.appendChild(container)
    }
    // App.vue renders a static #toastContainer, so these must be applied to
    // whichever container we ended up with — not only a freshly created one.
    container.setAttribute('aria-live', 'polite')
    container.setAttribute('aria-atomic', 'true')

    if (!document.querySelector('style[data-toast-styles]')) {
      const style = document.createElement('style')
      style.setAttribute('data-toast-styles', 'true')
      style.textContent = `
        /* Container */
        .toast-container {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
        }

        /* Toast item */
        .toast-notification {
          position: relative;
          pointer-events: auto;
          width: 100%;
          max-width: 340px;
          min-width: 260px;
          padding: 12px 14px;
          border-radius: 12px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,.12);
          backdrop-filter: blur(12px);
          animation: toastIn 300ms cubic-bezier(.22,1,.36,1) both;
          overflow: hidden;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .toast-notification.removing {
          animation: toastOut 250ms cubic-bezier(.4,0,1,1) both;
        }

        /* Slide from right (desktop) */
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px) scale(.96); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to   { opacity: 0; transform: translateX(40px) scale(.96); }
        }

        /* Icon */
        .toast-notification .toast-icon {
          flex-shrink: 0;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,.18);
          color: #fff;
        }
        .toast-notification .toast-icon svg { width: 16px; height: 16px; display: block; }

        /* Content */
        .toast-notification .toast-content { flex: 1; min-width: 0; }
        .toast-notification .toast-message {
          font-size: 13px;
          font-weight: 500;
          line-height: 1.4;
          color: #fff;
        }

        /* Dismiss */
        .toast-notification .toast-dismiss {
          flex-shrink: 0;
          background: none;
          border: none;
          color: rgba(255,255,255,.6);
          cursor: pointer;
          padding: 6px;
          margin: -6px -6px -6px auto;
          border-radius: 6px;
          transition: all 150ms ease;
          line-height: 0;
        }
        .toast-notification .toast-dismiss:hover { color: #fff; background: rgba(255,255,255,.12); }
        .toast-notification .toast-dismiss:focus { outline: 2px solid rgba(255,255,255,.4); color: #fff; }
        .toast-notification .toast-dismiss svg { width: 14px; height: 14px; display: block; }

        /* Type backgrounds */
        .toast-notification.toast-success { background: rgba(34,120,69,.94); color: #fff; }
        .toast-notification.toast-error   { background: rgba(198,40,40,.94);  color: #fff; }
        .toast-notification.toast-info    { background: rgba(30,90,210,.94);  color: #fff; }
        .toast-notification.toast-warning { background: rgba(200,105,10,.94); color: #fff; }

        /* Mobile: bottom-center, full-width */
        @media (max-width: 600px) {
          .toast-container {
            top: auto;
            bottom: 80px;
            left: 12px;
            right: 12px;
            align-items: stretch;
          }
          .toast-notification {
            max-width: 100%;
            min-width: 0;
            width: 100%;
            padding: 12px 14px;
          }
          @keyframes toastIn {
            from { opacity: 0; transform: translateY(20px) scale(.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes toastOut {
            from { opacity: 1; transform: translateY(0) scale(1); }
            to   { opacity: 0; transform: translateY(20px) scale(.97); }
          }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .toast-notification, .toast-notification.removing { animation: none !important; }
        }
      `
      document.head.appendChild(style)
    }
    return container
  }

  function escapeHtml(text) {
    if (typeof text !== 'string') return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  function createToast(type, message) {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9)
    const toastType = TOAST_TYPES[type] || TOAST_TYPES.info

    const el = document.createElement('div')
    el.id = id
    el.className = 'toast-notification toast-' + type
    el.setAttribute('role', 'alert')

    el.innerHTML =
      '<div class="toast-icon">' + (toastType.icon || '') + '</div>' +
      '<div class="toast-content"><div class="toast-message">' + escapeHtml(message) + '</div></div>' +
      '<button class="toast-dismiss" aria-label="Dismiss">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
        '</svg></button>'

    el.querySelector('.toast-dismiss').addEventListener('click', () => dismissToast(id))

    return { id, element: el, type }
  }

  /**
   * Show a toast notification
   * @param {string} message  - The message to display
   * @param {string} [type='info']  - Toast type: 'success' | 'error' | 'info' | 'warning'
   * @param {object} [options={}]  - { duration: number }
   */
  function showToast(message, type, options = {}) {
    const toastType = VALID_TYPES.has(type) ? type : 'info'
    const duration = options.duration !== undefined ? options.duration : 3500

    const container = ensureContainer()
    const toast = createToast(toastType, message)
    toasts.value.push(toast)
    container.appendChild(toast.element)

    toast.element._timer = setTimeout(() => dismissToast(toast.id), duration)

    toast.element.addEventListener('animationend', (e) => {
      if (e.animationName === 'toastOut') {
        toast.element.remove()
        toasts.value = toasts.value.filter(t => t.id !== toast.id)
      }
    })
  }

  function dismissToast(toastId) {
    const toast = toasts.value.find(t => t.id === toastId)
    if (!toast) return
    if (toast.element?._timer) clearTimeout(toast.element._timer)
    toast.element?.classList.add('removing')
  }

  function dismissAll() {
    toasts.value.forEach(t => {
      if (t.element?._timer) clearTimeout(t.element._timer)
      t.element?.classList.add('removing')
    })
    toasts.value = []
  }

  return {
    toasts,
    toast: showToast,
    success: (msg, opts) => showToast(msg, 'success', opts),
    error:   (msg, opts) => showToast(msg, 'error', opts),
    info:    (msg, opts) => showToast(msg, 'info', opts),
    warning: (msg, opts) => showToast(msg, 'warning', opts),
    dismiss: dismissToast,
    dismissAll
  }
}
