<template>
  <div class="lf">
    <div class="lf-hero">
      <div class="lf-hero-left">
        <div class="lf-hero-greeting">Live Activity</div>
        <h2 class="lf-hero-title">Real-time feed</h2>
        <div class="lf-hero-meta">
          <span class="lf-hero-pill" :class="{ 'lf-live': sseConnected }">
            <span class="lf-hero-dot"></span>
            {{ sseConnected ? 'Live' : 'Connecting…' }}
          </span>
          <span class="lf-hero-pill">{{ entries.length }} recent</span>
        </div>
      </div>
      <div class="lf-filters">
        <select v-model="filterRole" class="lf-filter-select">
          <option value="">All roles</option>
          <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
        </select>
        <select v-model="filterEntity" class="lf-filter-select">
          <option value="">All areas</option>
          <option v-for="e in entities" :key="e" :value="e">{{ e }}</option>
        </select>
      </div>
    </div>

    <div class="lf-feed" v-if="filtered.length">
      <div v-for="(e, i) in filtered.slice(0, 50)" :key="e.id || i" class="lf-item" :class="`lf-act-${actionClass(e.action)}`">
        <div class="lf-item-dot">
          <span v-html="actionIcon(e.action, e.entity)"></span>
        </div>
        <div class="lf-item-body">
          <div class="lf-item-top">
            <span class="lf-item-action">{{ e.action }}</span>
            <span class="lf-item-entity">{{ e.entity }}</span>
            <span v-if="e.actor_name" class="lf-item-actor">{{ e.actor_name }}</span>
            <span class="lf-item-time">{{ formatTime(e.at) }}</span>
          </div>
          <div class="lf-item-id" v-if="e.entity_id">{{ e.entity_id }}</div>
        </div>
      </div>
    </div>
    <div v-else class="lf-empty">
      <p>No activity yet. Actions will appear here in real-time as they happen.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiGet } from '../api'
import { useSSE } from '../composables/useSSE'

const sse = useSSE()
const sseConnected = ref(false)
const entries = ref([])
const filterRole = ref('')
const filterEntity = ref('')

const roles = ['manager', 'head-chef', 'assistant-chef', 'head-waiter', 'cashier', 'delivery-staff', 'cleaner']
const entities = ['orders', 'payments', 'tables', 'inventory', 'staff', 'timeclock', 'cashdrawer', 'expenses', 'delivery', 'tips', 'waste', 'reservations']

const filtered = computed(() => {
  let list = entries.value
  if (filterRole.value) list = list.filter(e => String(e.actor_role || '').toLowerCase() === filterRole.value)
  if (filterEntity.value) list = list.filter(e => e.entity === filterEntity.value)
  return list
})

function actionClass(action) {
  if (action === 'create') return 'create'
  if (action === 'void' || action === 'refund' || action === 'delete') return 'void'
  if (action === 'verify') return 'verify'
  return 'update'
}

const ICONS = {
  create: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  void: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  verify: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  update: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 11 12 6 7 11"/></svg>',
}
function actionIcon(action) {
  if (action === 'create') return ICONS.create
  if (action === 'void' || action === 'refund' || action === 'delete') return ICONS.void
  if (action === 'verify') return ICONS.verify
  return ICONS.update
}

function formatTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

async function loadInitial() {
  try {
    // Fetch recent audit entries as initial seed
    const today = new Date().toISOString().slice(0, 10)
    const res = await apiGet(`audit?from=${today}&to=${today}T23:59:59&limit=50`)
    if (res && res.entries) {
      entries.value = res.entries
    }
  } catch { /* ignore */ }
}

onMounted(() => {
  loadInitial()
  sse.connect('activity')
  sse.on('activity_update', (data) => {
    if (data && Array.isArray(data.entries)) {
      entries.value = data.entries
    }
  })
  // Poll connected state
  const timer = setInterval(() => {
    sseConnected.value = sse.connected.value
  }, 1000)
  onUnmounted(() => { clearInterval(timer); sse.disconnect() })
})
</script>

<style scoped>
.lf-hero { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:20px; padding:20px 24px; border-radius:14px; background:var(--surface); border:1px solid var(--border); flex-wrap:wrap; }
.lf-hero-left { flex:1; }
.lf-hero-greeting { font-size:.82rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; margin-bottom:2px; }
.lf-hero-title { font-size:1.5rem; font-weight:700; margin:0 0 8px; }
.lf-hero-meta { display:flex; gap:8px; flex-wrap:wrap; }
.lf-hero-pill { background:var(--bg); padding:4px 10px; border-radius:99px; font-size:.76rem; display:inline-flex; align-items:center; gap:5px; }
.lf-hero-dot { width:7px; height:7px; border-radius:50%; background:#94a3b8; }
.lf-live .lf-hero-dot { background:#10B981; animation:lf-pulse 1.5s ease-in-out infinite; }
@keyframes lf-pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
.lf-filters { display:flex; gap:8px; }
.lf-filter-select { font-size:.78rem; padding:5px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg); }

.lf-feed { display:flex; flex-direction:column; gap:2px; }
.lf-item { display:flex; gap:10px; padding:8px 12px; border-radius:8px; transition:background .15s; }
.lf-item:hover { background:var(--bg); }
.lf-item-dot { width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px; }
.lf-act-create .lf-item-dot { background:rgba(16,185,129,.12); color:#10B981; }
.lf-act-void .lf-item-dot { background:rgba(239,68,68,.12); color:#EF4444; }
.lf-act-verify .lf-item-dot { background:rgba(24,180,183,.12); color:#18B4B7; }
.lf-act-update .lf-item-dot { background:rgba(14,165,233,.12); color:#0EA5E9; }
.lf-item-body { flex:1; min-width:0; }
.lf-item-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.lf-item-action { font-size:.76rem; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.lf-act-create .lf-item-action { color:#10B981; }
.lf-act-void .lf-item-action { color:#EF4444; }
.lf-act-verify .lf-item-action { color:#18B4B7; }
.lf-act-update .lf-item-action { color:#0EA5E9; }
.lf-item-entity { font-size:.72rem; color:var(--text-muted); background:var(--bg); padding:1px 7px; border-radius:99px; }
.lf-item-actor { font-size:.72rem; color:var(--text-heading); font-weight:500; }
.lf-item-time { font-size:.72rem; color:var(--text-muted); margin-left:auto; font-variant-numeric:tabular-nums; }
.lf-item-id { font-size:.72rem; font-family:var(--font-mono,monospace); color:var(--text-muted); }
.lf-empty { text-align:center; padding:40px; color:var(--text-muted); }

@media (max-width:768px) {
  .lf-hero { flex-direction:column; }
  .lf-filters { width:100%; }
  .lf-item-time { margin-left:0; }
}
</style>
