<template>
  <div>
    <div class="table-toolbar">
      <h3>Suppliers</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="filter" class="select">
          <option value="">All suppliers</option>
          <option value="owed">We owe money</option>
          <option v-for="c in categories" :key="c" :value="'cat:' + c">{{ c }}</option>
        </select>
        <button v-if="canEdit" class="btn btn-primary" @click="openAdd">+ Add Supplier</button>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ suppliers.length }}</div><div class="lbl">Suppliers</div></div>
      <div class="summary-card">
        <div class="num" style="color:var(--danger)">{{ fmt(totalOwed) }}</div>
        <div class="lbl">Outstanding (ETB)</div>
      </div>
      <div class="summary-card"><div class="num">{{ owing.length }}</div><div class="lbl">With a Balance</div></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Supplier</th><th>Category</th><th>Contact</th>
              <th>Purchases</th><th>Total</th><th>Paid</th><th>Balance</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in filtered" :key="s.id">
              <td data-label="Supplier"><strong>{{ s.name }}</strong></td>
              <td data-label="Category">{{ s.category || '—' }}</td>
              <td data-label="Contact">{{ s.phone || s.contact || '—' }}</td>
              <td data-label="Purchases">{{ s.purchase_count }}</td>
              <td data-label="Total">ETB {{ fmt(s.total_purchased) }}</td>
              <td data-label="Paid">ETB {{ fmt(s.total_paid) }}</td>
              <td data-label="Balance">
                <span class="badge" :class="s.balance > 0 ? 'badge-low' : 'badge-ok'">
                  ETB {{ fmt(s.balance) }}
                </span>
              </td>
              <td data-label="Actions">
                <div style="display:flex;gap:4px">
                  <button class="btn btn-sm btn-ghost" @click="openStatement(s)">Statement</button>
                  <button v-if="canEdit" class="btn btn-sm btn-ghost" @click="openEdit(s)">Edit</button>
                </div>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">No suppliers yet</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filtered.length }} supplier(s)</span></div>
    </div>

    <!-- ─── Add / edit ─── -->
    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit Supplier' : 'Add Supplier' }}</h3>
        <div class="form-group">
          <label>Name</label>
          <input v-model="form.name" :class="{ 'input-error': vErrors.name }" />
          <span v-if="vErrors.name" class="field-error">{{ vErrors.name }}</span>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Category</label>
            <select v-model="form.category" class="select">
              <option value="">Select…</option>
              <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="form-group"><label>Contact Person</label><input v-model="form.contact" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Phone</label><input v-model="form.phone" /></div>
          <div class="form-group"><label>Email</label><input v-model="form.email" type="email" /></div>
        </div>
        <div class="form-group"><label>Address</label><input v-model="form.address" /></div>
        <div class="form-group">
          <label>Supplies</label>
          <input v-model="form.supplies" placeholder="e.g. charcoal, gas cylinders" />
          <span class="field-hint">Free text, so a vendor selling two things stays one supplier.</span>
        </div>
        <div class="form-group"><label>Notes</label><input v-model="form.notes" /></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button class="btn btn-primary" @click="save">{{ editing ? 'Update' : 'Add' }}</button>
        </div>
      </div>
    </div>

    <!-- ─── Statement ─── -->
    <div class="modal-overlay" v-if="statement" @click.self="statement=null">
      <div class="modal modal-lg">
        <h3>{{ statement.supplier.name }}</h3>
        <p class="modal-sub">Purchase history — check this against their invoice.</p>
        <div class="summary-grid">
          <div class="summary-card"><div class="num">{{ fmt(statement.totals.purchased) }}</div><div class="lbl">Purchased</div></div>
          <div class="summary-card"><div class="num">{{ fmt(statement.totals.paid) }}</div><div class="lbl">Paid</div></div>
          <div class="summary-card">
            <div class="num" :style="{ color: statement.totals.balance > 0 ? 'var(--danger)' : 'var(--success)' }">
              {{ fmt(statement.totals.balance) }}
            </div>
            <div class="lbl">Balance</div>
          </div>
        </div>
        <table class="mini-table">
          <thead><tr><th>Date</th><th>Total</th><th>Paid</th><th>Owing</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="p in statement.purchases" :key="p.id">
              <td>{{ (p.date || '').slice(0, 10) }}</td>
              <td>ETB {{ fmt(p.total) }}</td>
              <td>ETB {{ fmt(p.paid) }}</td>
              <td>ETB {{ fmt(p.total - p.paid) }}</td>
              <td><span class="badge" :class="p.total - p.paid > 0 ? 'badge-low' : 'badge-ok'">{{ p.status }}</span></td>
            </tr>
            <tr v-if="!statement.purchases.length">
              <td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No purchases recorded</td>
            </tr>
          </tbody>
        </table>
        <div class="modal-actions"><button class="btn btn-secondary" @click="statement=null">Close</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut } from '../api'
