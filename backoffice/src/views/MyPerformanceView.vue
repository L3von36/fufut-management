<template>
  <div class="perf">
    <!-- Hero header -->
    <div class="perf-hero">
      <div class="perf-hero-left">
        <div class="perf-hero-greeting">{{ greeting }}, {{ firstName }}</div>
        <h2 class="perf-hero-title">My Activity</h2>
        <div class="perf-hero-meta">
          <span class="perf-hero-pill perf-hero-pill-name">{{ fullName }}</span>
          <span class="perf-hero-pill">
            <span class="perf-hero-pill-dot" :style="{ background: roleColor }"></span>
            {{ roleLabel }}
          </span>
          <span class="perf-hero-pill">{{ totalEntries }} action{{ totalEntries === 1 ? '' : 's' }} in range</span>
          <span class="perf-hero-pill">{{ rangeLabel }}</span>
        </div>
      </div>
      <div class="perf-hero-right">
        <button class="perf-refresh-btn" @click="loadAll" :disabled="loading" :title="loading ? 'Loading…' : 'Refresh'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               :class="{ 'perf-spin': loading }">
            <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Range tabs -->
    <div class="perf-range">
      <button v-for="opt in RANGE_OPTIONS" :key="opt.key"
              class="perf-range-tab"
              :class="{ active: range === opt.key }"
              @click="selectRange(opt.key)">
        <span class="perf-range-tab-icon" v-html="opt.icon"></span>
        <span>{{ opt.label }}</span>
      </button>
      <div class="perf-range-custom" v-if="range === 'custom'">
        <label>From <input type="date" v-model="customFrom" class="input input-sm" /></label>
        <label>To <input type="date" v-model="customTo" class="input input-sm" /></label>
        <button class="btn btn-primary btn-sm" @click="applyCustom">Apply</button>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading && !kpis.length" class="perf-kpi-grid">
      <div v-for="i in 4" :key="i" class="perf-kpi-card perf-skel">
        <div class="perf-skel-icon"></div>
        <div class="perf-skel-line perf-skel-label"></div>
        <div class="perf-skel-line perf-skel-value"></div>
        <div class="perf-skel-line perf-skel-sub"></div>
      </div>
    </div>

    <!-- KPI tiles -->
    <div v-else-if="kpis.length" class="perf-kpi-grid">
      <div v-for="(kpi, i) in kpis" :key="kpi.label" class="perf-kpi-card" :class="`perf-kpi-${kpi.bar || 'teal'}`" :style="{ animationDelay: `${i * 50}ms` }">
        <div class="perf-kpi-card-top">
          <div class="perf-kpi-icon" v-html="kpi.icon || ICONS.activity"></div>
          <div class="perf-kpi-trend" v-if="kpi.trend" :class="kpi.trendDir || 'up'">
            <svg v-if="kpi.trendDir === 'down'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            {{ kpi.trend }}
          </div>
        </div>
        <div class="perf-kpi-label">{{ kpi.label }}</div>
        <div class="perf-kpi-value">{{ kpi.value }}</div>
        <div class="perf-kpi-sub" v-if="kpi.sub">{{ kpi.sub }}</div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="perf-empty">
      <div class="perf-empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <h3>No activity in this range</h3>
      <p>Pick a different range, or do something — every order, delivery, payment and adjustment lands here automatically.</p>
    </div>

    <!-- Breakdown -->
    <div class="perf-breakdown" v-if="!loading && (entityBreakdown.length || actionBreakdown.length)">
      <div class="perf-breakdown-card" v-if="entityBreakdown.length">
        <div class="perf-breakdown-header">
          <h3>By Area</h3>
          <span class="perf-breakdown-count">{{ entityBreakdown.reduce((s, e) => s + e.count, 0) }}</span>
        </div>
        <ul class="perf-bar-list">
          <li v-for="e in entityBreakdown" :key="e.key">
            <div class="perf-bar-row">
              <span class="perf-bar-label">
                <span class="perf-bar-dot" :style="{ background: e.color }"></span>
                {{ e.label }}
              </span>
              <span class="perf-bar-count">{{ e.count }}</span>
            </div>
            <div class="perf-bar-track"><div class="perf-bar-fill" :style="{ width: e.pct + '%', background: e.color }"></div></div>
          </li>
        </ul>
      </div>
      <div class="perf-breakdown-card" v-if="actionBreakdown.length">
        <div class="perf-breakdown-header">
          <h3>By Action</h3>
          <span class="perf-breakdown-count">{{ actionBreakdown.reduce((s, a) => s + a.count, 0) }}</span>
        </div>
        <ul class="perf-bar-list">
          <li v-for="a in actionBreakdown" :key="a.key">
            <div class="perf-bar-row">
              <span class="perf-bar-label">
                <span class="perf-bar-dot" :style="{ background: a.color }"></span>
                {{ a.label }}
              </span>
              <span class="perf-bar-count">{{ a.count }}</span>
            </div>
            <div class="perf-bar-track"><div class="perf-bar-fill" :style="{ width: a.pct + '%', background: a.color }"></div></div>
          </li>
        </ul>
      </div>
    </div>

    <!-- Activity timeline -->
    <div class="perf-timeline-section" v-if="!loading">
      <div class="perf-timeline-header">
        <h3>Activity Timeline</h3>
        <div class="perf-timeline-filters">
          <select v-model="filters.entity" class="perf-filter-select" @change="applyFilters">
            <option value="">All areas</option>
            <option v-for="e in entityOptions" :key="e" :value="e">{{ entityLabel(e) }}</option>
          </select>
          <select v-model="filters.action" class="perf-filter-select" @change="applyFilters">
            <option value="">All actions</option>
            <option v-for="a in actionOptions" :key="a" :value="a">{{ a }}</option>
          </select>
          <input v-model="filters.q" class="perf-filter-search" placeholder="Search…" @input="applyFilters" />
        </div>
      </div>

      <div v-if="filteredEntries.length" class="perf-timeline">
        <div v-for="e in filteredEntries.slice(0, 50)" :key="e.id"
             class="perf-timeline-item perf-timeline-clickable"
             :class="`perf-act-${actionClass(e.action)}`"
             @click="openDetail(e)">
          <div class="perf-timeline-dot">
            <span v-html="actionIcon(e.action, e.entity)"></span>
          </div>
          <div class="perf-timeline-body">
            <div class="perf-timeline-top">
              <span class="perf-timeline-action">{{ e.action }}</span>
              <span class="perf-timeline-area">{{ entityLabel(e.entity) }}</span>
              <span class="perf-timeline-time">{{ formatTime(e.at) }}</span>
            </div>
            <div class="perf-timeline-summary" v-html="changeSummary(e)"></div>
            <div class="perf-timeline-id" v-if="e.entity_id">
              <span class="perf-timeline-id-chip">{{ e.entity_id }}</span>
              <span class="perf-timeline-reason" v-if="e.reason">· {{ e.reason }}</span>
            </div>
          </div>
          <div class="perf-timeline-chevron">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
        <div v-if="filteredEntries.length > 50" class="perf-timeline-more">
          Showing 50 of {{ filteredEntries.length }} matching entries
        </div>
      </div>
      <div v-else class="perf-timeline-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p>No entries match these filters</p>
      </div>
    </div>

    <!-- Activity Detail Modal -->
    <transition name="modal">
      <div v-if="selectedEntry" class="perf-detail-overlay" @click.self="selectedEntry = null">
        <div class="perf-detail-modal">
          <div class="perf-detail-header">
            <div class="perf-detail-title">
              <span class="perf-detail-action-badge" :class="`perf-act-${actionClass(selectedEntry.action)}`">{{ selectedEntry.action }}</span>
              <span class="perf-detail-area">{{ entityLabel(selectedEntry.entity) }}</span>
            </div>
            <button class="perf-detail-close" @click="selectedEntry = null">✕</button>
          </div>

          <div class="perf-detail-body">
            <!-- Meta row -->
            <div class="perf-detail-meta">
              <div class="perf-detail-meta-item">
                <span class="perf-detail-meta-label">When</span>
                <span class="perf-detail-meta-val">{{ formatFullTime(selectedEntry.at) }}</span>
              </div>
              <div class="perf-detail-meta-item" v-if="selectedEntry.entity_id">
                <span class="perf-detail-meta-label">Entity ID</span>
                <span class="perf-detail-meta-val perf-mono">{{ selectedEntry.entity_id }}</span>
              </div>
              <div class="perf-detail-meta-item" v-if="selectedEntry.actor_name">
                <span class="perf-detail-meta-label">By</span>
                <span class="perf-detail-meta-val">{{ selectedEntry.actor_name }}</span>
              </div>
              <div class="perf-detail-meta-item" v-if="selectedEntry.actor_role">
                <span class="perf-detail-meta-label">Role</span>
                <span class="perf-detail-meta-val">{{ roleLabelString(selectedEntry.actor_role) }}</span>
              </div>
            </div>

            <!-- Reason -->
            <div class="perf-detail-section" v-if="selectedEntry.reason">
              <div class="perf-detail-section-title">Reason</div>
              <div class="perf-detail-reason">{{ selectedEntry.reason }}</div>
            </div>

            <!-- Before / After diff -->
            <div class="perf-detail-section" v-if="selectedEntry.after || selectedEntry.before">
              <div class="perf-detail-section-title">Changes</div>
              <div class="perf-detail-diff">
                <div class="perf-detail-diff-before" v-if="selectedEntry.before && Object.keys(parseJson(selectedEntry.before)).length">
                  <div class="perf-detail-diff-label">Before</div>
                  <div class="perf-detail-diff-content">
                    <div v-for="(val, key) in parseJson(selectedEntry.before)" :key="key" class="perf-detail-diff-row perf-diff-old">
                      <span class="perf-detail-diff-key">{{ fieldLabel(key) }}</span>
                      <span class="perf-detail-diff-val">{{ formatVal(key, val) }}</span>
                    </div>
                  </div>
                </div>
                <div class="perf-detail-diff-after" v-if="selectedEntry.after">
                  <div class="perf-detail-diff-label">After</div>
                  <div class="perf-detail-diff-content">
                    <div v-for="(val, key) in parseJson(selectedEntry.after)" :key="key" class="perf-detail-diff-row perf-diff-new">
                      <span class="perf-detail-diff-key">{{ fieldLabel(key) }}</span>
                      <span class="perf-detail-diff-val">{{ formatVal(key, val) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- No data -->
            <div class="perf-detail-section" v-if="!selectedEntry.after && !selectedEntry.before && !selectedEntry.reason">
              <div class="perf-detail-nodata">No detailed change data recorded for this event.</div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, TODAY } from '../api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const entries = ref([])
const totalEntries = computed(() => entries.value.length)

// ─── Icons ────────────────────────────────────────────────────────────
const ICONS = {
  activity: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  dishes:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  tickets:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  inventory: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
  waste:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  recipes:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  tables:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  orders:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  tips:     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  cash:     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>',
  payments: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  delivery: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  staff:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  clock:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  expenses: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  create:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  update:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>',
  void:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  verify:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  refund:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
}

const ROLE_COLORS = {
  manager: '#0F7B78',
  'head-chef': '#DC2626',
  'assistant-chef': '#F59E0B',
  'head-waiter': '#2563EB',
  cashier: '#0EA5E9',
  'delivery-staff': '#6366F1',
  cleaner: '#10B981',
  accountant: '#9333EA',
}

const firstName = computed(() => auth.user?.firstName || 'there')
const fullName = computed(() => {
  if (!auth.user) return 'You'
  return `${auth.user.firstName} ${auth.user.lastName || ''}`.trim()
})
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
})
const roleLabel = computed(() => {
  if (!auth.roleKey) return ''
  return auth.roleKey.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
})
const roleColor = computed(() => ROLE_COLORS[auth.roleKey] || '#94a3b8')

