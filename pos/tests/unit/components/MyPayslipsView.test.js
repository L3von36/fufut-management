import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * My Payslips — the self-service half of payroll.
 *
 * The screen reads /api/payroll/me, which the server scopes to the session
 * holder and to nobody else. What is worth pinning here is what the person
 * actually sees: their current base salary (or the honest absence of one),
 * their payslip lines with net pay standing out, the provisional banner when
 * a run was computed before the rates were confirmed, the two standing notes
 * (tips are reported, not paid; you see only your own), and an empty state
 * that says something true when payroll has never been run.
 */

const mockApiGet = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => ({ roleKey: 'cashier', hasPermission: () => true }),
}))

import MyPayslipsView from '../../../src/views/MyPayslipsView.vue'

const PAYSLIPS = [
  {
    id: 'PL1', run_id: 'RUN2', base_salary: 4200, overtime_pay: 315, bonuses: 0,
    deductions: 0, income_tax: 333.15, pension_employee: 294, net_pay: 3887.85,
    tips_earned: 120, period_start: '2026-08-01', period_end: '2026-08-30',
    run_status: 'finalised', provisional: 0, breakdown: null,
  },
  {
    id: 'PL2', run_id: 'RUN1', base_salary: 4200, overtime_pay: 0, bonuses: 0,
    deductions: 50, income_tax: 333.15, pension_employee: 294, net_pay: 3522.85,
    tips_earned: 0, period_start: '2026-07-01', period_end: '2026-07-30',
    run_status: 'paid', provisional: 1, breakdown: null,
  },
]

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(MyPayslipsView, {
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

describe('MyPayslipsView', () => {
  // Braces on purpose: an arrow-body mockReset() hands vitest the mock's
  // return value as a hook result, and a rejection configured afterwards
  // then surfaces as a bogus test failure.
  beforeEach(() => { mockApiGet.mockReset() })

  it('reads the self-service endpoint and renders each payslip line', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      payslips: PAYSLIPS,
      current: { baseSalary: 4200, salaryPeriod: 'monthly', employmentType: 'full-time' },
    })
    const wrapper = await mountView()

    expect(mockApiGet).toHaveBeenCalledWith('/payroll/me')
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    // Net pay stands out in its own column, formatted as ETB.
    expect(wrapper.text()).toContain('ETB 3,887.85')
    expect(wrapper.text()).toContain('ETB 3,522.85')
    // The period reads as a range.
    expect(wrapper.text()).toContain('2026-08-01 → 2026-08-30')
  })

  it('shows the caller’s current base salary and employment type', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      payslips: PAYSLIPS,
      current: { baseSalary: 4200, salaryPeriod: 'monthly', employmentType: 'full-time' },
    })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('ETB 4,200.00')
    expect(wrapper.text()).toContain('Monthly')
    expect(wrapper.text()).toContain('Full Time')
  })

  it('says so plainly when no salary has been recorded', async () => {
    mockApiGet.mockResolvedValue({ ok: true, payslips: [], current: null })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('has not recorded a base salary')
    expect(wrapper.text()).toContain('No payslips yet')
  })

  it('raises the provisional banner when any run was computed before rates were confirmed', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      payslips: PAYSLIPS,
      current: { baseSalary: 4200, salaryPeriod: 'monthly', employmentType: null },
    })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('provisional')
  })

  it('keeps the banner down when every run used confirmed rates', async () => {
    mockApiGet.mockResolvedValue({
      ok: true,
      payslips: PAYSLIPS.map((p) => ({ ...p, provisional: 0 })),
      current: { baseSalary: 4200, salaryPeriod: 'monthly', employmentType: null },
    })
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('Treat the figures as provisional')
  })

  it('carries the two standing notes: tips are not pay, and this list is yours only', async () => {
    mockApiGet.mockResolvedValue({ ok: true, payslips: PAYSLIPS, current: null })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Tips are reported, not paid by the café')
    expect(wrapper.text()).toContain('You are seeing your own payslips only')
  })

  it('survives a refused or failed read without throwing', async () => {
    mockApiGet.mockRejectedValue(new Error('Authentication required'))
    const wrapper = await mountView()
    // The empty state renders; the last good data (none) stays on screen.
    expect(wrapper.text()).toContain('No payslips yet')
  })
})
