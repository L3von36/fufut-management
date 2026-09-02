import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'

// Permission sets mirroring src/api ROLE_PERMISSIONS. The low-privilege roles
// are the ones that mattered: the bottom nav used to be padded to 5 entries
// with `null`, and :key="item.view" on the wrapping <template> dereferenced
// those nulls before the child's v-if could skip them. Any role with fewer
// than 5 nav items crashed to a blank page.
const PERMS = {
  cleaner: ['waste', 'dashboard'],
  'delivery-staff': ['delivery', 'dashboard'],
  'assistant-chef': ['kitchen', 'orders', 'dashboard', 'inventory'],
  manager: ['dashboard', 'orders', 'tables', 'menu-view', 'checkout', 'kitchen', 'waste', 'staff'],
  // UX-2 (waiter mobile audit pass 2): Open Checks is the waiter's money
  // screen and belongs in the bottom bar, not three taps deep behind More.
  'head-waiter': ['tables', 'orders', 'open-checks', 'dashboard', 'menu-view', 'reservations', 'checkout', 'timeclock'],
  // Mirrors the real barista array: Orders is the READ-ONLY ticket list
  // granted in the station-support expansion (no checkout, no open checks).
  barista: ['barista', 'orders', 'alerts', 'waste', 'recipes', 'timeclock', 'my-activity']
}

let currentRole = 'cleaner'

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    user: { firstName: 'Test', role: currentRole },
    roleKey: currentRole,
    isAuthenticated: true,
    defaultView: 'dashboard',
    permissions: PERMS[currentRole],
    hasPermission: (v) => PERMS[currentRole].includes(v),
    logout: vi.fn()
  }))
}))

vi.mock('../../../src/api', async (orig) => {
  const actual = await orig()
  return { ...actual, isOnline: () => true }
})

// useSync starts a timer that reads the IndexedDB sync queue. Under jsdom that
// throws "tx.objectStore is not a function" as an *unhandled* rejection —
// which vitest reports but still exits 0 on locally, while CI fails the run.
// This component test is about nav rendering, so stub the sync engine out.
vi.mock('../../../src/composables/useSync', () => ({
  useSync: () => ({
    pendingCount: { value: 0 },
    syncing: { value: false },
    processQueue: vi.fn(),
    refreshCount: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  })
}))

import AppLayout from '../../../src/components/AppLayout.vue'

function mountAs(role) {
  currentRole = role
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', name: 'dashboard', component: { template: '<div/>' } }]
  })
  return mount(AppLayout, {
    global: {
      plugins: [router],
      provide: { toast: vi.fn(), confirm: vi.fn(), isOnline: () => true },
      stubs: { RouterView: true, RouterLink: true }
    }
  })
}

describe('AppLayout bottom nav', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it.each([
    ['cleaner', 2],
    ['delivery-staff', 2],
    ['assistant-chef', 4]
  ])('renders for %s, which has only %i nav items', (role) => {
    const wrapper = mountAs(role)
    expect(wrapper.html().length).toBeGreaterThan(0)
    expect(wrapper.find('.bottom-nav').exists()).toBe(true)
  })

  it('never emits a bottom-nav button without a view', () => {
    const wrapper = mountAs('cleaner')
    const buttons = wrapper.findAll('.bn-item:not(.bn-more)')
    expect(buttons.length).toBe(2)
    buttons.forEach(b => expect(b.text().trim()).not.toBe(''))
  })

  it('caps the bottom nav at 5 items for a broad role', () => {
    const wrapper = mountAs('manager')
    expect(wrapper.findAll('.bn-item:not(.bn-more)').length).toBeLessThanOrEqual(5)
  })

  it('pins Open Checks in the bottom bar for a role that holds it (head-waiter)', () => {
    const wrapper = mountAs('head-waiter')
    const labels = wrapper.findAll('.bn-item:not(.bn-more)').map(b => b.text())
    expect(labels.length).toBe(5)
    expect(labels.some(t => t.includes('Open Checks'))).toBe(true)
    // Dashboard is the view that yields its slot — still reachable in the
    // sidebar drawer.
    expect(labels.some(t => t.includes('Dashboard'))).toBe(false)
  })

  it('keeps the bar unchanged for a role without open-checks', () => {
    const wrapper = mountAs('cleaner')
    const labels = wrapper.findAll('.bn-item:not(.bn-more)').map(b => b.text())
    expect(labels.length).toBe(2)
    expect(labels.some(t => t.includes('Open Checks'))).toBe(false)
  })
})

describe('AppLayout sidebar sections', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // 'Sales' is the manager's group (Orders + Open Checks + Checkout). The
  // barista only holds the read-only ticket list, so their lone SALES header
  // reads like money access they don't have — the layout renames it Tickets.
  it('names the barista ticket group Tickets, not Sales', () => {
    const wrapper = mountAs('barista')
    const names = wrapper.findAll('.nav-section').map(d => d.text().trim())
    expect(names).toContain('Tickets')
    expect(names).not.toContain('Sales')
  })

  it('keeps the Sales group for a role that actually sells (manager)', () => {
    const wrapper = mountAs('manager')
    const names = wrapper.findAll('.nav-section').map(d => d.text().trim())
    expect(names).toContain('Sales')
    expect(names).not.toContain('Tickets')
  })
})
