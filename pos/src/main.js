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
    navigator.serviceWorker.register('/pos/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err.message)
    })
  })
}

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.warn('[Unhandled Promise]:', event.reason)
})
