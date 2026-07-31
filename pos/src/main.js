import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './assets/styles.css'
import BaseButton from './components/BaseButton.vue'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.component('BaseButton', BaseButton)
app.mount('#app')

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pos/sw.js').catch(() => {})
  })
}
