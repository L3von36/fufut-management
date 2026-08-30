<template>
  <div class="tasks">
    <div class="tasks-hero">
      <div class="tasks-hero-left">
        <div class="tasks-hero-greeting">Tasks</div>
        <h2 class="tasks-hero-title">{{ isManager ? 'All Tasks' : 'My Tasks' }}</h2>
        <div class="tasks-hero-meta">
          <span class="tasks-hero-pill">{{ pendingCount }} pending</span>
          <span class="tasks-hero-pill" v-if="inProgressCount">{{ inProgressCount }} in progress</span>
          <span class="tasks-hero-pill tasks-hero-pill-green">{{ completedCount }} completed</span>
        </div>
      </div>
      <button v-if="isManager" class="tasks-refresh-btn" @click="showCreate = !showCreate">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Task
      </button>
    </div>

    <!-- Create form -->
    <div v-if="showCreate && isManager" class="tasks-create card">
      <h3>Create Task</h3>
      <div class="tasks-create-grid">
        <label class="tasks-field">
          <span>Employee</span>
          <select v-model="newTask.staffId" class="input input-sm">
            <option value="">Select…</option>
            <option v-for="s in staffList" :key="s.id" :value="s.id">{{ s.firstName }} {{ s.lastName }} ({{ roleLabel(s.role) }})</option>
          </select>
        </label>
        <label class="tasks-field">
          <span>Title</span>
          <input v-model="newTask.title" class="input input-sm" placeholder="Clean dining area" />
        </label>
        <label class="tasks-field">
          <span>Priority</span>
          <select v-model="newTask.priority" class="input input-sm">
            <option value="normal">Normal</option>
            <option value="low">Low</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label class="tasks-field">
          <span>Area</span>
          <input v-model="newTask.area" class="input input-sm" placeholder="Dining / Restroom / Kitchen" />
        </label>
        <label class="tasks-field tasks-field-wide">
          <span>Description</span>
          <input v-model="newTask.description" class="input input-sm" placeholder="Optional details" />
        </label>
      </div>
      <div class="tasks-create-actions">
        <button class="btn btn-primary btn-sm" @click="createTask" :disabled="!newTask.staffId || !newTask.title">Create</button>
        <button class="btn btn-secondary btn-sm" @click="showCreate = false">Cancel</button>
      </div>
    </div>

    <!-- Task list -->
    <div v-if="tasks.length" class="tasks-list">
      <div v-for="t in tasks" :key="t.id" class="task-card" :class="`task-${t.priority}`">
        <div class="task-card-top">
          <span class="task-status-badge" :class="`task-sts-${t.status}`">{{ t.status.replace('_', ' ') }}</span>
          <span class="task-priority" :class="`task-pri-${t.priority}`">{{ t.priority }}</span>
          <span class="task-area" v-if="t.area">{{ t.area }}</span>
          <span class="task-time">{{ shortTime(t.created) }}</span>
        </div>
        <div class="task-title">{{ t.title }}</div>
        <div class="task-desc" v-if="t.description">{{ t.description }}</div>
        <div class="task-assignee">
          <span class="task-avatar" :style="{ background: roleColor(t.role || '') }">{{ initials(t.staffName) }}</span>
          <span>{{ t.staffName }}</span>
        </div>
        <div class="task-actions" v-if="t.status !== 'completed' && t.status !== 'cancelled'">
          <button v-if="t.status === 'pending'" class="btn btn-sm btn-outline" @click="updateStatus(t.id, 'in_progress')">Start</button>
          <button class="btn btn-sm btn-success" @click="markComplete(t.id)">Complete</button>
        </div>
        <div class="task-completed" v-if="t.status === 'completed' && t.completed_at">
          Completed {{ shortTime(t.completed_at) }}
          <span v-if="t.note" class="task-note">· {{ t.note }}</span>
        </div>
      </div>
    </div>
    <div v-else-if="!loading" class="tasks-empty">
      <div class="tasks-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
      <h3>No tasks</h3>
      <p v-if="isManager">Create a task to assign work to your team.</p>
      <p v-else>You have no assigned tasks.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPost, apiPut } from '../api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const tasks = ref([])
const showCreate = ref(false)
const staffList = ref([])
const newTask = ref({ staffId: '', title: '', description: '', priority: 'normal', area: '' })

const isManager = computed(() => auth.roleKey === 'manager')
const pendingCount = computed(() => tasks.value.filter(t => t.status === 'pending').length)
const inProgressCount = computed(() => tasks.value.filter(t => t.status === 'in_progress').length)
const completedCount = computed(() => tasks.value.filter(t => t.status === 'completed').length)

const ROLE_COLORS = { manager: '#0F7B78', 'head-chef': '#DC2626', 'assistant-chef': '#F59E0B', 'head-waiter': '#2563EB', cashier: '#0EA5E9', 'delivery-staff': '#6366F1', cleaner: '#10B981', accountant: '#9333EA' }
function roleColor(r) { return ROLE_COLORS[r] || '#64748B' }
function roleLabel(r) { return r ? r.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : '' }
function initials(name) { if (!name) return '?'; const p = name.trim().split(/\s+/); return p.length < 2 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length-1][0]).toUpperCase() }
function shortTime(isoStr) { if (!isoStr) return '—'; const d = new Date(isoStr); if (isNaN(d)) return isoStr; return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }

