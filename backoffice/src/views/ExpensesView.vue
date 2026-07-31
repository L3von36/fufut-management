<template>
  <div>
    <div class="table-toolbar">
      <h3>Expenses</h3>
      <div style="display:flex;gap:10px">
        <input type="date" v-model="dateFrom" class="input input-sm" style="width:auto" />
        <input type="date" v-model="dateTo" class="input input-sm" style="width:auto" />
        <button class="btn btn-primary" @click="loadExpenses">Filter</button>
        <button class="btn btn-secondary" @click="showForm=true;editing=null;form={}">+ Add</button>
        <base-button text="Export" variant="btn-secondary" :on-click="exportCSV" />
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">ETB {{ totalExpenses.toFixed(0) }}</div><div class="lbl">Total (Filtered)</div></div>
      <div class="summary-card"><div class="num">{{ expenses.length }}</div><div class="lbl">Entries</div></div>
      <div class="summary-card"><div class="num">{{ topCategory }}</div><div class="lbl">Top Category</div></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount (ETB)</th><th>Paid By</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="e in expenses" :key="e.id">
              <td>{{ e.date }}</td><td><span class="badge badge-pending">{{ e.category }}</span></td>
              <td>{{ e.description }}</td><td style="font-weight:600;font-family:var(--font-mono)">{{ parseFloat(e.amount||0).toFixed(0) }}</td>
              <td>{{ e.paidBy || '-' }}</td>
              <td><button class="btn btn-sm btn-ghost" @click="editExpense(e)">Edit</button><base-button text="Delete" variant="btn-ghost" extra-class="btn-sm" :on-click="() => deleteExpense(e.id)" /></td>
            </tr>
            <tr v-if="!expenses.length"><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">No expenses found</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit Expense' : 'Add Expense' }}</h3>
        <div class="modal-sub">{{ editing ? 'Update expense details' : 'Record a new expense' }}</div>
        <form @submit.prevent="saveExpense">
          <div class="form-row">
            <div class="form-group"><label>Date</label><input type="date" v-model="form.date" required /></div>
            <div class="form-group"><label>Category</label><select v-model="form.category" required class="select">
              <option>Ingredients</option><option>Labor</option><option>Utilities</option><option>Rent</option><option>Marketing</option><option>Maintenance</option><option>Packaging</option><option>Other</option>
            </select></div>
          </div>
          <div class="form-group"><label>Description</label><input v-model="form.description" required /></div>
          <div class="form-row">
            <div class="form-group"><label>Amount (ETB)</label><input type="number" v-model.number="form.amount" required min="0" /></div>
            <div class="form-group"><label>Paid By</label><input v-model="form.paidBy" /></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="showForm=false">Cancel</button>
            <button type="submit" class="btn btn-primary" :class="{'btn-loading': btnState.isBusy(), 'btn-success-state': btnState.isSuccess(), 'btn-error-state': btnState.isError()}" :disabled="btnState.isBusy()" :aria-busy="btnState.isBusy() ? 'true' : undefined">
              <span v-if="btnState.isBusy()" class="btn-spinner" aria-hidden="true"></span>
              <span v-else-if="btnState.isSuccess()" class="btn-check" aria-hidden="true">✓</span>
              <span v-else-if="btnState.isError()" class="btn-error-icon" aria-hidden="true">!</span>
              {{ btnState.isBusy() ? 'Saving...' : btnState.isSuccess() ? 'Saved ✓' : btnState.isError() ? 'Try Again' : (editing ? 'Update' : 'Save') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete, TODAY } from '../api'
import { useButtonState } from '../composables/useButtonState'

const toast = inject('toast')
const btnState = useButtonState({ successDuration: 2000 })
const expenses = ref([])
const dateFrom = ref(TODAY())
const dateTo = ref(TODAY())
const showForm = ref(false)
const editing = ref(null)
const form = ref({ date: TODAY(), category: 'Other', description: '', amount: 0, paidBy: '' })

const totalExpenses = computed(() => expenses.value.reduce((s, e) => s + parseFloat(e.amount||0), 0))
const topCategory = computed(() => {
  const c = {}; expenses.value.forEach(e => { c[e.category] = (c[e.category]||0) + parseFloat(e.amount||0) })
  const entries = Object.entries(c).sort((a,b) => b[1] - a[1])
  return entries.length ? entries[0][0] : '-'
})

onMounted(() => { const d = new Date(); d.setDate(d.getDate()-30); dateFrom.value = d.toISOString().slice(0,10); loadExpenses() })

async function loadExpenses() {
  try { expenses.value = await apiGet('expenses') } catch (e) { console.error(e) }
}

function editExpense(e) { editing.value = e; form.value = { ...e }; showForm.value = true }

async function saveExpense() {
  btnState.setLoading()
  try {
    if (editing.value) {
      await apiPut('expenses', { ...form.value, id: editing.value.id })
      toast('Expense updated')
    } else {
      await apiPost('expenses', form.value)
      toast('Expense added')
    }
    showForm.value = false; editing.value = null; form.value = { date: TODAY(), category: 'Other', description: '', amount: 0, paidBy: '' }
    await loadExpenses()
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return
  try { await apiDelete('expenses', id); toast('Expense deleted'); await loadExpenses() } catch (e) { toast(e.message, 'error') }
}

async function exportCSV() {
  try {
    const res = await apiPost('export/csv', { table: 'expenses' })
    if (res.csv) { const b = new Blob([res.csv], {type:'text/csv'}); const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download='expenses.csv'; a.click() }
  } catch (e) { toast('Export failed', 'error'); throw e }
}
</script>