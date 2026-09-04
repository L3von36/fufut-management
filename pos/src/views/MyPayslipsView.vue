<template>
  <div>
    <div class="table-toolbar">
      <h3>My Payslips</h3>
      <button class="btn btn-outline" @click="load">Refresh</button>
    </div>

    <!-- ─── Your current pay ─── -->
    <div class="card mp-current">
      <div class="mp-current-main">
        <div class="mp-kpi-num">{{ current ? etb(current.baseSalary) : '—' }}</div>
        <div class="mp-kpi-lbl">
          Your base salary{{ current ? ' · ' + titleCase(current.salaryPeriod) : '' }}
          <span v-if="current && current.employmentType" class="mp-chip">{{ titleCase(current.employmentType) }}</span>
        </div>
      </div>
      <p v-if="!current && !loading" class="mp-empty-note">
        The manager has not recorded a base salary on your record yet.
      </p>
    </div>

    <!-- ─── Provisional banner ─── -->
    <div v-if="latestProvisional" class="mp-provisional">
      These payslips were computed before the tax bands, pension and overtime rates were confirmed
      by an accountant. Treat the figures as provisional until the manager says otherwise.
    </div>

    <!-- ─── Payslip history ─── -->
    <div class="card">
      <table v-if="payslips.length" class="mp-table">
        <thead>
          <tr>
            <th>Period</th>
            <th class="num">Base</th>
            <th class="num">Overtime</th>
            <th class="num">Bonuses</th>
            <th class="num">Deductions</th>
            <th class="num">Tax (PAYE)</th>
            <th class="num">Pension</th>
            <th class="num">Net Pay</th>
            <th class="num">Tips Earned</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in payslips" :key="p.id">
            <td>{{ periodLabel(p) }}</td>
            <td class="num">{{ etb(p.base_salary) }}</td>
            <td class="num">{{ p.overtime_pay ? '+' + etb(p.overtime_pay) : '—' }}</td>
            <td class="num">{{ p.bonuses ? '+' + etb(p.bonuses) : '—' }}</td>
            <td class="num">{{ p.deductions ? '−' + etb(p.deductions) : '—' }}</td>
            <td class="num">{{ etb(p.income_tax) }}</td>
            <td class="num">{{ etb(p.pension_employee) }}</td>
            <td class="num mp-net">{{ etb(p.net_pay) }}</td>
            <td class="num">{{ p.tips_earned ? etb(p.tips_earned) : '—' }}</td>
            <td>
              <span class="badge" :class="p.run_status === 'paid' ? 'badge-ok' : 'badge-info'">{{ titleCase(p.run_status || 'draft') }}</span>
              <span v-if="p.provisional" class="badge badge-warn" title="Rates were unconfirmed when this run was computed">Provisional</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loading" class="mp-empty-note">
        No payslips yet. Payroll appears here once the manager has run it for a period that includes you.
      </p>
      <p v-else class="mp-empty-note">Loading…</p>
    </div>

    <!-- ─── The two standing notes ─── -->
    <div class="card mp-notes">
      <p>
        <strong>Tips are reported, not paid by the café.</strong> A tip is money a guest gave you;
        it is shown on each payslip so you can see what you were owed, and it is never added into
        your gross pay and never taxed as salary.
      </p>
      <p>
        <strong>You are seeing your own payslips only.</strong> Salary figures on other people's
        records are private to them and to the manager. If a figure here looks wrong, raise it with
        the manager — it will be checked against the payroll run and corrected, and the correction
        is audited.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiGet } from '../api'
import { titleCase } from '../lib/formatters'

/**
 * My Payslips — the self-service half of payroll.
 *
 * The server route (/api/payroll/me) takes no parameter and answers only the
 * session holder's own lines, so this screen cannot be pointed at a colleague
 * even by hand. Every role sees this tab: the person whose wage a payslip
 * describes is the one person who never needs to ask for it.
 */

const loading = ref(true)
const payslips = ref([])
const current = ref(null)

const latestProvisional = computed(() => payslips.value.some((p) => p.provisional))

const etb = (n) =>
  'ETB ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function periodLabel(p) {
  const s = String(p.period_start || '')
  const e = String(p.period_end || '')
  if (!s && !e) return '—'
  const short = (d) => (d ? d.slice(0, 10) : '…')
  return s.slice(0, 7) === e.slice(0, 7)
    ? `${short(s)} → ${short(e)}`
    : `${short(s)} → ${short(e)}`
}

async function load() {
  loading.value = true
  try {
    const res = await apiGet('/payroll/me')
    if (res && res.ok) {
      payslips.value = res.payslips || []
      current.value = res.current || null
    }
  } catch {
    // A failed read leaves the last good data on screen; the toolbar refresh
    // is the retry. Same contract as the other read-only screens.
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.mp-current{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.mp-current-main{display:flex;flex-direction:column;gap:2px}
.mp-kpi-num{font-size:28px;font-weight:700;color:var(--text, #1a2b2a);letter-spacing:-0.5px}
.mp-kpi-lbl{font-size:13px;color:var(--text-muted, #5f7775);display:flex;align-items:center;gap:8px}
.mp-chip{background:var(--surface-2, #eef4f3);border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;color:var(--text, #1a2b2a)}
.mp-table{width:100%;border-collapse:collapse;font-size:13px}
.mp-table th,.mp-table td{padding:8px 10px;border-bottom:1px solid var(--border, #e3ecea);text-align:left;white-space:nowrap}
.mp-table th{font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-muted, #5f7775)}
.mp-table .num{text-align:right;font-variant-numeric:tabular-nums}
.mp-net{font-weight:700}
.badge{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600}
.badge-ok{background:#e5f5ef;color:#0f7a55}
.badge-info{background:#e8f0f9;color:#1f5f9e}
.badge-warn{background:#fdf3e1;color:#9a6a10;margin-left:6px}
.mp-provisional{background:#fdf3e1;border:1px solid #f0dcae;color:#7c5808;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:14px}
.mp-notes{margin-top:14px;font-size:13px;color:var(--text-muted, #5f7775);display:flex;flex-direction:column;gap:8px}
.mp-notes p{margin:0}
.mp-notes strong{color:var(--text, #1a2b2a)}
.mp-empty-note{color:var(--text-muted, #5f7775);font-size:13px;padding:10px 4px;margin:0}
</style>