import { useFormValidation } from '../composables/useFormValidation'
import { useAuthStore } from '../stores/auth'

const toast = inject('toast')
const auth = useAuthStore()

// Committing the business to a vendor is a manager's act. The head chef reads
// the list — they need to know who supplies what and what is outstanding — but
// does not create or edit one, matching the server matrix.
const canEdit = computed(() => auth.roleKey === 'manager')

/** The vendor types Fufut actually deals with, from the spec's own list. */
const CATEGORIES = [
  'Meat', 'Milk & Dairy', 'Eggs', 'Vegetables', 'Coffee', 'Tea',
  'Injera', 'Bread', 'Water', 'Soft Drinks', 'Charcoal', 'Gas',
  'Packaging', 'Cleaning', 'Uniforms', 'Printing', 'Maintenance', 'Other',
]

const schema = { name: { required: true, label: 'Name', max: 120 } }
const { errors: vErrors, validate } = useFormValidation(schema)

const suppliers = ref([])
const filter = ref('')
const showModal = ref(false)
const editing = ref(null)
const statement = ref(null)
const form = ref(blank())

function blank() {
  return { name: '', category: '', contact: '', phone: '', email: '', address: '', supplies: '', notes: '' }
}
function fmt(n) { return (Number(n) || 0).toFixed(0) }

const owing = computed(() => suppliers.value.filter(s => Number(s.balance) > 0))
const totalOwed = computed(() => owing.value.reduce((s, x) => s + Number(x.balance || 0), 0))
const categories = computed(() => [...new Set(suppliers.value.map(s => s.category).filter(Boolean))])

const filtered = computed(() => {
  if (filter.value === 'owed') return owing.value
  if (filter.value.startsWith('cat:')) {
    const c = filter.value.slice(4)
    return suppliers.value.filter(s => s.category === c)
  }
  return suppliers.value
})

onMounted(loadData)

async function loadData() {
  try {
    suppliers.value = await apiGet('suppliers')
  } catch (e) { console.error(e); toast('Could not load suppliers', 'error') }
}

function openAdd() { editing.value = null; form.value = blank(); showModal.value = true }
function openEdit(s) { editing.value = s; form.value = { ...blank(), ...s }; showModal.value = true }

async function save() {
  if (!validate(form.value)) { toast('Please fix the errors', 'error'); return }
  try {
    if (editing.value) await apiPut('suppliers/' + editing.value.id, form.value)
    else await apiPost('suppliers', form.value)
    toast(editing.value ? 'Supplier updated' : 'Supplier added')
    showModal.value = false
    await loadData()
  } catch (e) { console.error(e); toast(e?.message || 'Could not save', 'error') }
}

async function openStatement(s) {
  try {
    statement.value = await apiGet('suppliers/' + s.id)
  } catch (e) { console.error(e); toast('Could not load statement', 'error') }
}
</script>

<style scoped>
.modal-lg { max-width: 680px; width: 100%; }
.input-error { border-color: var(--danger, #e74c3c) !important; }
.field-error { display:block; color: var(--danger, #e74c3c); font-size: .75rem; margin-top: 2px; }
.field-hint { display:block; color: var(--text-muted); font-size: .72rem; margin-top: 2px; }
.mini-table { width: 100%; font-size: .8rem; }
.mini-table th, .mini-table td { padding: 6px 8px; text-align: left; }
</style>
