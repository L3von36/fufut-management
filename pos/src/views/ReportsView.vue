<template>
  <div>
    <div class="table-toolbar"><h3>Reports</h3></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
      <div class="card">
        <div class="card-header"><h3>Today's Summary</h3></div>
        <div v-if="todaySummary.length">
          <div v-for="s in todaySummary" :key="s.label" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem">
            <span>{{ s.label }}</span><span style="font-weight:600;font-family:var(--font-mono)">{{ s.value }}</span>
          </div>
        </div>
        <div v-else class="empty-state" style="padding:24px"><div>No orders today</div></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>This Month</h3></div>
        <div v-if="monthSummary.length">
          <div v-for="s in monthSummary" :key="s.label" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem">
            <span>{{ s.label }}</span><span style="font-weight:600;font-family:var(--font-mono)">{{ s.value }}</span>
          </div>
        </div>
        <div v-else class="empty-state" style="padding:24px"><div>No data yet</div></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Top Products</h3></div>
        <div v-if="topProducts.length">
          <div v-for="(p,i) in topProducts.slice(0,5)" :key="i" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:.82rem">
            <span>{{ i+1 }}. {{ p.name }}</span><span style="font-weight:600">{{ p.count }}×</span>
          </div>
        </div>
        <div v-else class="empty-state" style="padding:24px"><div>No data</div></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Export</h3></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-sm btn-outline" @click="exportCSV('today')">Today's Orders (CSV)</button>
          <button class="btn btn-sm btn-outline" @click="exportCSV('month')">This Month (CSV)</button>
          <button class="btn btn-sm btn-outline" @click="exportJSON">All Data (JSON)</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, TODAY } from '../api'
import { useToast } from '../composables/useToast'
const { toast } = useToast()
const orders = ref([]); const expenses = ref([])
const todayData = computed(() => orders.value.filter(o => (o.created||'').slice(0,10) === TODAY()))
const monthData = computed(() => orders.value.filter(o => (o.created||'').slice(0,7) === TODAY().slice(0,7)))
const todayExp = computed(() => expenses.value.filter(e => e.date === TODAY()))
const monthExp = computed(() => expenses.value.filter(e => (e.date||'').slice(0,7) === TODAY().slice(0,7)))
const todaySummary = computed(() => {
  if (!todayData.value.length) return []
  const rev = todayData.value.reduce((s,o) => s + parseFloat(o.total||0), 0)
  const exp = todayExp.value.reduce((s,e) => s + parseFloat(e.amount||0), 0)
  return [
    { label:'Orders', value:todayData.value.length },
    { label:'Revenue', value:`ETB ${rev.toFixed(0)}` },
    { label:'Expenses', value:`ETB ${exp.toFixed(0)}` },
    { label:'Net', value:`ETB ${(rev-exp).toFixed(0)}` }
  ]
})
const monthSummary = computed(() => {
  if (!monthData.value.length) return []
  const rev = monthData.value.reduce((s,o) => s + parseFloat(o.total||0), 0)
  const exp = monthExp.value.reduce((s,e) => s + parseFloat(e.amount||0), 0)
  return [
    { label:'Orders', value:monthData.value.length },
    { label:'Revenue', value:`ETB ${rev.toFixed(0)}` },
    { label:'Expenses', value:`ETB ${exp.toFixed(0)}` },
    { label:'Net', value:`ETB ${(rev-exp).toFixed(0)}` }
  ]
})
const topProducts = computed(() => {
  const counts = {}
  for (const o of orders.value) {
    for (const item of (o.items||'').split(',').map(i=>i.trim())) {
      const name = item.replace(/^\d+×/,'')
      if (name) counts[name] = (counts[name]||0) + 1
    }
  }
  return Object.entries(counts).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,10)
})
onMounted(async () => { try { const [o,e]=await Promise.all([apiGet('orders'),apiGet('expenses')]); orders.value=o; expenses.value=e } catch {} })
function toCSV(data, fn) {
  if (!data.length) return; const h=Object.keys(data[0]); const r=data.map(x=>h.map(k=>`"${(x[k]||'').toString().replace(/"/g,'""')}"`).join(',')); const csv=[h.join(','),...r].join('\n')
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=fn; a.click()
}
function exportCSV(p) {
  const d = p==='today'?todayData.value:monthData.value
  toCSV(d.map(o=>({ID:o.id,Items:o.items,Total:o.total,Status:o.status,Date:(o.created||'').slice(0,10)})), `${p}-orders.csv`)
  toast('CSV exported')
}
function exportJSON() {
  const data={orders:orders.value,expenses:expenses.value,exported:new Date().toISOString(),report:'FU FUT COFFEE Report'}
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); a.download=`fufut-report-${TODAY()}.json`; a.click()
  toast('JSON exported')
}
</script>
