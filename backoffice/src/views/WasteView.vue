<template>
  <div>
    <div class="table-toolbar">
      <h3>Waste Log</h3>
      <div style="display:flex;gap:10px">
        <input type="date" v-model="dateFrom" class="input input-sm" style="width:auto" />
        <input type="date" v-model="dateTo" class="input input-sm" style="width:auto" />
        <button class="btn btn-primary" @click="loadWaste">Filter</button>
        <button class="btn btn-secondary" @click="showForm=true;editing=null;form={}">+ Log Waste</button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ totalWaste.toFixed(1) }} {{ unit }}</div><div class="lbl">Total Waste</div></div>
      <div class="summary-card"><div class="num">ETB {{ totalCost.toFixed(0) }}</div><div class="lbl">Estimated Cost</div></div>
      <div class="summary-card"><div class="num">{{ items.length }}</div><div class="lbl">Entries</div></div>
    </div>

    <div class="chart-grid">
      <div class="chart-card"><h3>Waste by Category</h3><canvas ref="wasteChart"></canvas></div>
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Quantity</th><th>Unit</th><th>Reason</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>{{ item.date }}</td><td>{{ item.itemName }}</td><td><span class="badge badge-pending">{{ item.category }}</span></td>
              <td style="font-weight:600;font-family:var(--font-mono)">{{ item.quantity }}</td><td>{{ item.unit }}</td><td>{{ item.reason || '-' }}</td>
              <td><button class="btn btn-sm btn-ghost" @click="editItem(item)">Edit</button><base-button text="Delete" variant="btn-ghost" extra-class="btn-sm" :on-click="() => deleteItem(item.id)" /></td>
            </tr>
            <tr v-if="!items.length"><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No waste logged</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal">
        <h3>{{ editing ? 'Edit Waste Entry' : 'Log Waste' }}</h3>
        <form @submit.prevent="saveItem">
          <div class="form-row">
            <div class="form-group"><label>Date</label><input type="date" v-model="form.date" required /></div>
            <div class="form-group"><label>Category</label><select v-model="form.category" class="select"><option>Produce</option><option>Dairy</option><option>Meat</option><option>Beverage</option><option>Dry Goods</option><option>Prepared Food</option><option>Other</option></select></div>
          </div>
          <div class="form-group"><label>Item Name</label><input v-model="form.itemName" required /></div>
          <div class="form-row">
            <div class="form-group"><label>Quantity</label><input type="number" v-model.number="form.quantity" min="0" step="0.1" required /></div>
            <div class="form-group"><label>Unit</label><select v-model="form.unit" class="select"><option>kg</option><option>g</option><option>L</option><option>pcs</option><option>portions</option></select></div>
          </div>
          <div class="form-group"><label>Reason</label><input v-model="form.reason" placeholder="e.g. Spoiled, overproduction, expired" /></div>
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
import { ref, computed, onMounted, nextTick, inject } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete, TODAY } from '../api'
import { useButtonState } from '../composables/useButtonState'
let _Chart = null
async function _loadChart() {
  if (!_Chart) {
    const { Chart, registerables } = await import('chart.js')
    Chart.register(...registerables)
    _Chart = Chart
  }
  return _Chart
}

const toast = inject('toast')
const confirmDelete = inject('confirm')
const btnState = useButtonState({ successDuration: 2000 })
const wasteChart = ref(null)
const items = ref([])
const dateFrom = ref(TODAY())
const dateTo = ref(TODAY())
const showForm = ref(false)
const editing = ref(null)
const form = ref({ date: TODAY(), category: 'Produce', itemName: '', quantity: 0, unit: 'kg', reason: '' })
let chart = null

const totalWaste = computed(() => items.value.reduce((s, i) => s + parseFloat(i.quantity||0), 0))
const totalCost = computed(() => items.value.reduce((s, i) => s + (parseFloat(i.quantity||0) * 20), 0))
const unit = computed(() => items.value.length ? items.value[0]?.unit || 'kg' : 'kg')

onMounted(() => { const d = new Date(); d.setDate(d.getDate()-30); dateFrom.value = d.toISOString().slice(0,10); loadWaste() })

async function loadWaste() { try { items.value = await apiGet('waste'); await nextTick(); await buildChart() } catch (e) { console.error(e) } }

async function buildChart() {
  const Chart = await _loadChart()
  if (chart) chart.destroy()
  if (!wasteChart.value) return
  const cat = {}; items.value.forEach(i => { cat[i.category] = (cat[i.category]||0) + parseFloat(i.quantity||0) })
  chart = new Chart(wasteChart.value, {
    type: 'doughnut',
    data: { labels: Object.keys(cat), datasets: [{ data: Object.values(cat), backgroundColor: ['#0F7B78','#D6B36A','#18B4B7','#D97706','#2563EB','#7DCFD0','#E4CB99'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  })
}

function editItem(item) { editing.value = item; form.value = { ...item }; showForm.value = true }
async function saveItem() {
  btnState.setLoading()
  try {
    if (editing.value) { await apiPut('waste', { ...form.value, id: editing.value.id }); toast('Updated') }
    else { await apiPost('waste', form.value); toast('Waste logged') }
    showForm.value = false; editing.value = null; form.value = { date: TODAY(), category: 'Produce', itemName: '', quantity: 0, unit: 'kg', reason: '' }
    await loadWaste()
    btnState.setSuccess()
  } catch (e) { toast(e.message, 'error'); btnState.setError(e.message) }
}
async function deleteItem(id) { if (!await confirmDelete('Delete this waste entry?')) return; try { await apiDelete('waste', id); toast('Deleted'); await loadWaste() } catch (e) { toast(e.message, 'error') } }
</script>