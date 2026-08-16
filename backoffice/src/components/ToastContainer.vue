<template>
  <TransitionGroup
    tag="div"
    name="toast"
    class="toast-container"
    role="region"
    aria-live="polite"
    aria-atomic="false"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      class="toast-notification"
      :class="'toast-' + t.type"
      :role="t.type === 'error' ? 'alert' : 'status'"
    >
      <span class="toast-icon" aria-hidden="true" v-html="icons[t.type]"></span>
      <div class="toast-content">
        <div v-if="t.title" class="toast-title">{{ t.title }}</div>
        <div class="toast-message">{{ t.message }}</div>
      </div>
      <button class="toast-dismiss" aria-label="Dismiss notification" @click="dismiss(t.id)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </TransitionGroup>
</template>

<script setup>
import { useToast } from '../composables/useToast'

const { toasts, dismiss } = useToast()

const icons = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}

.toast-notification {
  pointer-events: auto;
  width: 100%;
  max-width: 340px;
  min-width: 240px;
  padding: 12px 14px;
  border-radius: 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.16);
  color: #fff;
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
}

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

.toast-notification .toast-content { flex: 1; min-width: 0; }
.toast-notification .toast-title { font-weight: 600; font-size: 13px; line-height: 1.3; margin-bottom: 2px; color: #fff; }
.toast-notification .toast-message { font-size: 13px; line-height: 1.4; color: rgba(255,255,255,.92); word-break: break-word; }

.toast-notification .toast-dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  color: rgba(255,255,255,.6);
  cursor: pointer;
  padding: 6px;
  margin: -6px -6px -6px auto;
  border-radius: 6px;
  line-height: 0;
  transition: background 150ms ease, color 150ms ease;
}
.toast-notification .toast-dismiss:hover { color: #fff; background: rgba(255,255,255,.12); }
.toast-notification .toast-dismiss:focus { outline: 2px solid rgba(255,255,255,.4); color: #fff; }
.toast-notification .toast-dismiss svg { width: 14px; height: 14px; display: block; }

.toast-notification.toast-success { background: rgba(34,120,69,.96); }
.toast-notification.toast-error   { background: rgba(198,40,40,.96); }
.toast-notification.toast-info    { background: rgba(30,90,210,.96); }
.toast-notification.toast-warning { background: rgba(200,105,10,.96); }

/* Enter / leave handled by Vue's TransitionGroup — no reliance on animationend */
.toast-enter-active, .toast-leave-active { transition: all .28s cubic-bezier(.22,1,.36,1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(40px) scale(.96); }
.toast-leave-active { position: absolute; }

@media (max-width: 600px) {
  .toast-container {
    top: auto;
    bottom: 80px;
    left: 12px;
    right: 12px;
    align-items: stretch;
  }
  .toast-notification { max-width: 100%; min-width: 0; width: 100%; }
  .toast-leave-active { position: relative; }
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active, .toast-leave-active { transition: none; }
}
</style>
