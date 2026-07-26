<template>
  <div>
    <div class="table-toolbar"><h3>Profit & Loss</h3><button class="btn btn-outline btn-sm" @click="loadData">Refresh</button></div>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi-card"><div class="kpi-bar teal"></div><div class="kpi-label">Revenue (30d)</div><div class="kpi-value" style="color:var(--success)">ETB {{ rev30.toFixed(0) }}</div></div>
      <div class="kpi-card"><div class="kpi-bar yellow"></div><div class="kpi-label">Expenses (30d)</div><div class="kpi-value" style="color:var(--danger)">ETB {{ exp30.toFixed(0) }}</div></div>
      <div class="kpi-card"><div class="kpi-bar" :class="net30>=0?'teal':'yellow'"></div><div class="kpi-label">Net Profit</div><div class="kpi-value" :style="{color:net30>=0?'var(--success)':'var(--danger)'}">ETB {{ net30.toFixed(0) }}</div></div>
    </div>
    <div class="chart-grid" style="grid-template-columns:1fr">
      <div class="chart-card"><h3>Revenue vs Expenses (Last 30 Days)</h3><canvas ref="pnlChart"></canvas></div>
    </div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Expense Breakdown</h3><canvas ref="expChart"></canvas></div>
      <div class="chart-card"><h3>Daily Net (Last 7 Days)</h3><canvas ref="netChart"></canvas></div>
    </div>
    <div class="dash-grid" style="margin-top:16px">
      <div class="card"><div class="card-header"><h3>Revenue</h3></div>
        <div class="table-scroll" v-if="orders.length"><table><thead><tr><th>Order</th><th>Items</th><th>Total</th></tr></thead>
          <tbody><tr v-for="o in orders.slice(0,8)" :key="o.id"><td data-label="Order">#{{ o.id }}</td><td data-label="Items">{{ o.items }}</td><td data-label="Total" style="font-weight:600">ETB {{ parseFloat(o.total||0).toFixed(0) }}</td></tr></tbody></table></div>
        <div v-else class="empty-state" style="padding:24px"><div>No orders</div></div>
      </div>
      <div class="card"><div class="card-header"><h3>Expenses</h3></div>
        <div class="table-scroll" v-if="expenses.length"><table><thead><tr><th>Category</th><th>Amount</th></tr></thead>
          <tbody><tr v-for="e in expenses.slice(0,8)" :key="e.id"><td data-label="Category"><span class="badge badge-new">{{ e.category }}</span></td><td data-label="Amount" style="font-weight:600">ETB {{ parseFloat(e.amount||0).toFixed(0) }}</td></tr></tbody></table></div>
        <div v-else class="empty-state" style="padding:24px"><div>No expenses</div></div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { apiGet } from '../api'
let _Chart = null
async function _loadChart() {
  if (!_Chart) {
    const { Chart, registerables } = await import('chart.js')
    Chart.register(...registerables)
    _Chart = Chart
  }
  return _Chart
}

const orders = ref([]); const expenses = ref([])
const pnlChart = ref(null); const expChart = ref(null); const netChart = ref(null)

function isLast30(d) { return d >= new Date(Date.now() - 30*86400000).toISOString().slice(0,10) }
const rev30 = computed(() => orders.value.filter(o => isLast30(o.created||'')).reduce((s,o) => s + parseFloat(o.total||0), 0))
const exp30 = computed(() => expenses.value.filter(e => isLast30(e.date||'')).reduce((s,e) => s + parseFloat(e.amount||0), 0))
const net30 = computed(() => rev30.value - exp30.value)

onMounted(loadData)
async function loadData() {
  try { const [o,e]=await Promise.all([apiGet('orders'),apiGet('expenses')]); orders.value=o; expenses.value=e; await nextTick(); await buildCharts() } catch {}
}

async function buildCharts() {
  const Chart = await _loadChart()
  if (!pnlChart.value||!expChart.value||!netChart.value) return
  // Destroy old
  [pnlChart, expChart, netChart].forEach(ref => { if (ref.value?.chart) ref.value.chart.destroy() })

  const days=[]; const rev=[]; const exp=[]; const net=[]
  for (let i=29;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i); const ds=d.toISOString().slice(0,10)
    days.push(d.toLocaleDateString('en',{month:'short',day:'numeric'}))
    const r=orders.value.filter(o=>(o.created||'').slice(0,10)===ds).reduce((s,o)=>s+parseFloat(o.total||0),0)
    const e2=expenses.value.filter(ex=>ex.date===ds).reduce((s,ex)=>s+parseFloat(ex.amount||0),0)
    rev.push(r); exp.push(e2); net.push(r-e2)
  }

  pnlChart.value.chart = new Chart(pnlChart.value, { type:'line', data:{ labels:days, datasets:[
    { label:'Revenue', data:rev, borderColor:'#0F7B78', tension:.3, fill:false },
    { label:'Expenses', data:exp, borderColor:'#D97706', tension:.3, fill:false }
  ]}, options:{ responsive:true, plugins:{ legend:{ position:'top' } } } })

  const cats={}; for(const e of expenses.value) cats[e.category]=(cats[e.category]||0)+parseFloat(e.amount||0)
  const cl=Object.keys(cats), cv=Object.values(cats)
  if(cl.length) expChart.value.chart = new Chart(expChart.value, { type:'doughnut', data:{ labels:cl, datasets:[{ data:cv, backgroundColor:['#0F7B78','#18B4B7','#D6B36A','#2E7D32','#D97706','#2563EB','#D32F2F'] }] }, options:{ responsive:true, plugins:{ legend:{ position:'right',labels:{boxWidth:12,font:{size:10}} } } } })

  const last7=net.slice(-7)
  netChart.value.chart = new Chart(netChart.value, { type:'bar', data:{ labels:['D-6','D-5','D-4','D-3','D-2','D-1','Today'], datasets:[{ label:'Net', data:last7, backgroundColor:last7.map(v=>v>=0?'rgba(15,123,120,.7)':'rgba(211,47,47,.7)'), borderRadius:4 }] }, options:{ responsive:true, plugins:{ legend:{ display:false } } } })
}
</script>
