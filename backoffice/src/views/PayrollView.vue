<template>
  <div>
    <div class="table-toolbar">
      <h3>Payroll</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <input type="date" v-model="periodStart" class="input input-sm" style="width:auto" />
        <input type="date" v-model="periodEnd" class="input input-sm" style="width:auto" />
        <button class="btn btn-secondary" @click="showRates = !showRates">
          {{ showRates ? 'Hide Rates' : 'Rates & Bands' }}
        </button>
        <base-button text="Run Payroll" variant="btn-primary" :on-click="run" loading-label="Calculating..." success-label="Done ✓" />
      </div>
    </div>

    <!--
      The flag leads the screen. A payslip computed from rates nobody has
      confirmed must not look authoritative, and the person who can fix that is
      the one reading this.
    -->
    <div v-if="unverified" class="alert-banner warning">
      ⚠ Tax bands, pension and overtime rates have <strong>not been confirmed</strong>.
      Every figure below is provisional. Have an accountant check them under
      <button class="link-btn" @click="showRates = true">Rates &amp; Bands</button>, then mark them confirmed.
    </div>
    <div v-else class="alert-banner success">✅ Rates confirmed — payroll figures are final.</div>

    <!-- ─── Rates & bands ─── -->
    <div v-if="showRates" class="card" style="margin-bottom:16px">
      <h3 style="font-size:.9rem;margin-bottom:4px;font-weight:600">Rates &amp; Bands</h3>
      <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:14px">
        These are the figures payroll calculates from. They are stored as data, not built into the
        software, so correcting one takes effect on the next run. Every change is recorded in the
        Audit Log.
      </p>

      <table class="mini-table">
        <thead><tr><th>Setting</th><th>Value</th><th></th></tr></thead>
        <tbody>
          <tr v-for="s in editableSettings" :key="s.key">
            <td>
              <strong>{{ s.label || s.key }}</strong>
              <div style="font-size:.7rem;color:var(--text-muted)">{{ s.description || s.key }}</div>
            </td>
            <td>
              <input v-model="draft[s.key]" class="input input-sm" :style="isJson(s.value) ? 'width:100%;font-family:var(--font-mono);font-size:.7rem' : 'width:120px'" />
            </td>
            <td>
              <button class="btn btn-sm btn-primary" :disabled="draft[s.key] === s.value" @click="saveSetting(s)">Save</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button v-if="unverified" class="btn btn-primary" @click="confirmRates">
          Mark these rates confirmed
        </button>
        <button v-else class="btn btn-ghost" @click="unconfirmRates">Mark unconfirmed again</button>
        <span style="font-size:.72rem;color:var(--text-muted)">
          Confirming only clears the warning. It does not change any figure.
        </span>
      </div>
    </div>

    <!-- ─── Run result ─── -->
    <div v-if="result">
      <div class="summary-row">
        <div class="card stat"><div class="stat-num">{{ result.staffCount }}</div><div class="stat-lbl">Staff</div></div>
        <div class="card stat"><div class="stat-num">{{ money(result.totals.gross) }}</div><div class="stat-lbl">Gross</div></div>
        <div class="card stat"><div class="stat-num">{{ money(result.totals.tax) }}</div><div class="stat-lbl">Income Tax</div></div>
        <div class="card stat"><div class="stat-num">{{ money(result.totals.pension) }}</div><div class="stat-lbl">Pension (staff)</div></div>
        <div class="card stat"><div class="stat-num" style="color:var(--success)">{{ money(result.totals.net) }}</div><div class="stat-lbl">Net Payable</div></div>
      </div>

      <div class="table-toolbar" style="margin-top:4px">
        <h3 style="font-size:.9rem">Payslips</h3>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary btn-sm" @click="printRegister">🖨 Print register</button>
        </div>
      </div>

      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Staff</th><th>Base</th><th>Overtime</th><th>Bonuses</th><th>Deductions</th>
                <th>Gross</th><th>Tax</th><th>Pension</th><th>Net</th><th>Tips</th><th>Days</th><th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in result.lines" :key="l.staffId">
                <td><strong>{{ l.staffName }}</strong></td>
                <td>{{ money(l.baseSalary) }}</td>
                <td>{{ l.overtimePay ? money(l.overtimePay) : '—' }}</td>
                <td>{{ l.bonuses ? money(l.bonuses) : '—' }}</td>
                <td>{{ l.deductions ? '−' + money(l.deductions) : '—' }}</td>
                <td>{{ money(l.grossPay) }}</td>
                <td>{{ money(l.incomeTax) }}</td>
                <td>{{ money(l.pensionEmployee) }}</td>
                <td><strong>{{ money(l.netPay) }}</strong></td>
                <!--
                  Shown, never added. A tip is the guest's money given to a
                  person: it is not payroll, is not taxed here, and is in none
                  of the totals to the left.
                -->
                <td :title="'Tips earned — not part of pay and not taxed here'">
                  <span v-if="l.tipsEarned" class="badge badge-pending">{{ money(l.tipsEarned) }}</span>
                  <span v-else style="color:var(--text-muted)">—</span>
                </td>
                <td style="font-size:.75rem">{{ l.daysWorked }}<span v-if="l.daysAbsent" style="color:var(--danger)"> / {{ l.daysAbsent }} abs</span></td>
                <td><button class="btn btn-sm btn-ghost" @click="printPayslip(l)" title="Print payslip">🖨</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <span>{{ result.lines.length }} payslip(s) · {{ result.period.start }} to {{ result.period.end }}</span>
        </div>
      </div>

      <p style="font-size:.75rem;color:var(--text-muted);margin-top:10px">
        Tips are listed for information only. They are the guest's money owed to staff — not
        wages, not included in gross or net, and not taxed here.
      </p>
    </div>

    <!-- ─── Past runs ─── -->
    <div class="table-wrap" style="margin-top:20px">
      <div class="table-toolbar"><h3 style="font-size:.9rem">Previous runs</h3></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Period</th><th>Status</th><th>Gross</th><th>Tax</th><th>Net</th><th>Confirmed?</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in runs" :key="r.id">
              <td>{{ r.period_start }} → {{ r.period_end }}</td>
              <td><span class="badge" :class="r.status === 'paid' ? 'badge-success' : 'badge-pending'">{{ r.status }}</span></td>
              <td>{{ money(r.gross_total) }}</td>
              <td>{{ money(r.tax_total) }}</td>
              <td><strong>{{ money(r.net_total) }}</strong></td>
              <td>
                <span class="badge" :class="r.provisional ? 'badge-cancelled' : 'badge-success'">
                  {{ r.provisional ? 'Provisional' : 'Confirmed rates' }}
                </span>
              </td>
              <td><button class="btn btn-sm btn-ghost" @click="openRun(r)">View</button></td>
            </tr>
            <tr v-if="!runs.length"><td colspan="7" class="empty">No payroll has been run yet</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut } from '../api'