// ─── Range filter ─────────────────────────────────────────────────────
const RANGE_OPTIONS = [
  { key: 'today', label: 'Today',     icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  { key: 'week',  label: 'This Week', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>' },
  { key: 'month', label: 'This Month',icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  { key: 'year',  label: 'This Year', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/></svg>' },
  { key: 'custom',label: 'Custom',    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
]
const range = ref('today')
const customFrom = ref(TODAY())
const customTo = ref(TODAY())
const rangeLabel = computed(() => {
  const r = range.value
  if (r === 'today') return 'Today'
  if (r === 'week') return 'This week'
  if (r === 'month') return 'This month'
  if (r === 'year') return 'This year'
  return `${customFrom.value} → ${customTo.value}`
})

function startOfWeek(d = new Date()) {
  const day = d.getDay() || 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - (day - 1))
  mon.setHours(0, 0, 0, 0)
  return mon
}
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function startOfYear(d = new Date()) { return new Date(d.getFullYear(), 0, 1) }
function iso(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function endOfDayIso(d) { return `${iso(d)}T23:59:59` }

function currentRange() {
  const now = new Date()
  if (range.value === 'today') return { from: iso(now), to: endOfDayIso(now) }
  if (range.value === 'week')  return { from: iso(startOfWeek(now)), to: endOfDayIso(now) }
  if (range.value === 'month') return { from: iso(startOfMonth(now)), to: endOfDayIso(now) }
  if (range.value === 'year')  return { from: iso(startOfYear(now)), to: endOfDayIso(now) }
  if (range.value === 'custom') {
    const from = customFrom.value || iso(now)
    const to = customTo.value || iso(now)
    return { from, to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59` : to }
  }
  return { from: iso(now), to: endOfDayIso(now) }
}

function selectRange(key) {
  range.value = key
  if (key !== 'custom') loadAll()
}
function applyCustom() { loadAll() }

// ─── Filters ──────────────────────────────────────────────────────────
const filters = ref({ entity: '', action: '', q: '' })

const ENTITY_LABELS = {
  orders: 'Orders', payments: 'Payments', inventory: 'Inventory', menu: 'Menu',
  staff: 'Staff', timeclock: 'Time Clock', shifts: 'Shifts', cashdrawer: 'Cash Drawer',
  expenses: 'Expenses', purchases: 'Purchases', recipes: 'Recipes', delivery: 'Delivery',
  tips: 'Tips', leave_requests: 'Leave', overtime: 'Overtime', staff_adjustments: 'Adjustments',
  waste: 'Waste', tables: 'Tables', reservations: 'Reservations',
}
function entityLabel(e) { return ENTITY_LABELS[e] || (e ? e[0].toUpperCase() + e.slice(1) : '—') }

const entityOptions = computed(() => {
  // Only show entity types that actually appear in this user's own audit
  // entries. Previously this unioned with a hardcoded list of ALL entity
  // types (ENTITY_LABELS), which leaked the existence of areas like "Cash
  // Drawer", "Staff", "Expenses", "Payments" to roles that should not
  // know about them — a cleaner would see "Cash Drawer" in their dropdown
  // even though they have zero entries for it.
  const seen = new Set(entries.value.map(e => e.entity).filter(Boolean))
  return Array.from(seen).sort()
})
const actionOptions = computed(() => {
  const seen = new Set(entries.value.map(e => e.action).filter(Boolean))
  return Array.from(seen).sort()
})

function actionClass(action) {
  switch (action) {
    case 'create': return 'create'
    case 'update': case 'advance': case 'batch-assign': return 'update'
    case 'void': case 'refund': case 'cancel': case 'cancelled': return 'void'
    case 'verify': return 'verify'
    case 'adjust': return 'update'
    default: return 'other'
  }
}

function actionIcon(action, entity) {
  if (action === 'create') return ICONS.create
  if (action === 'void' || action === 'refund' || action === 'cancel') return ICONS.void
  if (action === 'verify') return ICONS.verify
  if (entity === 'orders') return ICONS.orders
  if (entity === 'payments') return ICONS.payments
  if (entity === 'tips') return ICONS.tips
  if (entity === 'delivery') return ICONS.delivery
  if (entity === 'tables') return ICONS.tables
  if (entity === 'inventory') return ICONS.inventory
  if (entity === 'staff') return ICONS.staff
  if (entity === 'timeclock') return ICONS.clock
  if (entity === 'expenses') return ICONS.expenses
  if (entity === 'cashdrawer') return ICONS.cash
  return ICONS.activity
}

function escapeHtml(s) {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Human-readable labels for the audit log's snake_case field names.
 *
 * The audit `after` payload carries whatever columns the mutating handler
 * chose to record — `voided_at`, `table_id`, `auto_refunded`, etc. Showing
 * those raw names to a floor user is hostile: they read like database
 * columns, not like the things they actually mean. This map turns the
 * common ones into the words the floor already uses.
 */
const FIELD_LABELS = {
  status: 'Status',
  total: 'Total',
  tip: 'Tip',
  amount: 'Amount',
  cost: 'Cost',
  type: 'Type',
  method: 'Method',
  payment: 'Payment',
  table_id: 'Table',
  table_number: 'Table',
  tableNum: 'Table',
  customer: 'Customer',
  email: 'Email',
  role: 'Role',
  voided_at: 'Voided',
  void_category: 'Reason',
  void_reason: 'Reason',
  reason: 'Reason',
  served_at: 'Served',
  preparing_at: 'Started cooking',
  ready_at: 'Ready',
  picked_up_at: 'Picked up',
  delivered_at: 'Delivered',
  created: 'Created',
  updated_at: 'Updated',
  acknowledged_at: 'Acknowledged',
  resolved_at: 'Resolved',
  auto_refunded: 'Auto-refunded',
  payment_status: 'Payment',
  pickup_status: 'Pickup',
  source: 'Source',
  notes: 'Notes',
}

/**
 * Fields that add no information when they hold a zero/empty/null value.
 * `auto_refunded: 0` after a void means "no refund was issued", which is the
 * default and not worth a slot in the summary. `tip: ETB 0` on a takeaway
 * is the same — nobody tipped, the floor doesn't need to read that.
 *
 * The check looks at the RAW value (before formatting), so a numeric 0 or
 * empty string is caught here even though formatValue would render 'ETB 0'
 * or '0' as a non-empty string.
 */
const NOISY_WHEN_EMPTY = new Set([
  'auto_refunded', 'tip', 'cost', 'amount', 'total', 'subtotal',
  'void_category', 'void_reason', 'reason', 'notes',
  'table_id', 'table_number', 'tableNum', 'customer',
  'source', 'payment', 'method', 'pickup_status',
  'discount', 'service_charge', 'tax', 'delivery_fee',
])

/**
 * Fields to NEVER show in the summary — they're either redundant (subtotal
 * is just total minus discount), internal (rule_id, dedupe_key), or noise
 * for a floor user (payment_status when status already tells the story).
 */
const HIDDEN_FIELDS = new Set([
  'subtotal', 'rule_id', 'dedupe_key', 'severity', 'entity_type',
  'entity_id', 'actor_id', 'actor_name', 'actor_role', 'id',
])

/**
 * Fields whose value is an ISO timestamp. Rendered as "Aug 29, 7:44 PM"
 * to match the rest of the page, rather than the raw
 * "2026-08-29T19:44:54.714Z" the database stores.
 */
const TIMESTAMP_FIELDS = new Set([
  'voided_at', 'served_at', 'preparing_at', 'ready_at',
  'picked_up_at', 'delivered_at', 'created', 'updated_at',
  'acknowledged_at', 'resolved_at',
])

/**
 * Fields whose numeric value is money. Rendered as "ETB 320" rather than
 * the raw "320".
 */
const MONEY_FIELDS = new Set(['total', 'tip', 'amount', 'cost'])

/**
 * Status values that get a colored badge in the summary line.
 * Matches the colors used elsewhere in the app for the same statuses.
 */
const STATUS_COLORS = {
  new: '#2563EB', preparing: '#D97706', ready: '#10B981',
  served: '#0F7B78', fulfilled: '#0F7B78', completed: '#0F7B78',
  cancelled: '#EF4444', voided: '#EF4444',
  paid: '#10B981', unpaid: '#F59E0B', partial: '#F59E0B',
  verified: '#10B981', recorded: '#0EA5E9', refunded: '#EF4444',
  occupied: '#D97706', available: '#10B981', cleaning: '#0EA5E9',
  assigned: '#6366F1', picked_up: '#0EA5E9', out_for_delivery: '#0EA5E9',
  delivered: '#10B981',
}

function fieldLabel(key) {
  return FIELD_LABELS[key] || key.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function formatTimestamp(v) {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d)) return escapeHtml(String(v))
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return escapeHtml(`${date}, ${time}`)
}

function formatValue(key, v) {
  if (v === null || v === undefined || v === '') return ''
  if (TIMESTAMP_FIELDS.has(key)) return formatTimestamp(v)
  if (MONEY_FIELDS.has(key) && typeof v === 'number') return `ETB ${escapeHtml(v)}`
  if (typeof v === 'object') return escapeHtml(JSON.stringify(v))
  // Status values get a colored span so the summary reads visually
  if (key === 'status' || key === 'payment_status') {
    const color = STATUS_COLORS[String(v).toLowerCase()] || '#475569'
    return `<span class="perf-val-status" style="color:${color}">${escapeHtml(v)}</span>`
  }
  return escapeHtml(v)
}

function changeSummary(e) {
  const a = e.after
  const b = e.before
  if (!a && !b) return '—'
  if (!a) return '<em>deleted</em>'
  if (typeof a !== 'object') return escapeHtml(String(a).slice(0, 80))

  // Order: status first (it's the headline), then money, then timestamps,
  // then everything else.
  const priorityOrder = [
    'status', 'payment_status', 'pickup_status',
    'total', 'tip', 'amount', 'cost', 'method', 'payment',
    'table_id', 'table_number', 'tableNum', 'type', 'customer',
    'voided_at', 'served_at', 'preparing_at', 'ready_at', 'picked_up_at', 'delivered_at',
    'void_category', 'void_reason', 'reason', 'notes',
    'auto_refunded', 'source',
  ]
  const allKeys = Object.keys(a)
  const seen = new Set()
  const ordered = []
  for (const k of priorityOrder) {
    if (k in a) { ordered.push(k); seen.add(k) }
  }
  for (const k of allKeys) {
    if (!seen.has(k)) ordered.push(k)
  }

  const parts = ordered.slice(0, 6).map(k => {
    // Never show internal/redundant fields
    if (HIDDEN_FIELDS.has(k)) return null
    const av = a[k]
    const bv = b && b[k] !== undefined ? b[k] : null
    const hasBefore = bv !== null && bv !== undefined && String(bv) !== String(av)
    // Check the RAW value for noise — a numeric 0 or empty string should be
    // skipped even though formatValue would render 'ETB 0' as a non-empty
    // string. This is the fix for 'auto_refunded: 0' and 'tip: ETB 0'.
    const rawAfterIsEmpty = av === null || av === undefined || av === '' || av === 0
    if (NOISY_WHEN_EMPTY.has(k) && rawAfterIsEmpty && !hasBefore) return null
    const afterDisp = formatValue(k, av)
    const beforeDisp = hasBefore ? formatValue(k, bv) : ''
    const label = fieldLabel(k)
    if (hasBefore) {
      return `<strong>${escapeHtml(label)}</strong>: ${beforeDisp} → ${afterDisp}`
    }
    return `<strong>${escapeHtml(label)}</strong>: ${afterDisp}`
  }).filter(Boolean)

  return parts.join('  ·  ') || '—'
}

function formatTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  // Use a consistent format: "Aug 29, 3:45 PM"
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

const filteredEntries = computed(() => {
  let list = entries.value
  if (filters.value.entity) list = list.filter(e => e.entity === filters.value.entity)
  if (filters.value.action) list = list.filter(e => e.action === filters.value.action)
  if (filters.value.q) {
    const q = filters.value.q.toLowerCase()
    list = list.filter(e => {
      const hay = [e.entity, e.action, e.entity_id, e.reason, changeSummary(e)]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }
  return list
})

function applyFilters() { /* reactive; no fetch needed */ }

// ─── Activity Detail Modal ────────────────────────────────────────────
const selectedEntry = ref(null)

function openDetail(entry) { selectedEntry.value = entry }

function formatFullTime(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function parseJson(v) {
  if (!v) return {}
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return {} }
}

// fieldLabel is already defined above (in the changeSummary section)

function roleLabelString(r) {
  if (!r) return ''
  return r.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function formatVal(key, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (TIMESTAMP_FIELDS.has(key)) {
    const d = new Date(v)
    if (!isNaN(d)) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  if (MONEY_FIELDS.has(key) && typeof v === 'number') return `ETB ${v}`
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ─── Breakdowns ───────────────────────────────────────────────────────
const ENTITY_COLORS = {
  orders: '#0F7B78', payments: '#18B4B7', inventory: '#D6B36A', menu: '#E4CB99',
  staff: '#2E7D32', timeclock: '#D97706', shifts: '#9333EA', cashdrawer: '#0EA5E9',
  expenses: '#DC2626', purchases: '#F59E0B', recipes: '#10B981', delivery: '#6366F1',
  tips: '#EC4899', leave_requests: '#64748B', overtime: '#A855F7', staff_adjustments: '#EF4444',
  waste: '#991B1B', tables: '#2563EB', reservations: '#7C3AED',
}
const ACTION_COLORS = {
  create: '#10B981', update: '#0EA5E9', advance: '#0F7B78', verify: '#18B4B7',
  void: '#EF4444', refund: '#DC2626', cancel: '#991B1B', adjust: '#F59E0B',
}

const entityBreakdown = computed(() => {
  const map = {}
  for (const e of entries.value) {
    const k = e.entity || 'other'
    if (!map[k]) map[k] = { key: k, label: entityLabel(k), count: 0, color: ENTITY_COLORS[k] || '#94a3b8' }
    map[k].count++
  }
  const list = Object.values(map).sort((a, b) => b.count - a.count).slice(0, 6)
  const max = list.length ? list[0].count : 1
  list.forEach(e => { e.pct = Math.max(4, Math.round((e.count / max) * 100)) })
  return list
})

const actionBreakdown = computed(() => {
  const map = {}
  for (const e of entries.value) {
    const k = e.action || 'other'
    if (!map[k]) map[k] = { key: k, label: k, count: 0, color: ACTION_COLORS[k] || '#94a3b8' }
    map[k].count++
  }
  const list = Object.values(map).sort((a, b) => b.count - a.count).slice(0, 6)
  const max = list.length ? list[0].count : 1
  list.forEach(a => { a.pct = Math.max(4, Math.round((a.count / max) * 100)) })
  return list
})

// ─── Per-role KPIs ────────────────────────────────────────────────────
const kpis = ref([])

function countBy(predicate) { return entries.value.filter(predicate).length }

function sumBy(predicate, field) {
  // Sum a numeric field from the audit `after` payload
  let total = 0
  for (const e of entries.value) {
    if (!predicate(e)) continue
    const v = e.after && (e.after[field] || e.after.total || e.after.amount)
    if (typeof v === 'number' && Number.isFinite(v)) total += v
  }
  return total
}

function avgDuration(predicate, fromField, toField) {
  let totalMs = 0
  let count = 0
  for (const e of entries.value) {
    if (!predicate(e)) continue
    const from = e.before && (e.before[fromField] || e.before.created)
    const to = e.after && (e.after[toField] || e.after.at)
    if (from && to) {
      const ms = Date.parse(to) - Date.parse(from)
      if (Number.isFinite(ms) && ms > 0) { totalMs += ms; count++ }
    }
  }
  if (!count) return null
  return Math.round(totalMs / count / 60000) // minutes
}

function buildKpis() {
  const role = auth.roleKey
  const out = []

  if (role === 'manager') {
    out.push(
      { label: 'Orders Touched', value: countBy(e => e.entity === 'orders'), sub: 'created · updated · voided', bar: 'teal', icon: ICONS.orders },
      { label: 'Payments Verified', value: countBy(e => e.entity === 'payments'), sub: 'verify · refund · adjust', bar: 'blue', icon: ICONS.payments },
      { label: 'Expenses Booked', value: countBy(e => e.entity === 'expenses'), sub: 'created · adjusted', bar: 'red', icon: ICONS.expenses },
      { label: 'Staff Edits', value: countBy(e => e.entity === 'staff'), sub: 'creates · updates · resets', bar: 'green', icon: ICONS.staff },
      { label: 'Cash Drawer Ops', value: countBy(e => e.entity === 'cashdrawer'), sub: 'opens · paid in/out · closes', bar: 'amber', icon: ICONS.cash },
      { label: 'Deliveries Settled', value: countBy(e => e.entity === 'delivery'), sub: 'assigned · advanced · settled', bar: 'indigo', icon: ICONS.delivery },
    )
  } else if (role === 'head-chef' || role === 'assistant-chef') {
    const dishesSent = countBy(e =>
      e.entity === 'orders' && e.action === 'update' &&
      e.after && (e.after.status === 'ready' || e.after.status === 'served'))
    const ticketsStarted = countBy(e =>
      e.entity === 'orders' && e.action === 'update' &&
      e.after && e.after.status === 'preparing')
    out.push(
      { label: 'Dishes Sent', value: dishesSent, sub: 'tickets moved to ready/served', bar: 'teal', icon: ICONS.dishes },
      { label: 'Tickets Started', value: ticketsStarted, sub: 'orders moved into preparing', bar: 'amber', icon: ICONS.tickets },
      { label: 'Inventory Adjustments', value: countBy(e => e.entity === 'inventory'), sub: 'stock counts · corrections', bar: 'yellow', icon: ICONS.inventory },
      { label: 'Waste Logged', value: countBy(e => e.entity === 'waste' || (e.entity === 'inventory' && e.action === 'waste')), sub: 'spoilage recorded', bar: 'red', icon: ICONS.waste },
    )
    if (role === 'head-chef') {
      out.push(
        { label: 'Recipes Edited', value: countBy(e => e.entity === 'recipes'), sub: 'BOM changes', bar: 'green', icon: ICONS.recipes },
        { label: 'Stock Control Writes', value: countBy(e => e.entity === 'purchases' || e.action === 'adjust'), sub: 'suppliers · purchases', bar: 'blue', icon: ICONS.inventory },
      )
    } else {
      out.push(
        { label: 'Recipes Viewed', value: countBy(e => e.entity === 'recipes' && e.action === 'read'), sub: '(audited if enabled)', bar: 'green', icon: ICONS.recipes },
        { label: 'Time Clock Punches', value: countBy(e => e.entity === 'timeclock'), sub: 'clock in · out', bar: 'indigo', icon: ICONS.clock },
      )
    }
  } else if (role === 'head-waiter') {
    // Sum tips for money KPI
    const tipsTotal = sumBy(e => e.entity === 'tips', 'amount')
    out.push(
      { label: 'Tables Seated', value: countBy(e => e.entity === 'tables' && e.action === 'update' && e.after && e.after.status === 'occupied'), sub: 'guests seated', bar: 'teal', icon: ICONS.tables },
      { label: 'Tables Released', value: countBy(e => e.entity === 'tables' && e.action === 'update' && e.after && e.after.status === 'available'), sub: 'cleared after service', bar: 'green', icon: ICONS.tables },
      { label: 'Orders Taken', value: countBy(e => e.entity === 'orders' && e.action === 'create'), sub: 'new checks opened', bar: 'amber', icon: ICONS.orders },
      { label: 'Tips Recorded', value: tipsTotal > 0 ? `ETB ${tipsTotal.toFixed(0)}` : countBy(e => e.entity === 'tips'), sub: tipsTotal > 0 ? `${countBy(e => e.entity === 'tips')} tabs tipped` : 'cash · card', bar: 'pink', icon: ICONS.tips },
      { label: 'Reservations', value: countBy(e => e.entity === 'reservations' || (e.action === 'create' && e.entity === 'reservations')), sub: 'booked · updated', bar: 'indigo', icon: ICONS.tables },
    )
  } else if (role === 'cashier') {
    const tipsTotal = sumBy(e => e.entity === 'tips', 'amount')
    out.push(
      { label: 'Payments Verified', value: countBy(e => e.entity === 'payments' && (e.action === 'verify' || e.action === 'create')), sub: 'telebirr · cbe · cash', bar: 'teal', icon: ICONS.payments },
      { label: 'Cash Drawer Ops', value: countBy(e => e.entity === 'cashdrawer'), sub: 'opens · paid in/out · closes', bar: 'amber', icon: ICONS.cash },
      { label: 'Refunds Issued', value: countBy(e => e.entity === 'payments' && e.action === 'refund'), sub: 'voided · refunded', bar: 'red', icon: ICONS.refund },
      { label: 'Tips Recorded', value: tipsTotal > 0 ? `ETB ${tipsTotal.toFixed(0)}` : countBy(e => e.entity === 'tips'), sub: tipsTotal > 0 ? `${countBy(e => e.entity === 'tips')} tips taken` : 'tips taken', bar: 'pink', icon: ICONS.tips },
      { label: 'Orders Settled', value: countBy(e => e.entity === 'orders' && e.action === 'update' && e.after && /paid|settled|completed/.test(e.after.status || '')), sub: 'checks closed', bar: 'green', icon: ICONS.orders },
    )
  } else if (role === 'delivery-staff') {
    const tipsTotal = sumBy(e => e.entity === 'tips', 'amount')
    const taken     = countBy(e => e.entity === 'delivery' && e.action === 'update' && e.after && e.after.status === 'assigned')
    const picked    = countBy(e => e.entity === 'delivery' && e.action === 'update' && e.after && e.after.status === 'picked_up')
    const delivered = countBy(e => e.entity === 'delivery' && e.action === 'update' && e.after && e.after.status === 'delivered')
    out.push(
      { label: 'Jobs Taken', value: taken, sub: 'assigned to me', bar: 'amber', icon: ICONS.delivery },
      { label: 'Picked Up', value: picked, sub: 'left the store', bar: 'blue', icon: ICONS.delivery },
      { label: 'Delivered', value: delivered, sub: 'completed deliveries', bar: 'green', icon: ICONS.delivery },
      { label: 'Payments Recorded', value: countBy(e => e.entity === 'payments' && e.action === 'create'), sub: 'cash · transfer on doorstep', bar: 'teal', icon: ICONS.payments },
      { label: 'Tips Recorded', value: tipsTotal > 0 ? `ETB ${tipsTotal.toFixed(0)}` : countBy(e => e.entity === 'tips'), sub: tipsTotal > 0 ? `${countBy(e => e.entity === 'tips')} tips left` : 'tips left by guests', bar: 'pink', icon: ICONS.tips },
    )
  } else if (role === 'cleaner') {
    const wasteCost = sumBy(e => e.entity === 'waste' || (e.entity === 'inventory' && e.action === 'waste'), 'cost')
    out.push(
      { label: 'Waste Logged', value: countBy(e => e.entity === 'waste' || (e.entity === 'inventory' && e.action === 'waste')), sub: wasteCost > 0 ? `ETB ${wasteCost.toFixed(0)} recorded` : 'spoilage · breakage', bar: 'red', icon: ICONS.waste },
      { label: 'Tables Cleared', value: countBy(e => e.entity === 'tables' && e.action === 'update' && e.after && e.after.status === 'available'), sub: 'reset after service', bar: 'green', icon: ICONS.tables },
      { label: 'Time Clock Punches', value: countBy(e => e.entity === 'timeclock'), sub: 'clock in · out', bar: 'indigo', icon: ICONS.clock },
    )
  } else if (role === 'accountant') {
    out.push(
      { label: 'Expenses Booked', value: countBy(e => e.entity === 'expenses' && e.action === 'create'), sub: 'bills · supplier invoices', bar: 'red', icon: ICONS.expenses },
      { label: 'Expenses Adjusted', value: countBy(e => e.entity === 'expenses' && e.action === 'update'), sub: 'corrections · reclasses', bar: 'amber', icon: ICONS.expenses },
      { label: 'Reports Viewed', value: countBy(e => e.entity === 'reports' || e.action === 'read'), sub: '(audited if enabled)', bar: 'blue', icon: ICONS.activity },
      { label: 'Time Clock Punches', value: countBy(e => e.entity === 'timeclock'), sub: 'clock in · out', bar: 'indigo', icon: ICONS.clock },
    )
  }

  kpis.value = out
}

// ─── Load ─────────────────────────────────────────────────────────────
async function loadAll() {
  loading.value = true
  try {
    const { from, to } = currentRange()
    const me = auth.user?.id || ''
    if (!me) {
      entries.value = []
    } else {
      const params = new URLSearchParams()
      params.set('actor_id', me)
      params.set('from', from)
      params.set('to', to)
      params.set('limit', '500')
      const res = await apiGet(`audit?${params.toString()}`)
      entries.value = (res && res.entries) || []
    }
    buildKpis()
  } catch (e) {
    console.error('Performance audit load failed', e)
    entries.value = []
    kpis.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped>
/* ─── Hero header ───────────────────────────────────────────────────── */
.perf { padding: 0; }
.perf-hero {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; margin-bottom: 20px; flex-wrap: wrap;
  padding: 20px 24px; border-radius: 14px;
  background: linear-gradient(135deg, var(--teal-700, #0F7B78) 0%, var(--teal-800, #0B5A57) 100%);
  color: #fff; box-shadow: 0 8px 24px rgba(15, 123, 120, 0.18);
}
.perf-hero-left { flex: 1; min-width: 240px; }
.perf-hero-greeting { font-size: .82rem; opacity: .82; font-weight: 500; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .06em; }
.perf-hero-title { font-size: 1.75rem; font-weight: 700; margin: 0 0 10px; line-height: 1.1; }
.perf-hero-meta { display: flex; gap: 8px; flex-wrap: wrap; }
.perf-hero-pill {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(255, 255, 255, 0.15); padding: 4px 10px;
  border-radius: 99px; font-size: .76rem; font-weight: 500;
}
.perf-hero-pill-dot { width: 7px; height: 7px; border-radius: 50%; }
.perf-refresh-btn {
  background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff; width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s;
}
.perf-refresh-btn:hover { background: rgba(255, 255, 255, 0.25); }
.perf-refresh-btn:disabled { opacity: .6; cursor: not-allowed; }

/* ─── Range tabs ────────────────────────────────────────────────────── */
.perf-range {
  display: flex; gap: 6px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 4px; width: fit-content; flex-wrap: wrap; margin-bottom: 16px;
}
.perf-range-tab {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: none; padding: 7px 14px;
  font-size: .82rem; font-weight: 500; color: var(--text-muted);
  cursor: pointer; border-radius: 8px; transition: all .15s; min-height: 34px;
}
.perf-range-tab:hover { color: var(--text-heading); background: var(--bg); }
.perf-range-tab.active { background: var(--primary); color: #fff; box-shadow: 0 2px 6px rgba(15, 123, 120, 0.3); }
.perf-range-tab-icon { display: inline-flex; align-items: center; }
.perf-range-custom { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 4px; }
.perf-range-custom label { display: flex; flex-direction: column; gap: 3px; font-size: .72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }

/* ─── KPI grid ───────────────────────────────────────────────────────── */
.perf-kpi-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px; margin-bottom: 20px;
}
.perf-kpi-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  padding: 16px 18px; position: relative; overflow: hidden;
  transition: transform .15s, box-shadow .15s;
  animation: perf-card-in .35s var(--ease, ease) both;
}
.perf-kpi-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08); }
.perf-kpi-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--kpi-color, var(--primary));
}
.perf-kpi-teal    { --kpi-color: #0F7B78; }
.perf-kpi-blue    { --kpi-color: #2563EB; }
.perf-kpi-amber   { --kpi-color: #D97706; }
.perf-kpi-yellow  { --kpi-color: #F59E0B; }
.perf-kpi-red     { --kpi-color: #DC2626; }
.perf-kpi-green   { --kpi-color: #10B981; }
.perf-kpi-indigo  { --kpi-color: #6366F1; }
.perf-kpi-pink    { --kpi-color: #EC4899; }

.perf-kpi-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.perf-kpi-icon {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--kpi-color) 12%, transparent);
  color: var(--kpi-color);
}
.perf-kpi-trend {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: .72rem; font-weight: 600; padding: 2px 6px; border-radius: 6px;
}
.perf-kpi-trend.up { color: #10B981; background: rgba(16, 185, 129, 0.1); }
.perf-kpi-trend.down { color: #DC2626; background: rgba(220, 38, 38, 0.1); }
.perf-kpi-label { font-size: .76rem; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
.perf-kpi-value { font-size: 1.65rem; font-weight: 700; color: var(--text-heading); line-height: 1.1; font-variant-numeric: tabular-nums; }
.perf-kpi-sub { font-size: .76rem; color: var(--text-muted); margin-top: 4px; }

@keyframes perf-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ─── Empty state ────────────────────────────────────────────────────── */
.perf-empty {
  text-align: center; padding: 60px 20px; color: var(--text-muted);
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  margin-bottom: 20px;
}
.perf-empty-icon { color: var(--text-muted); margin-bottom: 14px; }
.perf-empty h3 { font-size: 1rem; color: var(--text-heading); margin: 0 0 6px; }
.perf-empty p { font-size: .85rem; max-width: 380px; margin: 0 auto; line-height: 1.5; }

/* ─── Breakdown ──────────────────────────────────────────────────────── */
.perf-breakdown {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px;
}
.perf-breakdown-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px;
}
.perf-breakdown-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.perf-breakdown-header h3 { font-size: .95rem; font-weight: 600; color: var(--text-heading); margin: 0; }
.perf-breakdown-count { font-size: .72rem; color: var(--text-muted); background: var(--bg); padding: 2px 8px; border-radius: 99px; font-variant-numeric: tabular-nums; }

.perf-bar-list { list-style: none; padding: 0; margin: 0; }
.perf-bar-list li { margin-bottom: 12px; }
.perf-bar-row { display: flex; justify-content: space-between; align-items: baseline; font-size: .8rem; margin-bottom: 5px; }
.perf-bar-label { color: var(--text-heading); font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }
.perf-bar-dot { width: 8px; height: 8px; border-radius: 50%; }
.perf-bar-count { color: var(--text-muted); font-variant-numeric: tabular-nums; font-weight: 600; }
.perf-bar-track { height: 6px; background: var(--bg, #f1f5f9); border-radius: 3px; overflow: hidden; }
.perf-bar-fill { height: 100%; border-radius: 3px; transition: width .4s var(--ease, ease); }

/* ─── Timeline ───────────────────────────────────────────────────────── */
.perf-timeline-section {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px;
}
.perf-timeline-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.perf-timeline-header h3 { font-size: .95rem; font-weight: 600; color: var(--text-heading); margin: 0; }
.perf-timeline-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.perf-filter-select, .perf-filter-search {
  font-size: .78rem; padding: 5px 10px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--bg); color: var(--text-heading); min-height: 32px;
}
.perf-filter-search { min-width: 140px; }

.perf-timeline { position: relative; padding-left: 8px; }
.perf-timeline-item {
  display: flex; gap: 12px; padding: 10px 0;
  border-left: 2px solid var(--border); padding-left: 16px; margin-left: 12px;
  position: relative;
  animation: perf-item-in .25s var(--ease, ease) both;
}
.perf-timeline-item::before {
  content: ''; position: absolute; left: -7px; top: 14px; width: 12px; height: 12px;
  border-radius: 50%; background: var(--surface); border: 2px solid var(--timeline-color, var(--text-muted));
}
.perf-act-create    { --timeline-color: #10B981; }
.perf-act-update    { --timeline-color: #0EA5E9; }
.perf-act-void      { --timeline-color: #EF4444; }
.perf-act-verify    { --timeline-color: #18B4B7; }
.perf-act-other     { --timeline-color: #94a3b8; }

.perf-timeline-dot {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--timeline-color) 12%, transparent);
  color: var(--timeline-color);
  margin-top: 2px;
}
.perf-timeline-body { flex: 1; min-width: 0; }
.perf-timeline-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.perf-timeline-action {
  font-size: .76rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
  color: var(--timeline-color);
}
.perf-timeline-area { font-size: .72rem; color: var(--text-muted); background: var(--bg); padding: 1px 7px; border-radius: 99px; }
.perf-timeline-time { font-size: .72rem; color: var(--text-muted); margin-left: auto; font-variant-numeric: tabular-nums; }
.perf-timeline-summary { font-size: .82rem; color: var(--text-heading); line-height: 1.5; word-break: break-word; }
.perf-timeline-summary :deep(strong) { font-weight: 600; color: var(--text-muted); font-size: .76rem; text-transform: uppercase; letter-spacing: .03em; margin-right: 2px; }
.perf-timeline-summary :deep(.perf-val-status) { font-weight: 600; }
.perf-timeline-summary :deep(em) { color: var(--text-muted); font-style: italic; }
.perf-timeline-id { font-size: .72rem; margin-top: 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.perf-timeline-id-chip { font-family: var(--font-mono, monospace); background: var(--bg); padding: 1px 6px; border-radius: 4px; color: var(--text-muted); }
.perf-timeline-reason { color: var(--text-muted); }
.perf-timeline-more { padding: 12px 16px; font-size: .8rem; color: var(--text-muted); text-align: center; }

/* Clickable timeline items */
.perf-timeline-clickable { cursor: pointer; transition: background .15s, border-color .15s; border-radius: 8px; margin-left: 10px; padding: 10px 12px 10px 16px; border: 1px solid transparent; }
.perf-timeline-clickable:hover { background: var(--bg); border-color: var(--border); }
.perf-timeline-chevron { color: var(--text-muted); flex-shrink: 0; opacity: .5; transition: opacity .15s; }
.perf-timeline-clickable:hover .perf-timeline-chevron { opacity: 1; }

/* Activity Detail Modal */
.perf-detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
.perf-detail-modal { background: var(--surface); border-radius: 14px; max-width: 600px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
.perf-detail-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.perf-detail-title { display: flex; align-items: center; gap: 8px; }
.perf-detail-action-badge { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 3px 8px; border-radius: 6px; color: var(--tl-color, var(--text-muted)); background: color-mix(in srgb, var(--tl-color, #94a3b8) 12%, transparent); }
.perf-detail-area { font-size: .85rem; color: var(--text-muted); }
.perf-detail-close { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted); padding: 4px 8px; border-radius: 6px; }
.perf-detail-close:hover { background: var(--bg); }
.perf-detail-body { padding: 20px; }

.perf-detail-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.perf-detail-meta-item { display: flex; flex-direction: column; gap: 2px; }
.perf-detail-meta-label { font-size: .68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
.perf-detail-meta-val { font-size: .85rem; color: var(--text-heading); font-weight: 500; }
.perf-mono { font-family: var(--font-mono, monospace); font-size: .78rem; }

.perf-detail-section { margin-bottom: 20px; }
.perf-detail-section-title { font-size: .76rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
.perf-detail-reason { font-size: .88rem; color: var(--text-heading); padding: 10px 14px; background: var(--bg); border-radius: 8px; border-left: 3px solid var(--warning, #F59E0B); }

.perf-detail-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.perf-detail-diff-label { font-size: .72rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .04em; }
.perf-detail-diff-content { display: flex; flex-direction: column; gap: 4px; }
.perf-detail-diff-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 6px 10px; border-radius: 6px; font-size: .78rem; }
.perf-diff-old { background: rgba(239, 68, 68, .06); border-left: 2px solid #EF4444; }
.perf-diff-new { background: rgba(16, 185, 129, .06); border-left: 2px solid #10B981; }
.perf-detail-diff-key { font-weight: 600; color: var(--text-muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .03em; }
.perf-detail-diff-val { color: var(--text-heading); word-break: break-word; }
.perf-detail-nodata { font-size: .85rem; color: var(--text-muted); padding: 20px; text-align: center; }

@media (max-width: 600px) {
  .perf-detail-meta { grid-template-columns: 1fr; }
  .perf-detail-diff { grid-template-columns: 1fr; }
}

.modal-enter-active, .modal-leave-active { transition: opacity .2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.perf-timeline-empty { text-align: center; padding: 40px 20px; color: var(--text-muted); }
.perf-timeline-empty svg { color: var(--text-muted); margin-bottom: 8px; }
.perf-timeline-empty p { font-size: .85rem; margin: 0; }

@keyframes perf-item-in { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: translateX(0); } }

/* ─── Skeleton loading ────────────────────────────────────────────────── */
.perf-skel { pointer-events: none; }
.perf-skel-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--bg); margin-bottom: 10px; }
.perf-skel-line { background: var(--bg); border-radius: 4px; margin-bottom: 6px; }
.perf-skel-label { width: 60%; height: 10px; }
.perf-skel-value { width: 80%; height: 22px; }
.perf-skel-sub { width: 50%; height: 10px; }
.perf-skel .perf-skel-line { animation: perf-skel-pulse 1.5s ease-in-out infinite; }
@keyframes perf-skel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

/* ─── Animations ─────────────────────────────────────────────────────── */
.perf-spin { animation: perf-spin 1s linear infinite; }
@keyframes perf-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

/* ─── Responsive ────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .perf-hero { padding: 16px 18px; }
  .perf-hero-title { font-size: 1.4rem; }
  .perf-range { width: 100%; }
  .perf-range-tab { flex: 1 1 auto; padding: 6px 8px; font-size: .76rem; }
  .perf-kpi-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .perf-kpi-card { padding: 12px 14px; }
  .perf-kpi-value { font-size: 1.35rem; }
  .perf-breakdown { grid-template-columns: 1fr; }
  .perf-timeline-header { flex-direction: column; align-items: stretch; }
  .perf-timeline-filters { flex-direction: column; }
  .perf-filter-search { min-width: 0; }
  .perf-timeline-time { margin-left: 0; }
}
@media (max-width: 480px) {
  .perf-kpi-grid { grid-template-columns: 1fr; }
}
</style>
