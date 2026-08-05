<template>
  <div>
    <div class="table-toolbar">
      <h3>Expenses</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select v-model="filter" class="select">
          <option value="">All Categories</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <button class="btn btn-primary" @click="openAdd">+ Add Expense</button>
        <button class="btn btn-outline" @click="loadData">Refresh</button>
      </div>
    </div>

    <div class="summary-grid" v-if="categoryTotals.length">
      <div class="summary-card" v-for="ct in categoryTotals" :key="ct.category">
        <div class="num" style="color:var(--danger)">ETB {{ ct.total.toFixed(0) }}</div>
        <div class="lbl">{{ ct.category }}</div>
      </div>
      <div class="summary-card">
        <div class="num">ETB {{ allTotal.toFixed(0) }}</div>
        <div class="lbl">Total</div>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Category</th><th>Description</th><th>Amount</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="e in filteredExpenses" :key="e.id">
              <td data-label="Category"><span class="badge badge-new">{{ e.category }}</span></td>
              <td data-label="Description">{{ e.description || '—' }}</td>
              <td data-label="Amount" style="font-weight:600">ETB {{ parseFloat(e.amount||0).toFixed(0) }}</td>
              <td data-label="Date">{{ e.date || '—' }}</td>
              <td data-label="Actions">
                <button class="btn btn-sm btn-ghost" @click="openEdit(e)">Edit</button>
                <button class="btn btn-sm btn-ghost danger" @click="handleDelete(e)">Delete</button>
              </td>
            </tr>
            <tr v-if="!filteredExpenses.length">
              <td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">No expenses</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><span>{{ filteredExpenses.length }} entry(ies)</span></div>
    </div>

    <div class="modal-overlay" v-if="showModal" @click.self="showModal=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit' : 'Add' }} Expense</h3>
        <p class="modal-sub">{{ editing ? 'Update expense' : 'Record a new expense' }}</p>
        <div class="form-group">
          <label>Category</label>
          <select v-model="form.category" class="select">
            <option value="">Select...</option>
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="form-group"><label>Description</label><input v-model="form.description" /></div>
        <div class="form-row">
          <div class="form-group"><label>Amount (ETB)</label><input v-model.number="form.amount" type="number" step="0.01" /></div>
          <div class="form-group"><label>Date</label><input v-model="form.date" type="date" /></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showModal=false">Cancel</button>
          <button class="btn btn-primary" @click="saveItem">{{ editing ? 'Update' : 'Add' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from '../api'
import { useToast } from '../composables/useToast'

const { toast } = useToast()
const expenses = ref([]); const filter = ref(''); const showModal = ref(false); const editing = ref(null)
const form = ref({ category: '', description: '', amount: 0, date: '' })
const categories = ['Rent','Utilities','Supplies','Equipment','Maintenance','Marketing','Other']
const filteredExpenses = computed(() => !filter.value ? expenses.value : expenses.value.filter(e => e.category === filter.value))
const categoryTotals = computed(() => { const m={}; for(const e of filteredExpenses.value){ m[e.category]=(m[e.category]||0)+parseFloat(e.amount||0) }; return Object.entries(m).map(([c,t])=>({category:c,total:t})) })
const allTotal = computed(() => filteredExpenses.value.reduce((s,e)=>s+parseFloat(e.amount||0),0))
onMounted(()=>{form.value.date=new Date().toISOString().slice(0,10);loadData()})
async function loadData() { try { expenses.value = await apiGet('expenses') } catch (e) { console.error(e) } }
function openAdd() { editing.value=null; form.value={category:'',description:'',amount:0,date:new Date().toISOString().slice(0,10)}; showModal.value=true }
function openEdit(e) { editing.value=e; form.value={...e}; showModal.value=true }
async function saveItem() { try { if(editing.value){ await apiPut('expenses/'+editing.value.id,form.value); toast('Updated') } else { await apiPost('expenses',form.value); toast('Added') }; showModal.value=false; await loadData() } catch { toast('Failed','error') } }
async function handleDelete(e) { if(!confirm('Delete?'))return; try { await apiDelete('expenses/'+e.id); toast('Deleted'); await loadData() } catch { toast('Failed','error') } }
</script>
