import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
vi.mock('../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: (...a) => mockApiPut(...a),
  apiDelete: vi.fn(),
  API: '',
  isOnline: () => true,
  onOnlineChange: () => () => {},
  TODAY: () => '2026-08-10',
  ROLE_PERMISSIONS: {},
  ROLE_DEFAULT_VIEW: {},
  NAV_ITEMS: [],
}))

import AttendanceView from '../../src/views/AttendanceView.vue'
import StaffRequestsView from '../../src/views/StaffRequestsView.vue'
import PayrollView from '../../src/views/PayrollView.vue'

const toastSpy = vi.fn()
const globalConfig = {
  global: { provide: { toast: toastSpy, confirm: vi.fn(() => Promise.resolve(true)) } },
}

const STAFF = [
  { id: 'S1', firstName: 'Selam', lastName: 'Wondimu', role: 'Head Chef' },
  { id: 'S2', firstName: 'Yonas', lastName: 'Bekele', role: 'Head Waiter' },
]

// ── Attendance ───────────────────────────────────────────────────────────────

describe('AttendanceView', () => {
  const ATTENDANCE = {
    ok: true,
    summary: { present: 4, late: 2, absent: 1, 'on-leave': 1, totalHours: 63.5, totalLateMinutes: 43 },
    entries: [
      {
        id: 'TC1', date: '2026-08-10', staff_id: 'S1', staffName: 'Selam Wondimu', role: 'Head Chef',
        clock_in: '09:25', clock_out: '17:00', scheduled_start: '09:00', scheduled_end: '17:00',
        status: 'late', lateMinutes: 25, earlyLeaveMinutes: 0, hoursWorked: 7.58,
      },
      {
        id: 'TC2', date: '2026-08-10', staff_id: 'S2', staffName: 'Yonas Bekele',
        clock_in: '09:00', clock_out: '17:00', status: 'present',
        lateMinutes: 0, earlyLeaveMinutes: 0, hoursWorked: 8,
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((e) => {
      if (e.startsWith('attendance')) return Promise.resolve(ATTENDANCE)
      if (e.startsWith('settings')) {
        return Promise.resolve({ settings: [{ key: 'attendance.late_grace_minutes', value: '15' }] })
      }
      if (e === 'staff') return Promise.resolve(STAFF)
      return Promise.resolve([])
    })
    mockApiPost.mockResolvedValue({ ok: true, status: 'late', lateMinutes: 25 })
  })

  const open = async () => {
    const w = mount(AttendanceView, globalConfig)
    await flushPromises()
    return w
  }

  /**
   * Found in a browser, not here: the table was rendering empty while Vue
   * warned that `rows` had been given a Function.
   *
   * The view read `res.entries`, which is right for `{ok, entries:[…]}` but
   * silently wrong for a bare array — `[].entries` is Array.prototype.entries,
   * a function, so the assignment succeeded and the screen simply showed no
   * attendance. A restaurant reading that would conclude nobody clocked in.
   *
   * Both shapes are in use across these endpoints, so both are asserted.
   */
  it('renders rows when the endpoint returns a bare array', async () => {
    mockApiGet.mockImplementation((e) => {
      if (e.startsWith('attendance')) return Promise.resolve(ATTENDANCE.entries)
      if (e === 'staff') return Promise.resolve(STAFF)
      return Promise.resolve([])
    })
    const w = await open()
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('Selam Wondimu')
  })

  /**
   * The status text changed case when this view adopted the shared badge
   * mapping: it rendered the raw `late` and now renders `Late`, like every
   * other status chip in the app. A deliberate display change rather than a
   * regression, so the assertion is updated rather than the code reverted —
   * and asserted case-insensitively, because the classification is what
   * matters here and its capitalisation is a presentation decision that may
   * move again.
   */
  it('shows each day with its classification', async () => {
    const w = await open()
    expect(w.text()).toContain('Selam Wondimu')
    expect(w.text()).toMatch(/late/i)
    expect(w.text()).toContain('25m')
  })

  it('summarises the period', async () => {
    const w = await open()
    expect(w.text()).toContain('Present')
    expect(w.text()).toContain('Late Minutes')
    expect(w.text()).toContain('43')
  })

  /**
   * The grace period is policy held in settings. Hard-coding it in the label
   * would leave the explanation disagreeing with the rule the server applied
   * the moment somebody changed it.
   */
  it('states the grace period the server actually used', async () => {
    const w = await open()
    expect(w.text()).toContain('15-minute grace')
  })

  it('falls back to a sane grace figure if settings cannot be read', async () => {
    mockApiGet.mockImplementation((e) => {
      if (e.startsWith('settings')) return Promise.reject(new Error('403'))
      if (e.startsWith('attendance')) return Promise.resolve(ATTENDANCE)
      return Promise.resolve(STAFF)
    })
    const w = await open()
    expect(w.text()).toContain('10-minute grace')
  })

  /**
   * A day with no scheduled start cannot be late — there is nothing to be late
   * against — so it would sit as "present" forever regardless of arrival time.
   * Setting one re-runs the classification for that day.
   */
  it('flags a day with no schedule set', async () => {
    const w = await open()
    expect(w.text()).toContain('not set')
  })

  it('re-checks the day after a schedule is entered', async () => {
    const w = await open()
    await w.findAll('button').find((b) => b.text() === 'Schedule').trigger('click')
    await flushPromises()
    await w.findAll('button').find((b) => /re-check/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith(
      'attendance/TC1/classify',
      expect.objectContaining({ scheduledStart: '09:00', scheduledEnd: '17:00' })
    )
  })
})

// ── Leave / overtime / adjustments ───────────────────────────────────────────

describe('StaffRequestsView', () => {
  const LEAVE = [
    {
      id: 'LV1', staff_id: 'S1', staff_name: 'Selam Wondimu', type: 'annual',
      start_date: '2026-08-12', end_date: '2026-08-14', days: 3, paid: 1,
      reason: 'Family', status: 'pending',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((e) => {
      if (e.startsWith('leave')) return Promise.resolve(LEAVE)
      if (e.startsWith('overtime')) return Promise.resolve([])
      if (e.startsWith('adjustments')) return Promise.resolve([])
      if (e === 'staff') return Promise.resolve(STAFF)
      return Promise.resolve([])
    })
    mockApiPost.mockResolvedValue({ ok: true, status: 'approved' })
  })

  const open = async () => {
    const w = mount(StaffRequestsView, globalConfig)
    await flushPromises()
    return w
  }

  /**
   * The status chip changed case when this view adopted the shared badge
   * mapping — raw `pending` became `Pending`, like every other status in the
   * app. A display change, not a regression, so the visible assertion is
   * case-insensitive while the query-string one stays exact: the value sent to
   * the API is a protocol detail and must not drift.
   */
  it('opens on leave awaiting a decision', async () => {
    const w = await open()
    expect(w.text()).toContain('Selam Wondimu')
    expect(w.text()).toMatch(/pending/i)
    expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('status=pending'))
  })

  it('badges tabs that have something waiting', async () => {
    const w = await open()
    expect(w.find('.tab-badge').exists()).toBe(true)
  })

  it('approves against the right record', async () => {
    const w = await open()
    await w.findAll('button').find((b) => b.text() === 'Approve').trigger('click')
    await flushPromises()
    expect(mockApiPost).toHaveBeenCalledWith('leave/LV1/decide', { approve: true })
  })

  /**
   * The server refuses self-approval and explains why. The backoffice API
   * client used to throw the status line and lose that message entirely, so
   * this asserts the explanation reaches the person.
   */
  it('surfaces the server’s refusal to self-approve', async () => {
    mockApiPost.mockRejectedValue(new Error('You cannot approve your own leave request'))
    const w = await open()
    await w.findAll('button').find((b) => b.text() === 'Approve').trigger('click')
    await flushPromises()

    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringContaining('cannot approve your own'),
      'error'
    )
  })

  it('will not send a rejection without a reason', async () => {
    const w = await open()
    await w.findAll('button').find((b) => b.text() === 'Reject').trigger('click')
    await flushPromises()

    const confirm = w.findAll('button').find((b) => b.text() === 'Reject' && b.attributes('disabled') !== undefined)
    expect(confirm).toBeTruthy()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('states the self-approval rule on the screen, not only on the server', async () => {
    const w = await open()
    expect(w.text()).toMatch(/cannot approve your own/i)
  })

  it('refuses an adjustment with no reason', async () => {
    const w = await open()
    await w.findAll('button.tab').find((b) => /bonuses/i.test(b.text())).trigger('click')
    await flushPromises()
    await w.findAll('button').find((b) => b.text().includes('+ New')).trigger('click')
    await flushPromises()

    const selects = w.find('.modal').findAll('select')
    await selects[0].setValue('S1')
    await w.find('.modal').findAll('input')[0].setValue('500')
    await w.findAll('button').find((b) => b.text() === 'Submit').trigger('click')
    await flushPromises()

    expect(mockApiPost).not.toHaveBeenCalled()
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/reason/i), 'error')
  })

  it('tells the user the sign comes from the type, not from what they type', async () => {
    const w = await open()
    await w.findAll('button.tab').find((b) => /bonuses/i.test(b.text())).trigger('click')
    await flushPromises()
    await w.findAll('button').find((b) => b.text().includes('+ New')).trigger('click')
    await flushPromises()

    expect(w.find('.modal').text()).toMatch(/stored as negative automatically/i)
  })
})

