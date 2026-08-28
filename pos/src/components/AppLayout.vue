<template>
  <div class="app-shell" :class="{ 'sidebar-open': sidebarOpen, 'sidebar-collapsed': sidebarCollapsed }">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen, collapsed: sidebarCollapsed }">
      <div class="sidebar-brand">
        <div class="logo"><img :src="logoUrl" alt="" @error="$event.target.src = fallbackLogo" /></div>
        <div class="brand-text" v-show="!sidebarCollapsed">
          <span class="mark">FU FUT</span>
          <span class="eyebrow">{{ userDisplay }}</span>
        </div>
        <button class="sidebar-collapse-toggle" @click="sidebarCollapsed = !sidebarCollapsed">
          <svg v-if="sidebarCollapsed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>
      <nav class="sidebar-nav">
        <template v-for="section in navSections" :key="section.name">
          <div class="nav-section" v-if="section.items.length">{{ section.name }}</div>
          <div
            v-for="item in section.items"
            :key="item.view"
            class="nav-item"
            :class="{ active: currentView === item.view, 'icon-only': sidebarCollapsed }"
            @click="navigate(item.view)"
            @keydown.enter="navigate(item.view)"
            tabindex="0"
            role="button"
            :aria-current="currentView === item.view ? 'page' : undefined"
            :title="sidebarCollapsed ? item.label : ''"
          >
            <span class="nav-icon" v-html="icons[item.icon]"></span>
            <span v-show="!sidebarCollapsed">{{ item.label }}</span>
          </div>
        </template>
      </nav>
      <div class="sidebar-footer" v-show="!sidebarCollapsed">
        <button class="sidebar-logout-btn" @click="handleLogout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </div>
      <!-- Collapsed logout icon -->
      <div v-show="sidebarCollapsed" class="sidebar-collapsed-footer">
        <button class="nav-item icon-only sidebar-collapsed-logout" @click="handleLogout" title="Sign Out" aria-label="Sign Out">
          <span class="nav-icon" v-html="icons['log-out']"></span>
        </button>
      </div>
    </aside>
    <div class="sidebar-overlay" @click="sidebarOpen = false"></div>

    <!-- Main -->
    <div class="main">
      <header class="topbar">
        <div class="topbar-left">
          <button class="menu-toggle" @click="sidebarOpen = !sidebarOpen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
          <h2>{{ pageTitle }}</h2>
        </div>
        <div class="topbar-right">
          <button class="theme-toggle" @click="toggleTheme" :title="isDark ? 'Light mode' : 'Dark mode'">
            <svg v-if="isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <span class="date-display">{{ today }}</span>
        </div>
      </header>
      <!-- Offline Banner -->
      <!--
        The old wording said the data saves locally and syncs later, which is
        true and hides the thing that actually bites: queued writes sit on THIS
        device, so an order taken here does not reach the kitchen screen until
        the line is back. Toast tells staff the same and asks them to nominate
        one device for the outage; a waiter who does not know that will send
        food to a pass that never hears about it.
      -->
      <div v-if="!online" class="offline-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <strong>Offline.</strong> The kitchen will not see these orders until the connection returns — tell the chef directly.
        <span v-if="syncCount" style="font-weight:600">({{ syncCount }} waiting to send)</span>
      </div>
      <div v-else-if="syncing" class="offline-banner syncing"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;margin-right:4px"><line x1="12" y1="2" x2="12" y2="6"/><path d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2z"/></svg> Syncing data...</div>

      <AlertsBanner />

      <div class="content-wrap">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </div>

    <!-- Bottom Nav -->
    <nav class="bottom-nav">
      <button
        v-for="item in bottomItems"
        :key="item.view"
        class="bn-item"
        :class="{ active: currentView === item.view }"
        @click="navigate(item.view); sidebarOpen = false"
      >
        <span v-html="icons[item.icon]"></span>
        <span>{{ item.label }}</span>
      </button>
      <button class="bn-item bn-more" @click="sidebarOpen = true">
        <span v-html="icons['more-horizontal']"></span>
        <span>More</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { NAV_ITEMS, isOnline, onOnlineChange } from '../api'
import { useSync } from '../composables/useSync'
import { useOrderStore } from '../stores/order'
import AlertsBanner from './AlertsBanner.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const base = import.meta.env.BASE_URL
const logoUrl = base + 'assets/logo.webp'
const fallbackLogo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#0f7b78"/><text x="20" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="white">FU FUT</text></svg>')

const sidebarOpen = ref(false)
const sidebarCollapsed = ref(false)
const currentView = ref('dashboard')
const online = ref(isOnline())
const syncCount = ref(0)
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark')
const { pendingCount, syncing, start: startSync, stop: stopSync } = useSync()

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}

