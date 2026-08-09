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
      <!-- Spans the grid: a table of categories needs the width, and this is
           the answer to "how long does a coffee take to reach the table". -->
      <div class="card rt-timing">
        <div class="card-header rt-timing-header">
          <h3>Time to Table</h3>
          <div class="rt-range">
            <button
              v-for="r in RANGES"
              :key="r.days"
              class="btn btn-sm"
              :class="rangeDays === r.days ? 'btn-primary' : 'btn-outline'"
              @click="setRange(r.days)"
            >{{ r.label }}</button>
          </div>
        </div>

        <div v-if="timingLoading" class="empty-state" style="padding:24px"><div>Loading…</div></div>

        <template v-else-if="timingRows.length">
          <p class="rt-sample">
            Measured from {{ timingSampled }} served item{{ timingSampled === 1 ? '' : 's' }},
            ordered slowest first.
          </p>
          <div class="rt-rows">
            <div v-for="row in timingRows" :key="row.category" class="rt-row">
              <div class="rt-row-head">
                <span class="rt-cat">{{ row.category }}</span>
                <span class="rt-avg">{{ row.averageMinutes }} min</span>
              </div>
              <!-- Bar is relative to the slowest category, so the comparison a
                   kitchen actually makes - which section is dragging - is the
                   one the eye makes first. -->
              <div class="rt-bar"><div class="rt-bar-fill" :style="{ width: barWidth(row) }"></div></div>
              <div class="rt-row-foot">
                <span>{{ row.served }} served</span>
                <span>fastest {{ row.fastestMinutes }} min · slowest {{ row.slowestMinutes }} min</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Distinguishes "nothing sold" from "sold but never marked served",
             because the fix for each is completely different. -->
        <div v-else class="empty-state" style="padding:24px">
          <div>No items have been marked served in this period.</div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-top:6px">
            Timings appear once the kitchen marks items ready and served on the Kitchen screen.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Export</h3></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-sm btn-outline" @click="exportCSV('today')">Today's Orders (CSV)</button>
          <button class="btn btn-sm btn-outline" @click="exportCSV('month')">This Month (CSV)</button>
          <button v-if="auth.roleKey === 'manager'" class="btn btn-sm btn-outline" @click="exportJSON">All Data (JSON)</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted , inject} from 'vue'
import { apiGet, TODAY } from '../api'
import { useAuthStore } from '../stores/auth'
const toast = inject('toast')
const auth = useAuthStore()
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
// ─── Time to table ───
// Averages are computed server-side over order_items, not from the orders list
// already loaded here: a mixed ticket has one order timestamp but several dish
// timings, which is the whole reason per-line tracking exists.
const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' }
]
const rangeDays = ref(1)
const timingRows = ref([])
const timingSampled = ref(0)
const timingLoading = ref(true)

function rangeStartIso(days) {
  const d = new Date()
  if (days <= 1) {
    // "Today" means since local midnight, not the last 24 hours - staff compare
    // against the service they are working, not a rolling window.
    d.setHours(0, 0, 0, 0)
  } else {
    d.setDate(d.getDate() - days)
  }
  return d.toISOString()
}

async function loadTiming() {
  timingLoading.value = true
  try {
    const res = await apiGet(`orders/timing?from=${encodeURIComponent(rangeStartIso(rangeDays.value))}`)
    timingRows.value = res.categories || []
    timingSampled.value = res.sampled || 0
  } catch (e) {
    console.error(e)
    timingRows.value = []
    timingSampled.value = 0
  } finally {
    timingLoading.value = false
  }
}

function setRange(days) {
  rangeDays.value = days
  loadTiming()
}

/** Relative to the slowest category, which is what the eye should catch. */
function barWidth(row) {
  const max = timingRows.value.reduce((m, r) => Math.max(m, r.averageMinutes), 0)
  if (!max) return '0%'
  return `${Math.max(4, Math.round((row.averageMinutes / max) * 100))}%`
}

onMounted(async () => {
  loadTiming()
  try { const [o,e]=await Promise.all([apiGet('orders'),apiGet('expenses')]); orders.value=o; expenses.value=e } catch (e) { console.error(e) }
})
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

<style scoped>
/* The category table needs more width than the summary cards, so it spans the
   auto-fit grid rather than being squeezed into one 280px column. */
.rt-timing { grid-column: 1 / -1; }
.rt-timing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.rt-range { display: flex; gap: 6px; }

.rt-sample { font-size: .82rem; color: var(--text-muted); margin-bottom: 12px; }

.rt-rows { display: flex; flex-direction: column; gap: 12px; }
.rt-row-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.rt-cat { font-size: .88rem; font-weight: 600; color: var(--text-heading); }
.rt-avg { font-size: .95rem; font-weight: 700; font-family: var(--font-mono); color: var(--text-heading); }

.rt-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--neutral-100);
  overflow: hidden;
  margin: 4px 0 3px;
}
.rt-bar-fill { height: 100%; border-radius: 3px; background: var(--primary); }

.rt-row-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: .78rem;
  color: var(--text-muted);
}
</style>