import BaseButton from '../components/BaseButton.vue'
import { printReport } from '../lib/print'

const toast = inject('toast')

const settings = ref([])
const draft = ref({})
const showRates = ref(false)
const result = ref(null)
const runs = ref([])

/** Default to the calendar month just gone, which is what payroll usually covers. */
const now = new Date()
const periodStart = ref(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
const periodEnd = ref(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10))

const unverified = computed(() => {
  const row = settings.value.find(s => s.key === 'payroll._unverified')
  return !row || row.value === 'true' || row.value === true
})

// The confirmation flag is a control, not a rate — it is toggled by the button
// below rather than typed into the table.
const editableSettings = computed(() =>
  settings.value.filter(s => s.key !== 'payroll._unverified')
)

function money(n) { return 'ETB ' + Math.round(Number(n) || 0).toLocaleString() }
function isJson(v) { return typeof v === 'string' && (v.trim().startsWith('{') || v.trim().startsWith('[')) }

onMounted(() => { loadSettings(); loadRuns() })

async function loadSettings() {
  try {
    const res = await apiGet('settings')
    settings.value = (res.settings || []).filter(s => ['payroll', 'tax'].includes(s.category))
    draft.value = Object.fromEntries(settings.value.map(s => [s.key, s.value]))
  } catch (e) {
    console.error(e)
  }
}

async function loadRuns() {
  try {
    const res = await apiGet('payroll')
    runs.value = res.runs || []
  } catch { runs.value = [] }
}

async function saveSetting(s) {
  const value = draft.value[s.key]
  // A malformed band table would be stored and then silently parsed back to a
  // default, so it is checked before it can be saved.
  if (isJson(s.value)) {
    try { JSON.parse(value) } catch { toast('That is not valid JSON — check the brackets', 'error'); return }
  }
  try {
    await apiPut(`settings/${encodeURIComponent(s.key)}`, { value })
    toast('Saved')
    await loadSettings()
  } catch (e) {
    toast(e.message || 'Could not save', 'error')
  }
}

async function confirmRates() {
  try {
    await apiPut('settings/payroll._unverified', { value: 'false', reason: 'Rates confirmed' })
    toast('Rates marked confirmed')
    await loadSettings()
  } catch (e) { toast(e.message || 'Could not save', 'error') }
}

async function unconfirmRates() {
  try {
    await apiPut('settings/payroll._unverified', { value: 'true', reason: 'Rates need re-checking' })
    toast('Marked unconfirmed')
    await loadSettings()
  } catch (e) { toast(e.message || 'Could not save', 'error') }
}

