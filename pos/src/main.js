import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './assets/styles.css'
import BaseButton from './components/BaseButton.vue'

const app = createApp(App)

// Global error handler — ensures unhandled errors are logged instead of silently swallowed
app.config.errorHandler = (err, instance, info) => {
  console.error(`[Vue Error] ${info}:`, err)
}

app.use(createPinia())
app.use(router)
app.component('BaseButton', BaseButton)
app.mount('#app')

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Built with `--base /`, so public assets are served from the site root.
    // '/pos/' is the vue-router base only — requesting /pos/sw.js hits the SPA
    // fallback and returns HTML, which the browser rejects as a script.
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err.message)
    })
  })
}

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.warn('[Unhandled Promise]:', event.reason)
})

// A deploy replaces the entire hashed-asset set. A tab still running the
// previous shell then fails its next lazy route import, and Vite surfaces
// that on the window as `vite:preloadError`. Reload once so the tab lands on
// the fresh shell (the shell itself is served no-store, so one reload is
// always enough) instead of staying broken until somebody force-quits the
// browser. The sessionStorage guard keeps a genuinely inconsistent deploy
// from becoming a reload loop: if another chunk fails within a minute of the
// last bounce, stop and let the error show so it can be diagnosed.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'pos:deploy-reload-at'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 60000) return
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ }
  window.location.reload()
})
