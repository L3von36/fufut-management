<template>
  <div class="app-shell" :class="{ 'sidebar-open': sidebarOpen }">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-logo">
        <img :src="logoUrl" alt="" @error="$event.target.src = fallbackLogo" />
        <span>FU FUT <small>Admin</small></span>
      </div>
      <nav class="sidebar-nav">
        <template v-for="section in navSections" :key="section.name">
          <div class="nav-section" v-if="section.items.length">{{ section.name }}</div>
          <div v-for="item in section.items" :key="item.view" class="nav-item"
            :class="{ active: currentView === item.view }"
            @click="navigate(item.view)" tabindex="0" role="button">
            <span v-html="icons[item.icon]"></span>
            {{ item.label }}
            <span v-if="item.view === 'orders' && ordersBadge > 0" class="nav-badge">{{ ordersBadge }}</span>
          </div>
        </template>
      </nav>
      <div class="sidebar-footer">
        <button @click="logout">Sign Out</button>
      </div>
    </aside>
    <div class="sidebar-overlay" @click="sidebarOpen = false"></div>

    <!-- Main -->
    <div class="main">
      <header class="topbar">
        <div class="topbar-left">
          <button class="menu-toggle" @click="sidebarOpen = !sidebarOpen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
          <h2>{{ pageTitle }}</h2>
          <span v-if="currentView === 'orders' && ordersBadge > 0" class="topbar-badge">{{ ordersBadge }} new</span>
        </div>
        <div class="topbar-right">
          <button class="theme-toggle" @click="toggleTheme" :title="isDark ? 'Light mode' : 'Dark mode'">
            <svg v-if="isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <span class="date-display">{{ today }}</span>
        </div>
      </header>
      <div class="content-wrap">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NAV_ITEMS } from '../api'

const router = useRouter()
const route = useRoute()
const base = import.meta.env.BASE_URL
const logoUrl = base + 'assets/logo.webp'
const fallbackLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#0f7b78"/><text x="20" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="white">FU FUT</text></svg>')
const sidebarOpen = ref(false)
const currentView = ref('landing')
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark')
const ordersBadge = ref(0)

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}

// Listen for badge updates from OrdersView
function onOrdersBadge(e) {
  ordersBadge.value = e.detail || 0
}
onMounted(() => window.addEventListener('orders-badge', onOrdersBadge))
onUnmounted(() => window.removeEventListener('orders-badge', onOrdersBadge))

const icons = {
  'book': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  'star': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  'image': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  'layout': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
  'clipboard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
  'calendar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
}

const navSections = computed(() => {
  const map = {}
  for (const item of NAV_ITEMS) {
    if (!map[item.section]) { map[item.section] = { name: item.section, items: [] } }
    map[item.section].items.push(item)
  }
  return Object.values(map)
})

const pageTitle = computed(() => NAV_ITEMS.find(i => i.view === currentView.value)?.label || 'Landing Page')
const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

watch(() => route.name, (name) => { currentView.value = name || 'dashboard' }, { immediate: true })

function navigate(view) {
  sidebarOpen.value = false
  router.push('/app/' + view)
}

function logout() {
  sessionStorage.removeItem('admin_auth')
  router.push('/login')
}

onMounted(() => {
  if (!sessionStorage.getItem('admin_auth')) router.push('/login')
})
</script>

<style scoped>
.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ef4444;
  color: #fff;
  font-size: .6rem;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  margin-left: auto;
  flex-shrink: 0;
}
.topbar-badge {
  font-size: .72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  background: #ef4444;
  color: #fff;
  padding: 2px 10px;
  border-radius: 10px;
  margin-left: 10px;
  animation: pulse-topbar 1.5s ease-in-out infinite;
}
@keyframes pulse-topbar {
  0%, 100% { opacity: 1; }
  50% { opacity: .7; }
}
</style>
