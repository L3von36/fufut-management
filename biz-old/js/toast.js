/* ============================================================
   FU FUT COFFEE — Toast Notification System (Standalone for biz-old)
   Global toast notifications with multiple types, icons, colors, and queuing
   ============================================================ */

(function initToastSystem() {
  'use strict';

  const CONFIG = {
    duration: 4000,
    position: 'top-right',
    maxVisible: 5,
    gap: 12,
    animationDuration: 320
  };

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
  };

  const DEFAULT_TITLES = {
    success: 'Success',
    error: 'Error',
    info: 'Info',
    warning: 'Warning'
  };

  let container = null;
  let queue = [];
  let visibleToasts = [];

  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    container.classList.add('toast-container--' + CONFIG.position);
    document.body.appendChild(container);

    if (!document.querySelector('style[data-toast-styles]')) {
      const style = document.createElement('style');
      style.setAttribute('data-toast-styles', 'true');
      style.textContent = `
        .toast-container { position: fixed; pointer-events: none; z-index: 9999; display: flex; flex-direction: column; gap: ${CONFIG.gap}px; padding: 16px; max-width: 100%; box-sizing: border-box; }
        .toast-container.toast-container--top-right { top: 0; right: 0; align-items: flex-end; }
        .toast-container.toast-container--top-left { top: 0; left: 0; align-items: flex-start; }
        .toast-container.toast-container--bottom-right { bottom: 0; right: 0; align-items: flex-end; }
        .toast-container.toast-container--bottom-left { bottom: 0; left: 0; align-items: flex-start; }
        .toast-notification { position: relative; pointer-events: auto; width: 100%; max-width: 400px; min-width: 280px; padding: 14px 18px; border-radius: 16px; display: flex; align-items: flex-start; gap: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.08); backdrop-filter: blur(10px); animation: toastSlideIn ${CONFIG.animationDuration}ms cubic-bezier(.4,0,.2,1) both; will-change: transform, opacity; overflow: hidden; }
        .toast-notification.hidden { animation: toastSlideOut ${CONFIG.animationDuration}ms cubic-bezier(.4,0,.2,1) both; }
        @keyframes toastSlideIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes toastSlideOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }
        .toast-notification .toast-icon { flex-shrink: 0; width: 20px; height: 20px; color: currentColor; }
        .toast-notification .toast-content { flex: 1; min-width: 0; }
        .toast-notification .toast-title { font-weight: 600; font-size: 14px; line-height: 1.3; color: #fff; margin-bottom: 4px; }
        .toast-notification .toast-message { font-size: 14px; line-height: 1.4; color: rgba(255,255,255,.9); }
        .toast-notification .toast-dismiss { flex-shrink: 0; background: none; border: none; color: rgba(255,255,255,.7); cursor: pointer; padding: 0; margin: -4px -4px -4px auto; opacity: .7; transition: opacity 180ms cubic-bezier(.2,.7,.2,1); }
        .toast-notification .toast-dismiss:hover { opacity: 1; color: #fff; }
        .toast-notification .toast-dismiss:focus { outline: none; opacity: 1; color: #fff; }
        .toast-notification .toast-dismiss svg { width: 18px; height: 18px; display: block; }
        .toast-notification.toast-success { background: ${TOAST_TYPES.success.bg}; border: 1px solid ${TOAST_TYPES.success.border}; color: ${TOAST_TYPES.success.color || '#fff'}; }
        .toast-notification.toast-error { background: ${TOAST_TYPES.error.bg}; border: 1px solid ${TOAST_TYPES.error.border}; color: ${TOAST_TYPES.error.color || '#fff'}; }
        .toast-notification.toast-info { background: ${TOAST_TYPES.info.bg}; border: 1px solid ${TOAST_TYPES.info.border}; color: ${TOAST_TYPES.info.color || '#fff'}; }
        .toast-notification.toast-warning { background: ${TOAST_TYPES.warning.bg}; border: 1px solid ${TOAST_TYPES.warning.border}; color: ${TOAST_TYPES.warning.color || '#fff'}; }
        @media (max-width: 480px) { .toast-notification { max-width: calc(100vw - 32px); min-width: auto; } }
      `;
      document.head.appendChild(style);
    }
    return container;
  }

  function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function createToast(type, message, title, duration) {
    const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const toastType = TOAST_TYPES[type] || TOAST_TYPES.info;

    const toastEl = document.createElement('div');
    toastEl.id = toastId;
    toastEl.className = 'toast-notification toast-' + type;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');

    const iconHtml = toastType.icon || '';
    const titleHtml = title ? '<div class="toast-title">' + escapeHtml(title) + '</div>' : '';
    const messageHtml = '<div class="toast-message">' + escapeHtml(message) + '</div>';

    const dismissBtn = '<button class="toast-dismiss" aria-label="Dismiss notification">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
      '</svg>' +
      '</button>';

    toastEl.innerHTML = iconHtml + '<div class="toast-content">' + titleHtml + messageHtml + '</div>' + dismissBtn;

    const dismissEl = toastEl.querySelector('.toast-dismiss');
    dismissEl.addEventListener('click', function(e) {
      e.stopPropagation();
      dismissToast(toastId);
    });

    const autoDuration = duration !== undefined ? duration : CONFIG.duration;
    toastEl._autoDismissTimer = setTimeout(function() {
      dismissToast(toastId);
    }, autoDuration);

    return { id: toastId, element: toastEl, type: type };
  }

  function showToast(type, message, options) {
    options = options || {};
    ensureContainer();

    const title = options.title || DEFAULT_TITLES[type] || 'Notification';
    const duration = options.duration !== undefined ? options.duration : CONFIG.duration;

    const toast = createToast(type, message, title, duration);
    queue.push(toast);
    processQueue();

    return toast.id;
  }

  function processQueue() {
    visibleToasts = visibleToasts.filter(function(toast) {
      return toast.element && toast.element.parentNode;
    });

    while (queue.length > 0 && visibleToasts.length < CONFIG.maxVisible) {
      const toast = queue.shift();
      displayToast(toast);
    }
  }

  function displayToast(toast) {
    if (!container) return;
    container.appendChild(toast.element);
    visibleToasts.push(toast);
    toast.element.classList.add('hidden');
    requestAnimationFrame(function() {
      toast.element.classList.remove('hidden');
    });
    toast.element.addEventListener('animationend', function onAnimationEnd(e) {
      if (e.animationName === 'toastSlideOut') {
        toast.element.remove();
        visibleToasts = visibleToasts.filter(function(t) { return t.id !== toast.id; });
        processQueue();
      }
    });
  }

  function dismissToast(toastId) {
    const toastIndex = visibleToasts.findIndex(function(t) { return t.id === toastId; });
    if (toastIndex === -1) return;
    const toast = visibleToasts[toastIndex];
    if (!toast.element) return;
    if (toast.element._autoDismissTimer) {
      clearTimeout(toast.element._autoDismissTimer);
    }
    toast.element.classList.add('hidden');
  }

  function dismissAll() {
    visibleToasts.forEach(function(toast) {
      if (toast.element && toast.element._autoDismissTimer) {
        clearTimeout(toast.element._autoDismissTimer);
      }
      if (toast.element) {
        toast.element.classList.add('hidden');
      }
    });
    visibleToasts = [];
    queue = [];
  }

  // Store the original toast if it exists
  const originalToast = window.toast;

  window.toast = {
    show: showToast,
    success: function(message, options) { return showToast('success', message, options); },
    error: function(message, options) { return showToast('error', message, options); },
    info: function(message, options) { return showToast('info', message, options); },
    warning: function(message, options) { return showToast('warning', message, options); },
    dismiss: dismissToast,
    dismissAll: dismissAll,
    config: function(newConfig) {
      Object.assign(CONFIG, newConfig);
    }
  };

  // Backwards compatibility for existing toast() function calls in biz-old
  // The old code uses: toast('message', 'type')
  if (typeof originalToast === 'function') {
    window.toast._original = originalToast;
  }
  
  // Override window.toast to also work as a function
  const toastObj = window.toast;
  window.toast = function(message, type) {
    // If called as toast(msg, type) - backwards compatible
    if (type !== undefined && typeof type === 'string') {
      return showToast(type, message);
    }
    // If called as toast(msg) - default to success
    if (typeof message === 'string' && type === undefined) {
      return showToast('success', message);
    }
    // Otherwise return the object for method access
    return toastObj;
  };
  // Ensure the methods are still accessible
  window.toast.success = toastObj.success;
  window.toast.error = toastObj.error;
  window.toast.info = toastObj.info;
  window.toast.warning = toastObj.warning;
  window.toast.dismiss = toastObj.dismiss;
  window.toast.dismissAll = toastObj.dismissAll;
  window.toast.config = toastObj.config;

  if (typeof window.showToast === 'function') {
    window.oldShowToast = window.showToast;
  }
  window.showToast = function(message, duration) {
    window.toast.info(message, { duration: duration });
  };

})();
