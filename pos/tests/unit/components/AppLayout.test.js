import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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

// Named routes for the views the Miller tests navigate to; the catch-all
// keeps every other path resolving as 'dashboard', exactly as before.
const ROUTES = [
  { path: '/app/dashboard', name: 'dashboard', component: { template: '<div/>' } },
  { path: '/app/kitchen', name: 'kitchen', component: { template: '<div/>' } },
  { path: '/app/checkout', name: 'checkout', component: { template: '<div/>' } },
  { path: '/:pathMatch(.*)*', name: 'dashboard', component: { template: '<div/>' } }
]

async function mountAs(role, path = '/app/dashboard') {
  currentRole = role
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES })
  router.push(path)
  await router.isReady()
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
  ])('renders for %s, which has only %i nav items', async (role) => {
    const wrapper = await mountAs(role)
    expect(wrapper.html().length).toBeGreaterThan(0)
    expect(wrapper.find('.bottom-nav').exists()).toBe(true)
  })

  it('never emits a bottom-nav button without a view', async () => {
    const wrapper = await mountAs('cleaner')
    const buttons = wrapper.findAll('.bn-item:not(.bn-more)')
    expect(buttons.length).toBe(2)
    buttons.forEach(b => expect(b.text().trim()).not.toBe(''))
  })

  // Miller's law (7±2): four destinations + More = five chunks. Six targets
  // truncated every label on a 360px phone; the rest live in the sheet.
  it('caps the bottom nav at 4 items for a broad role (Miller: 4 + More = five chunks)', async () => {
    const wrapper = await mountAs('manager')
    expect(wrapper.findAll('.bn-item:not(.bn-more)').length).toBe(4)
    expect(wrapper.find('.bn-more').exists()).toBe(true)
  })

  it('pins Open Checks in the bottom bar for a role that holds it (head-waiter)', async () => {
    const wrapper = await mountAs('head-waiter')
    const labels = wrapper.findAll('.bn-item:not(.bn-more)').map(b => b.text())
    expect(labels.length).toBe(4)
    expect(labels.some(t => t.includes('Open Checks'))).toBe(true)
    // Dashboard is the view that yields its slot — still reachable, one tap
    // deeper in the More sheet.
    expect(labels.some(t => t.includes('Dashboard'))).toBe(false)
  })

  it('keeps the bar unchanged for a role without open-checks', async () => {
    const wrapper = await mountAs('cleaner')
    const labels = wrapper.findAll('.bn-item:not(.bn-more)').map(b => b.text())
    expect(labels.length).toBe(2)
    expect(labels.some(t => t.includes('Open Checks'))).toBe(false)
  })

  // The role's landing screen rides in the bar: the first screen a person
  // sees should never be a More tap away from the controls they signed in
  // to use. Dashboard is exempt — information-only per UX-2.
  it('pins the role landing screen in the bar (head-chef → Kitchen, via assistant-chef perms)', async () => {
    const wrapper = await mountAs('assistant-chef')
    const labels = wrapper.findAll('.bn-item:not(.bn-more)').map(b => b.text())
    expect(labels[0]).toContain('Kitchen')
  })

  it('shows no More button when every screen fits in the bar', async () => {
    const wrapper = await mountAs('cleaner')
    expect(wrapper.find('.bn-more').exists()).toBe(false)
  })
})

describe('AppLayout More sheet (Miller: progressive disclosure)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // Level 2: the sheet holds ONLY the screens that did not make the bar —
  // never a repeat, never the whole app at once.
  it('opens a sheet of the unpinned screens, never repeating the bar', async () => {
    const wrapper = await mountAs('manager')
    await wrapper.find('.bn-more').trigger('click')
    expect(wrapper.find('.bn-sheet').exists()).toBe(true)
    const labels = wrapper.findAll('.bn-sheet-item').map(b => b.text())
    expect(labels.some(t => t.includes('Kitchen'))).toBe(true)
    expect(labels.some(t => t.includes('Waste Log'))).toBe(true)
    expect(labels.some(t => t.includes('Tables'))).toBe(false)
    expect(labels.some(t => t.includes('Orders'))).toBe(false)
    expect(labels.some(t => t.includes('Checkout'))).toBe(false)
  })

  // Level 3: inside the sheet, screens sit under their section headers —
  // small named chunks, not one long list.
  it('chunks the sheet by section headers', async () => {
    const wrapper = await mountAs('manager')
    await wrapper.find('.bn-more').trigger('click')
    const secNames = wrapper.findAll('.bn-sheet-sec-name').map(d => d.text())
    expect(secNames).toContain('Overview')
    expect(secNames).toContain('Operations')
    expect(secNames).toContain('Stock')
  })

  it('More lights up when the current screen lives in the sheet', async () => {
    const wrapper = await mountAs('manager', '/app/dashboard')
    await flushPromises()
    expect(wrapper.find('.bn-more').classes()).toContain('active')
  })

  it('tapping a sheet item navigates and closes the sheet', async () => {
    const wrapper = await mountAs('manager')
    await wrapper.find('.bn-more').trigger('click')
    const item = wrapper.findAll('.bn-sheet-item').find(b => b.text().includes('Kitchen'))
    await item.trigger('click')
    await flushPromises()
    expect(wrapper.find('.bn-sheet').exists()).toBe(false)
    expect(wrapper.vm.$route.name).toBe('kitchen')
  })

  it('closes on overlay tap and Escape, and releases the page scroll lock', async () => {
    const wrapper = await mountAs('manager')
    await wrapper.find('.bn-more').trigger('click')
    expect(document.body.classList.contains('bn-lock')).toBe(true)

    await wrapper.find('.bn-sheet-overlay').trigger('click')
    expect(wrapper.find('.bn-sheet').exists()).toBe(false)
    expect(document.body.classList.contains('bn-lock')).toBe(false)

    await wrapper.find('.bn-more').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('.bn-sheet').exists()).toBe(false)
    expect(document.body.classList.contains('bn-lock')).toBe(false)
  })
})

describe('AppLayout sidebar sections', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // 'Sales' is the manager's group (Orders + Open Checks + Checkout). The
  // barista only holds the read-only ticket list, so their lone SALES header
  // reads like money access they don't have — the layout renames it Tickets.
  it('names the barista ticket group Tickets, not Sales', async () => {
    const wrapper = await mountAs('barista')
    const names = wrapper.findAll('.nav-section').map(d => d.text().trim())
    expect(names).toContain('Tickets')
    expect(names).not.toContain('Sales')
  })

  it('keeps the Sales group for a role that actually sells (manager)', async () => {
    const wrapper = await mountAs('manager')
    const names = wrapper.findAll('.nav-section').map(d => d.text().trim())
    expect(names).toContain('Sales')
    expect(names).not.toContain('Tickets')
  })
})
