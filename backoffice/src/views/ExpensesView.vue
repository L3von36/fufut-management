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
      <base-table
        :columns="columns"
        :rows="filtered"
        caption="Expenses for the selected period"
        empty-title="No expenses found"
        empty-hint="Nothing recorded in this date range."
      >
        <template #cell-category="{ row }"><span class="badge badge-neutral">{{ row.category || 'Uncategorised' }}</span></template>
        <template #cell-amount="{ row }">
          <span style="font-weight:600;font-family:var(--font-mono)">{{ parseFloat(row.amount||0).toFixed(0) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button class="btn btn-sm btn-ghost" @click="editExpense(row)">Edit</button>
          <base-button text="Delete" variant="btn-ghost" extra-class="btn-sm" :on-click="() => deleteExpense(row.id)" />
        </template>
      </base-table>
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
import BaseTable from '../components/BaseTable.vue'
import { useButtonState } from '../composables/useButtonState'
import { toCsv, download } from '../lib/csv'

const toast = inject('toast')
const confirmDelete = inject('confirm')
const btnState = useButtonState({ successDuration: 2000 })
const expenses = ref([])
const dateFrom = ref(TODAY())
const dateTo = ref(TODAY())
const showForm = ref(false)
const editing = ref(null)
const form = ref({ date: TODAY(), category: 'Other', description: '', amount: 0, paidBy: '' })

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'category', label: 'Category' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount (ETB)' },
  { key: 'paidBy', label: 'Paid By' },
  { key: 'actions', label: 'Actions' },
]


/**
 * The date range now actually applies.
 *
 * `loadExpenses` fetched every row and ignored dateFrom/dateTo, so the Filter
 * button did nothing while the totals beside it were labelled as filtered.
 * Voided expenses are excluded too — they are kept for the audit trail, not
 * because the business still spent the money.
 */
const filtered = computed(() =>
  expenses.value.filter(e => {
    if (e.voided_at) return false
    const d = (e.date || '').slice(0, 10)
    if (!d) return true
    if (dateFrom.value && d < dateFrom.value) return false
    if (dateTo.value && d > dateTo.value) return false
    return true
  })
)

const totalExpenses = computed(() => filtered.value.reduce((s, e) => s + parseFloat(e.amount || 0), 0))

/** Name and amount — the label alone did not say how much, or of what. */
const topCategory = computed(() => {
  const c = {}
  filtered.value.forEach(e => {
    const key = e.category || 'Uncategorised'   // was rendering "undefined"
    c[key] = (c[key] || 0) + parseFloat(e.amount || 0)
  })
  const entries = Object.entries(c).sort((a, b) => b[1] - a[1])
  if (!entries.length) return '—'
  const [name, amount] = entries[0]
  const share = totalExpenses.value > 0 ? Math.round((amount / totalExpenses.value) * 100) : 0
  return `${name} — ETB ${Math.round(amount)} (${share}%)`
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
  if (!await confirmDelete('Delete this expense?')) return
  try { await apiDelete('expenses', id); toast('Expense deleted'); await loadExpenses() } catch (e) { toast(e.message, 'error') }
}

/**
 * Exports what is on screen.
 *
 * This POSTed to `/api/export/csv`, an endpoint that has never existed, so
 * every export 404'd — and because the failure was caught and toasted
 * generically it read as a transient glitch rather than a missing feature.
 *
 * Serialised client-side from the rows already loaded, which also means the
 * export honours the current filter instead of silently dumping everything.
 */
async function exportCSV() {
  const rows = filtered.value
  if (!rows.length) { toast('Nothing to export', 'error'); return }
  download(toCsv(rows), `expenses-${TODAY()}.csv`, 'text/csv;charset=utf-8')
  toast(`${rows.length} expense(s) exported`)
}
</script>