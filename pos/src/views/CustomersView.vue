<template>
  <div>
    <div class="table-toolbar">
      <h3>Customer Profiles & Loyalty</h3>
      <div style="display:flex;gap:10px">
        <input v-model="searchQuery" placeholder="Search by name, phone, email..." class="input" style="width:260px" @keyup.enter="searchCustomers" />
        <button class="btn btn-primary btn-sm" @click="openAddModal">Add Customer</button>
      </div>
    </div>

    <div v-if="loading" class="empty-state" style="padding:40px"><div>Loading customers…</div></div>

    <div v-else-if="!customers.length" class="empty-state" style="padding:40px">
      <div>No customer profiles found.</div>
      <button class="btn btn-sm btn-outline" style="margin-top:10px" @click="openAddModal">Create First Profile</button>
    </div>

    <div v-else class="cust-grid">
      <div v-for="c in customers" :key="c.id" class="card cust-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <strong style="font-size:1.05rem">{{ c.name }}</strong>
            <div style="font-size:.78rem;color:var(--text-muted)">{{ c.phone || 'No phone' }} · {{ c.email || 'No email' }}</div>
          </div>
          <span class="cust-points-badge">⭐ {{ c.points || 0 }} pts</span>
        </div>

        <div class="cust-stats-row">
          <div>
            <span class="cust-stat-lbl">Visits</span>
            <span class="cust-stat-val">{{ c.visits_count || 0 }}</span>
          </div>
          <div>
            <span class="cust-stat-lbl">Total Spent</span>
            <span class="cust-stat-val">ETB {{ Math.round(c.total_spent || 0) }}</span>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-sm btn-outline" style="flex:1" @click="adjustPoints(c)">Adjust Points</button>
        </div>
      </div>
    </div>

    <!-- Add Customer Modal -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal = false">
      <div class="modal">
        <h3>New Customer Profile</h3>
        <div class="form-group">
          <label>Full Name *</label>
          <input v-model="form.name" class="input" placeholder="e.g. Abebe Bikila" />
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input v-model="form.phone" class="input" placeholder="0911223344" />
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input v-model="form.email" class="input" placeholder="customer@example.com" />
        </div>
        <div class="form-group">
          <label>Notes / Preferences</label>
          <textarea v-model="form.notes" class="input" placeholder="Table preference, allergies, etc."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal = false">Cancel</button>
          <button class="btn btn-primary" :disabled="!form.name || saving" @click="saveCustomer">
            {{ saving ? 'Saving…' : 'Save Customer' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue'
import { apiGet, apiPost } from '../api'

const toast = inject('toast')
const customers = ref([])
const loading = ref(true)
const searchQuery = ref('')
const showModal = ref(false)
const saving = ref(false)

const form = ref({ name: '', phone: '', email: '', notes: '' })

async function loadCustomers() {
  loading.value = true
  try {
    const res = await apiGet(`customers?q=${encodeURIComponent(searchQuery.value)}`)
    customers.value = res.customers || []
  } catch (e) {
    toast('Could not load customers', 'error')
  } finally {
    loading.value = false
  }
}

function searchCustomers() {
  loadCustomers()
}

function openAddModal() {
  form.value = { name: '', phone: '', email: '', notes: '' }
  showModal.value = true
}

async function saveCustomer() {
  if (!form.value.name) return
  saving.value = true
  try {
    const res = await apiPost('customers', form.value)
    if (res.ok) {
      toast('Customer added', 'success')
      showModal.value = false
      loadCustomers()
    } else {
      toast(res.error || 'Failed to create customer', 'error')
    }
  } catch (e) {
    toast(e.message || 'Failed to save customer', 'error')
  } finally {
    saving.value = false
  }
}

async function adjustPoints(c) {
  const ptsStr = prompt(`Adjust points for ${c.name} (current: ${c.points || 0}):\nEnter positive to add, negative to deduct`, '50')
  if (!ptsStr) return
  const pts = parseInt(ptsStr, 10)
  if (isNaN(pts) || pts === 0) return
  try {
    const res = await apiPost(`customers/${c.id}/points`, { points: pts, description: 'Manual adjustment' })
    if (res.ok) {
      toast(`Points updated to ${res.newBalance}`, 'success')
      loadCustomers()
    }
  } catch {
    toast('Points adjustment failed', 'error')
  }
}

onMounted(() => loadCustomers())
</script>

<style scoped>
.cust-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; margin-top: 16px; }
.cust-card { padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.cust-points-badge { background: #FEF3C7; color: #D97706; padding: 3px 8px; border-radius: 99px; font-size: .78rem; font-weight: 700; }
.cust-stats-row { display: flex; gap: 20px; padding: 8px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-top: 8px; }
.cust-stat-lbl { display: block; font-size: .68rem; color: var(--text-muted); text-transform: uppercase; }
.cust-stat-val { font-size: .95rem; font-weight: 700; color: var(--text-heading); }
</style>