// ── Payroll ──────────────────────────────────────────────────────────────────

describe('PayrollView', () => {
  const SETTINGS_UNVERIFIED = {
    settings: [
      { key: 'payroll._unverified', value: 'true', category: 'payroll', label: 'Rates not confirmed' },
      { key: 'payroll.monthly_hours', value: '208', category: 'payroll', label: 'Contracted hours' },
      { key: 'tax.income_bands', value: '[{"upTo":600,"rate":0,"deduct":0}]', category: 'tax', label: 'Income tax bands' },
    ],
  }

  const RUN = {
    ok: true,
    runId: 'PR1',
    period: { start: '2026-07-01', end: '2026-07-31' },
    staffCount: 1,
    totals: { gross: 8000, tax: 1295, pension: 560, net: 6145 },
    provisional: true,
    warning: 'Tax bands, pension and overtime rates have not been confirmed.',
    lines: [{
      staffId: 'S1', staffName: 'Selam Wondimu', baseSalary: 8000, overtimePay: 0,
      bonuses: 0, deductions: 0, grossPay: 8000, incomeTax: 1295,
      pensionEmployee: 560, netPay: 6145, tipsEarned: 2500, daysWorked: 22, daysAbsent: 0,
    }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((e) => {
      if (e === 'settings') return Promise.resolve(SETTINGS_UNVERIFIED)
      if (e.startsWith('payroll')) return Promise.resolve({ runs: [] })
      return Promise.resolve([])
    })
    mockApiPost.mockResolvedValue(RUN)
    mockApiPut.mockResolvedValue({ ok: true })
  })

  const open = async () => {
    const w = mount(PayrollView, globalConfig)
    await flushPromises()
    return w
  }

  /**
   * A payslip computed from rates nobody has confirmed must not look
   * authoritative, and the person who can fix that is the one reading this.
   */
  it('warns prominently while the rates are unconfirmed', async () => {
    const w = await open()
    expect(w.find('.alert-banner.warning').exists()).toBe(true)
    expect(w.text()).toMatch(/not been confirmed/i)
    expect(w.text()).toMatch(/provisional/i)
  })

  it('clears the warning once the rates are confirmed', async () => {
    mockApiGet.mockImplementation((e) => {
      if (e === 'settings') {
        return Promise.resolve({
          settings: [{ key: 'payroll._unverified', value: 'false', category: 'payroll' }],
        })
      }
      return Promise.resolve({ runs: [] })
    })
    const w = await open()
    expect(w.find('.alert-banner.success').exists()).toBe(true)
  })

  it('says that confirming changes no figure', async () => {
    const w = await open()
    await w.findAll('button').find((b) => /rates/i.test(b.text())).trigger('click')
    await flushPromises()
    expect(w.text()).toMatch(/does not change any figure/i)
  })


/**
 * The rates table is now the shared BaseTable, so `.mini-table` no longer
 * exists. Selecting on its caption instead — which is what the table is
 * *called*, not how it happens to be built, so this survives the next refactor
 * too. The assertions below are unchanged; only the handle moved.
 */
function tableByCaption(w, re) {
  const t = w.findAll('table').find((el) => re.test(el.find('caption').exists() ? el.find('caption').text() : ''))
  if (!t) throw new Error(`no table captioned ${re}`)
  return t
}

  it('keeps the confirmation flag out of the editable rates table', async () => {
    // It is a control, toggled by its own button — not a rate to be typed over.
    const w = await open()
    await w.findAll('button').find((b) => /rates/i.test(b.text())).trigger('click')
    await flushPromises()
    expect(tableByCaption(w, /rates/i).text()).not.toContain('_unverified')
  })

  /**
   * A malformed band table would be stored, silently parsed back to a default,
   * and payroll would quietly use the wrong rates.
   */
  it('refuses to save a band table that is not valid JSON', async () => {
    const w = await open()
    await w.findAll('button').find((b) => /rates/i.test(b.text())).trigger('click')
    await flushPromises()

    const rates = tableByCaption(w, /rates/i)
    const bandInput = rates.findAll('input').at(-1)
    await bandInput.setValue('[{broken')
    await rates.findAll('button').at(-1).trigger('click')
    await flushPromises()

    expect(mockApiPut).not.toHaveBeenCalled()
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/valid JSON/i), 'error')
  })

  it('runs payroll for the chosen period', async () => {
    const w = await open()
    await w.findAll('button').find((b) => /run payroll/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith(
      'payroll/run',
      expect.objectContaining({ periodStart: expect.any(String), periodEnd: expect.any(String) })
    )
    expect(w.text()).toContain('Selam Wondimu')
    expect(w.text()).toContain('6,145')
  })

  /**
   * The rule the payroll module exists to protect. A tip is the guest's money
   * given to a person: not wages, not taxed here, and in none of the totals.
   */
  it('shows tips beside the payslip without adding them to it', async () => {
    const w = await open()
    await w.findAll('button').find((b) => /run payroll/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(w.text()).toContain('2,500')          // the tips column
    expect(w.text()).toContain('6,145')          // net pay, unchanged by them
    expect(w.text()).toMatch(/not included in gross or net/i)
  })

  it('surfaces the provisional warning from a run as an error toast', async () => {
    const w = await open()
    await w.findAll('button').find((b) => /run payroll/i.test(b.text())).trigger('click')
    await flushPromises()
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/not been confirmed/i), 'error')
  })
})