async function run() {
  try {
    const res = await apiPost('payroll/run', {
      periodStart: periodStart.value,
      periodEnd: periodEnd.value,
    })
    result.value = res
    if (res.warning) toast(res.warning, 'error')
    else toast(`${res.staffCount} payslip(s) calculated`)
    await loadRuns()
  } catch (e) {
    toast(e.message || 'Could not run payroll', 'error')
    throw e
  }
}

/**
 * One person's payslip — §53.
 *
 * The tips line is present and explicitly excluded from the totals. A payslip
 * that showed a tips figure without saying so would read as though it had been
 * taxed, and one that omitted it entirely would leave the person unable to check
 * what they are owed.
 */
function printPayslip(l) {
  const period = result.value ? `${result.value.period.start} to ${result.value.period.end}` : ''
  const ok = printReport({
    title: `Payslip — ${l.staffName}`,
    subtitle: period,
    summary: [
      ['Basic salary', money(l.baseSalary)],
      ['Overtime', money(l.overtimePay)],
      ['Bonuses', money(l.bonuses)],
      ['Gross pay', money(l.grossPay)],
      ['Pension (employee 7%)', '− ' + money(l.pensionEmployee)],
      ['Taxable pay', money(l.taxablePay ?? (l.grossPay - l.pensionEmployee))],
      ['Income tax', '− ' + money(l.incomeTax)],
      ['Other deductions', '− ' + money(l.deductions)],
      ['NET PAY', money(l.netPay)],
      ['Days worked', `${l.daysWorked}${l.daysAbsent ? ` (${l.daysAbsent} absent)` : ''}`],
      ['Tips earned (not pay)', money(l.tipsEarned)],
    ],
    footer: unverified.value
      ? 'PROVISIONAL — tax and pension rates have not been confirmed. Tips are money owed to you by guests; they are not wages and are not taxed here.'
      : 'Tips are money owed to you by guests; they are not wages and are not taxed here.',
  })
  if (!ok) toast('Allow pop-ups for this site to print', 'error')
}

/** The whole run on one sheet, for the file and for the accountant. */
function printRegister() {
  const period = result.value ? `${result.value.period.start} to ${result.value.period.end}` : ''
  const ok = printReport({
    title: 'Payroll register',
    subtitle: period + (unverified.value ? ' — PROVISIONAL' : ''),
    summary: [
      ['Staff', result.value.staffCount],
      ['Gross', money(result.value.totals.gross)],
      ['Income tax', money(result.value.totals.tax)],
      ['Pension (employee)', money(result.value.totals.pension)],
      ['Net payable', money(result.value.totals.net)],
    ],
    headers: ['Staff', 'Base', 'Overtime', 'Gross', 'Tax', 'Pension', 'Net', 'Tips (not pay)'],
    rows: result.value.lines.map(l => [
      l.staffName, money(l.baseSalary), money(l.overtimePay), money(l.grossPay),
      money(l.incomeTax), money(l.pensionEmployee), money(l.netPay), money(l.tipsEarned),
    ]),
    footer: 'Tips are staff money and are not included in gross, tax or net.',
  })
  if (!ok) toast('Allow pop-ups for this site to print', 'error')
}

async function openRun(r) {
  try {
    const res = await apiGet(`payroll?run_id=${encodeURIComponent(r.id)}`)
    // Re-shaped into what the table above renders, so a stored run and a fresh
    // one display identically rather than needing two templates.
    result.value = {
      staffCount: (res.lines || []).length,
      period: { start: res.run.period_start, end: res.run.period_end },
      totals: {
        gross: res.run.gross_total, tax: res.run.tax_total,
        pension: res.run.pension_total, net: res.run.net_total,
      },
      lines: (res.lines || []).map(l => ({
        staffId: l.staff_id, staffName: l.staff_name,
        baseSalary: l.base_salary, overtimePay: l.overtime_pay,
        bonuses: l.bonuses, deductions: l.deductions,
        grossPay: l.gross_pay, incomeTax: l.income_tax,
        pensionEmployee: l.pension_employee, netPay: l.net_pay,
        tipsEarned: l.tips_earned, daysWorked: l.days_worked, daysAbsent: l.days_absent,
      })),
    }
  } catch (e) {
    toast(e.message || 'Could not open that run', 'error')
  }
}
</script>

<style scoped>
.summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px; }
.stat { padding: 12px; text-align: center; }
.stat-num { font-size: 1.3rem; font-weight: 700; }
.stat-lbl { font-size: .72rem; color: var(--text-muted); }
.mini-table { width: 100%; font-size: .8rem; }
.mini-table th, .mini-table td { padding: 6px 8px; text-align: left; vertical-align: top; }
.empty { text-align: center; padding: 32px; color: var(--text-muted); }
.link-btn { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; }
</style>