async function load() {
  loading.value = true
  try {
    tasks.value = await apiGet('tasks') || []
    if (isManager.value) {
      staffList.value = await apiGet('staff') || []
    }
  } catch (e) { console.error('Tasks load failed', e); tasks.value = [] }
  finally { loading.value = false }
}

async function createTask() {
  try {
    await apiPost('tasks', newTask.value)
    showCreate.value = false
    newTask.value = { staffId: '', title: '', description: '', priority: 'normal', area: '' }
    await load()
  } catch (e) { console.error('Create task failed', e) }
}

async function updateStatus(id, status) {
  try { await apiPut(`tasks/${id}`, { status }); await load() }
  catch (e) { console.error('Update task failed', e) }
}

async function markComplete(id) {
  const note = prompt('Add a completion note (optional):') || ''
  try {
    await apiPost(`tasks/${id}/complete`, { note })
    await load()
  } catch (e) { console.error('Complete task failed', e) }
}

onMounted(load)
</script>

<style scoped>
.tasks-hero { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:20px; padding:20px 24px; border-radius:14px; background:linear-gradient(135deg,var(--teal-700,#0F7B78),var(--teal-800,#0B5A57)); color:#fff; flex-wrap:wrap; }
.tasks-hero-left { flex:1; min-width:240px; }
.tasks-hero-greeting { font-size:.82rem; opacity:.82; font-weight:500; text-transform:uppercase; letter-spacing:.06em; margin-bottom:2px; }
.tasks-hero-title { font-size:1.75rem; font-weight:700; margin:0 0 10px; }
.tasks-hero-meta { display:flex; gap:8px; flex-wrap:wrap; }
.tasks-hero-pill { background:rgba(255,255,255,.15); padding:4px 10px; border-radius:99px; font-size:.76rem; }
.tasks-hero-pill-green { background:rgba(16,185,129,.25); }
.tasks-refresh-btn { background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.25); color:#fff; padding:8px 16px; border-radius:10px; cursor:pointer; font-size:.85rem; font-weight:600; display:inline-flex; align-items:center; gap:6px; }

.tasks-create { padding:16px 18px; margin-bottom:16px; }
.tasks-create h3 { font-size:.95rem; margin:0 0 12px; }
.tasks-create-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }
.tasks-field { display:flex; flex-direction:column; gap:3px; font-size:.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em; }
.tasks-field-wide { grid-column:1/-1; }
.tasks-create-actions { display:flex; gap:8px; margin-top:12px; }

.tasks-list { display:flex; flex-direction:column; gap:10px; }
.task-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; border-left:3px solid var(--pri-color,#94a3b8); }
.task-urgent { --pri-color:#DC2626; } .task-high { --pri-color:#F59E0B; } .task-normal { --pri-color:#0EA5E9; } .task-low { --pri-color:#94a3b8; }
.task-card-top { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
.task-status-badge { font-size:.7rem; font-weight:600; text-transform:uppercase; letter-spacing:.04em; padding:2px 8px; border-radius:99px; }
.task-sts-pending { color:#F59E0B; background:rgba(245,158,11,.1); } .task-sts-in_progress { color:#0EA5E9; background:rgba(14,165,233,.1); }
.task-sts-completed { color:#10B981; background:rgba(16,185,129,.1); } .task-sts-failed { color:#EF4444; background:rgba(239,68,68,.1); } .task-sts-cancelled { color:#94a3b8; background:var(--bg); }
.task-priority { font-size:.68rem; font-weight:600; text-transform:uppercase; color:var(--pri-color); }
.task-area { font-size:.72rem; color:var(--text-muted); background:var(--bg); padding:1px 7px; border-radius:99px; }
.task-time { font-size:.72rem; color:var(--text-muted); margin-left:auto; }
.task-title { font-size:.95rem; font-weight:600; color:var(--text-heading); margin-bottom:4px; }
.task-desc { font-size:.8rem; color:var(--text-muted); margin-bottom:8px; }
.task-assignee { display:flex; align-items:center; gap:6px; font-size:.78rem; color:var(--text-muted); }
.task-avatar { width:22px; height:22px; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:.65rem; font-weight:700; }
.task-actions { display:flex; gap:6px; margin-top:10px; }
.task-completed { font-size:.76rem; color:#10B981; margin-top:8px; }
.task-note { color:var(--text-muted); }

.tasks-empty { text-align:center; padding:60px 20px; color:var(--text-muted); }
.tasks-empty-icon { margin-bottom:14px; }
.tasks-empty h3 { font-size:1rem; color:var(--text-heading); margin:0 0 6px; }
.tasks-empty p { font-size:.85rem; }
</style>