// SVG icons (inline, no dependencies)
const icons = {
  'layout-dashboard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  'shopping-cart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  'utensils': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
  'book': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  'grid-3x3': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  'calendar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  'truck': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  'chef-hat': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>',
  'wallet': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/><circle cx="18" cy="14" r="1"/></svg>',
  'chart-bar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  'cash': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
  'package': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
  'trash-2': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  'clock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  'fingerprint': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 0 0-10 10 10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2z"/><path d="M12 6a6 6 0 0 0-6 6 6 6 0 0 0 6 6 6 6 0 0 0 6-6 6 6 0 0 0-6-6z"/><path d="M12 10a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2z"/></svg>',
  'file-text': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  'more-horizontal': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  'log-out': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  'git-branch': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
  'trending-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  'bar-chart-2': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  'credit-card': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  'bell': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
}

function formatRole(role) {
  if (!role) return ''
  return role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const userDisplay = computed(() => {
  if (!auth.user) return 'Manager'
  return `${auth.user.firstName} • ${formatRole(auth.user.role)}`
})

const allowedItems = computed(() => {
  return NAV_ITEMS.filter(item => auth.hasPermission(item.view))
})

const navSections = computed(() => {
  const sections = []
  const map = {}
  for (const item of allowedItems.value) {
    if (!map[item.section]) {
      map[item.section] = { name: item.section, items: [] }
      sections.push(map[item.section])
    }
    map[item.section].items.push(item)
  }
  return sections
})

// Priority views for bottom nav (most-used by any role).
// UX-2 (waiter mobile audit pass 2): 'open-checks' pinned ahead of
// 'dashboard' — Open Checks is the waiter's money screen (what's owed;
// settle, split, move, merge) and lived three taps away behind More.
// Dashboard is the one information-only view of the six, and stays one tap
// away in the sidebar drawer; the bar still adapts per role, so roles that
// don't hold a view never see it.
const BOTTOM_PRIORITY = ['tables', 'orders', 'open-checks', 'menu-view', 'checkout', 'dashboard']

const bottomItems = computed(() => {
  const priorityViews = BOTTOM_PRIORITY.filter(v => allowedItems.value.some(i => i.view === v))
  const priority = priorityViews.map(v => allowedItems.value.find(i => i.view === v))
  const rest = allowedItems.value.filter(i => !priorityViews.includes(i.view))
  // Never pad to a fixed length. `.bn-item` is flex:1 inside a space-around
  // bar, so fewer items simply spread out. Padding with null used to crash
  // every role holding under 5 nav items — Assistant Chef, Delivery Staff and
  // Cleaner all rendered a blank page, because :key on the <template> reads
  // item.view before the child's v-if can skip it.
  return [...priority, ...rest].slice(0, 5)
})

const pageTitle = computed(() => {
  const item = NAV_ITEMS.find(i => i.view === currentView.value)
  return item?.label || currentView.value
})

const today = ref(new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))

watch(() => route.name, (name) => {
  currentView.value = name || 'dashboard'
}, { immediate: true })

// Online/sync status
watch(() => pendingCount.value, (c) => { syncCount.value = c })

/**
 * Notice when somebody else has signed in.
 *
 * The store reads the role once at startup. A till is a shared device, often
 * left open in more than one tab across a shift change, so the session can
 * change underneath a running app — and until now the screen carried on
 * showing the previous person's menu: a chef looking at Cash Drawer, a cashier
 * at Recipes. The server refuses the data behind those, so nothing leaks; it
 * simply looks as though roles do not work.
 *
 * Checked when the tab comes back to the front rather than on a timer, because
 * that is the moment somebody has picked the device up. Throttled so flicking
 * between tabs does not query the server repeatedly.
 */
const SESSION_RECHECK_MS = 10000
let lastCheck = 0

async function recheckSession() {
  if (document.visibilityState !== 'visible') return
  if (Date.now() - lastCheck < SESSION_RECHECK_MS) return
  lastCheck = Date.now()

  const verdict = await auth.revalidate()
  if (verdict === 'ended') {
    router.push('/login')
    return
  }
  if (verdict === 'changed') {
    // A different person. Reload rather than re-render: every open screen holds
    // the previous user's data in component state, and rebuilding the app is
    // the only way to be sure none of it survives the handover.
    window.location.reload()
  }
}

onMounted(() => {
  startSync()
  if (!auth.isAuthenticated) {
    router.push('/login')
  }
  document.addEventListener('visibilitychange', recheckSession)
  window.addEventListener('focus', recheckSession)
  // Update date at midnight boundary
  const dateTimer = setInterval(() => {
    today.value = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }, 60000)
})

const unsub = onOnlineChange((v) => { online.value = v })

onUnmounted(() => {
  stopSync()
  unsub()
  document.removeEventListener('visibilitychange', recheckSession)
  window.removeEventListener('focus', recheckSession)
})

function navigate(view) {
  if (view && auth.hasPermission(view)) {
    sidebarOpen.value = false
    router.push('/app/' + view)
  }
}

async function handleLogout() {
  // Clear the cart so the next person sees an empty POS, not the
  // previous user's items. The localStorage copy is already wiped by
  // auth.logout(); this resets the in-memory Pinia state.
  const orderStore = useOrderStore()
  orderStore.resetFull()
  await auth.logout()
  window.location.href = base + 'login'
}
</script>
