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

      <base-table
        :columns="settingColumns"
        :rows="editableSettings"
        row-id="key"
        caption="Payroll rates and tax bands"
        empty-title="No configurable rates found"
      >
        <template #cell-label="{ row: s }">
          <strong>{{ s.label || settingFriendlyName(s.key) }}</strong>
          <div v-if="s.description && s.description !== s.label" style="font-size:.7rem;color:var(--text-muted)">{{ s.description }}</div>
        </template>
        <template #cell-value="{ row: s }">
          <div v-if="!editing[s.key]">
            <span style="font-size:.8rem">{{ formatSettingPreview(draft[s.key], s.key) || draft[s.key] || '—' }}</span>
            <button v-if="isJson(s.value)" class="link-btn" style="margin-left:6px;font-size:.7rem" @click="editing[s.key] = true">edit raw</button>
          </div>
          <template v-else>
            <textarea v-model="draft[s.key]" rows="3" class="input input-sm" style="width:100%;font-family:var(--font-mono);font-size:.7rem;resize:vertical" />
            <div style="margin-top:4px;display:flex;gap:6px;align-items:center">
              <span class="setting-preview">{{ formatSettingPreview(draft[s.key], s.key) }}</span>
              <button class="link-btn" style="font-size:.7rem" @click="editing[s.key] = false">done</button>
            </div>
          </template>
        </template>
        <template #cell-actions="{ row: s }">
          <button class="btn btn-sm btn-primary" :disabled="draft[s.key] === s.value" @click="saveSetting(s)">Save</button>
        </template>
      </base-table>

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
        <base-table
          :columns="payslipColumns"
          :rows="result.lines"
          row-id="staffId"
          sticky-first
          stack-on-mobile
          caption="Payslips for the period"
          empty-title="No payslips in this run"
        >
          <template #cell-staffName="{ row: l }"><strong>{{ l.staffName }}</strong></template>
          <template #cell-baseSalary="{ row: l }">{{ money(l.baseSalary) }}</template>
          <template #cell-overtimePay="{ row: l }">{{ l.overtimePay ? money(l.overtimePay) : '—' }}</template>
          <template #cell-bonuses="{ row: l }">{{ l.bonuses ? money(l.bonuses) : '—' }}</template>
          <template #cell-deductions="{ row: l }">{{ l.deductions ? '−' + money(l.deductions) : '—' }}</template>
          <template #cell-grossPay="{ row: l }">{{ money(l.grossPay) }}</template>
          <template #cell-incomeTax="{ row: l }">{{ money(l.incomeTax) }}</template>
          <template #cell-pensionEmployee="{ row: l }">{{ money(l.pensionEmployee) }}</template>
          <template #cell-netPay="{ row: l }"><strong>{{ money(l.netPay) }}</strong></template>
          <!--
            Shown, never added. A tip is the guest's money given to a person: it
            is not payroll, is not taxed here, and is in none of the totals to
            the left.
          -->
          <template #cell-tipsEarned="{ row: l }">
            <span v-if="l.tipsEarned" class="badge badge-neutral" title="Tips earned — not part of pay and not taxed here">{{ money(l.tipsEarned) }}</span>
            <span v-else style="color:var(--text-muted)">—</span>
          </template>
          <template #cell-daysWorked="{ row: l }">
            <span style="font-size:.75rem">{{ l.daysWorked }}<span v-if="l.daysAbsent" style="color:var(--danger)"> / {{ l.daysAbsent }} abs</span></span>
          </template>
          <template #cell-actions="{ row: l }">
            <button class="btn btn-sm btn-ghost" @click="printPayslip(l)" title="Print payslip">🖨</button>
          </template>
        </base-table>
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
      <base-table
        :columns="runColumns"
        :rows="runs"
        stack-on-mobile
        caption="Previous payroll runs"
        empty-title="No payroll has been run yet"
      >
        <template #cell-period="{ row: r }">{{ r.period_start }} → {{ r.period_end }}</template>
        <template #cell-status="{ row: r }">
          <span class="badge" :class="statusBadgeClass(r.status)">{{ statusLabel(r.status) }}</span>
        </template>
        <template #cell-gross_total="{ row: r }">{{ money(r.gross_total) }}</template>
        <template #cell-tax_total="{ row: r }">{{ money(r.tax_total) }}</template>
        <template #cell-net_total="{ row: r }"><strong>{{ money(r.net_total) }}</strong></template>
        <template #cell-provisional="{ row: r }">
          <span class="badge" :class="r.provisional ? 'badge-pending' : 'badge-success'">
            {{ r.provisional ? 'Provisional' : 'Confirmed rates' }}
          </span>
        </template>
        <template #cell-actions="{ row: r }">
          <button class="btn btn-sm btn-ghost" @click="openRun(r)">View</button>
        </template>
      </base-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { apiGet, apiPost, apiPut } from '../api'
