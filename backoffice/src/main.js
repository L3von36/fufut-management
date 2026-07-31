import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './assets/styles.css'
import BaseButton from './components/BaseButton.vue'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.component('BaseButton', BaseButton)

// Try to restore existing session
import('./stores/auth').then(({ useAuthStore }) => {
  useAuthStore().checkSession().finally(() => {
    app.mount('#app')
  })
})
