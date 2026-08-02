<template>
  <div>
    <div class="table-toolbar">
      <h3>Reviews</h3>
      <select v-model="filter" class="select select-sm">
        <option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
      </select>
    </div>
    <div class="summary-grid">
      <div class="summary-card"><div class="num">{{ items.length }}</div><div class="lbl">Total</div></div>
      <div class="summary-card"><div class="num" style="color:var(--warning)">{{ items.filter(r=>r.status==='pending').length }}</div><div class="lbl">Pending</div></div>
      <div class="summary-card"><div class="num" style="color:var(--success)">{{ items.filter(r=>r.status==='approved').length }}</div><div class="lbl">Approved</div></div>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Author</th><th>Rating</th><th>Review</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.id">
              <td><strong>{{ r.author||r.name||'—' }}</strong></td>
              <td><span style="color:var(--warning)">{{ '★'.repeat(parseInt(r.rating||0)) }}{{ '☆'.repeat(5-parseInt(r.rating||0)) }}</span></td>
              <td style="max-width:300px;white-space:normal">{{ r.text||r.review||'—' }}</td>
              <td><span class="badge" :class="'badge-'+r.status">{{ r.status }}</span></td>
              <td>{{ r.date||'—' }}</td>
              <td>
                <base-button v-if="r.status==='pending'" text="Approve" variant="btn-sm btn-success" :on-click="() => update(r,'approved')" loading-label="Approving..." success-label="Approved ✓"></base-button>
                <base-button v-if="r.status==='pending'" text="Reject" variant="btn-sm btn-danger" :on-click="() => update(r,'rejected')" loading-label="Rejecting..." success-label="Rejected ✓"></base-button>
              </td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="6" class="empty-state" style="padding:40px">No reviews</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet, apiPut } from '../api'
import { useToast } from '../composables/useToast'
const { success: toastOk, error: toastErr, info: toastInfo } = useToast()
const items = ref([]); const filter = ref('')
const filtered = computed(() => !filter.value ? items.value : items.value.filter(r => r.status === filter.value))
onMounted(loadData)
async function loadData() { try { items.value = await apiGet('reviews') || [] } catch { items.value = [] } }
async function update(r,s) { r.status=s; try { await apiPut('reviews/'+r.id,r); toast(s); await loadData() } catch (e) { toast('Failed','error'); throw e } }
</script>