import BaseButton from '../components/BaseButton.vue'
import BaseTable from '../components/BaseTable.vue'
import { statusBadgeClass, statusLabel } from '../composables/useStatusBadge'
import { titleCase, formatValue } from '../lib/formatters'
import { printReport } from '../lib/print'

const toast = inject('toast')

const settings = ref([])
const draft = ref({})
const editing = ref({})
const showRates = ref(false)
const result = ref(null)
const runs = ref([])

const settingColumns = [
  { key: 'label', label: 'Setting' },
  { key: 'value', label: 'Value' },
  { key: 'actions', label: '' },
]

const payslipColumns = [
  { key: 'staffName', label: 'Staff' },
  { key: 'baseSalary', label: 'Base' },
  { key: 'overtimePay', label: 'Overtime' },
  { key: 'bonuses', label: 'Bonuses' },
  { key: 'deductions', label: 'Deductions' },
  { key: 'grossPay', label: 'Gross' },
  { key: 'incomeTax', label: 'Tax' },
  { key: 'pensionEmployee', label: 'Pension' },
  { key: 'netPay', label: 'Net' },
  { key: 'tipsEarned', label: 'Tips' },
  { key: 'daysWorked', label: 'Days' },
  { key: 'actions', label: '' },
]

const runColumns = [
  { key: 'period', label: 'Period' },
  { key: 'status', label: 'Status' },
  { key: 'gross_total', label: 'Gross' },
  { key: 'tax_total', label: 'Tax' },
  { key: 'net_total', label: 'Net' },
  { key: 'provisional', label: 'Confirmed?' },
  { key: 'actions', label: '' },
]

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

/**
 * Render a JSON setting value as a short human-readable summary.
 * The raw JSON stays editable above; this is the "what does this mean?" line.
 */
function formatSettingPreview(raw, key) {
  if (!isJson(raw)) return ''
  let parsed
  try { parsed = JSON.parse(raw) } catch { return '' }
  const k = String(key || '')

  // Overtime multipliers: {"normal":1.5,"night":1.75,"rest_day":2}
  if (k.includes('overtime') && k.includes('multipli')) {
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed)
        .map(([label, val]) => `${titleCase(label)}: ${val}×`)
        .join(' · ')
    }
  }

  // Pension rates: {"employee":8.67,"employer":10.13}
  if (k.includes('pension') && k.includes('rate')) {
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed)
        .map(([who, pct]) => `${titleCase(who)}: ${pct}%`)
        .join(' · ')
    }
  }

  // Tax bands: [{"upTo":2000,"rate":0,"deduct":0}, …] — the stored key is
  // camelCase `upTo` (migration 025); `upto` is accepted only so an old or
  // hand-typed value still previews instead of silently showing nothing.
  if (k.includes('tax') && k.includes('band')) {
    if (Array.isArray(parsed)) {
      return parsed.map((b, i) => {
        const parts = []
        const upto = b.upTo != null ? b.upTo : b.upto
        if (upto != null) parts.push(`up to ${money(upto).replace('ETB ', '')}`)
        if (b.rate != null) parts.push(`${(b.rate * 100).toFixed(0)}%`)
        if (b.deduct != null) parts.push(`deduct ${money(b.deduct).replace('ETB ', '')}`)
        return parts.length ? `Band ${i + 1}: ${parts.join(', ')}` : `Band ${i + 1}`
      }).join(' | ')
    }
  }

  // Fallback for any other JSON
  return formatValue(parsed)
}
/** Turn a settings key like 'payroll.overtime_rate_multiplier' into a readable label. */
function settingFriendlyName(key) {
  if (!key) return ''
  // Remove common prefixes
  const k = String(key).replace(/^(payroll|tax)\./, '')
  return titleCase(k)
}

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
.link-btn { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; }
.setting-preview { font-size: .72rem; color: var(--text-muted); margin-top: 4px; line-height: 1.4; }
</style>
