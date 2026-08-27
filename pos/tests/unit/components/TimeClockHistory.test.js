import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * My recent shifts on the Time Clock screen.
 *
 * A role without the roster grant (a waiter) used to see the state card and
 * the two buttons and nothing else — the one person whose hours they could
 * never see was themselves. The history card reads the self-service
 * `/timeclock/me/history` route and must survive three failure modes:
 * the roster read refused (403 is the waiter's normal), the history read
 * refused or slow, and both at once. It must also never render the roster
 * table for a role that cannot have it.
 */

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
}))

const mockRouter = { push: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => ({ roleKey: 'head-waiter', hasPermission: () => false }),
}))

import TimeClockView from '../../../src/views/TimeClockView.vue'

const HISTORY = [
  { id: 'TC1', staffId: 'S1', date: '2026-08-27', clockIn: '08:20', clockOut: '12:04', hours: 3.7, status: 'completed' },
  { id: 'TC2', staffId: 'S1', date: '2026-08-26', clockIn: '09:00', clockOut: null, hours: 0, status: 'active' },
]

const refused = (status = 403) => {
  const e = new Error('Your role does not have access to this data')
  e.status = status
  e.httpError = true
  return Promise.reject(e)
}

const toastFn = vi.fn()

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(TimeClockView, {
    global: {
      plugins: [pinia],
      provide: { toast: toastFn },
    },
  })
  await flushPromises()
  return wrapper
}

describe('TimeClockView — my recent shifts', () => {
  beforeEach(() => {
    mockApiGet.mockReset()
    mockApiPost.mockReset()
  })

  it("shows the waiter their own shifts and never the roster", async () => {
    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint === 'timeclock') return refused() // the waiter's normal
      if (endpoint === 'staff') return refused()
      if (endpoint === 'timeclock/me') return Promise.resolve({ clockedIn: false, entry: null })
      if (endpoint === 'timeclock/me/history') return Promise.resolve({ ok: true, entries: HISTORY })
      return Promise.resolve([])
    })

    const wrapper = await mountView()

    // Own history: dates, times, durations — newest first.
    const history = wrapper.find('.tc-history')
    expect(history.exists()).toBe(true)
    expect(history.text()).toContain('2026-08-27')
    expect(history.text()).toContain('08:20 → 12:04')
    expect(history.text()).toContain('3h 44m')
    // The open shift is marked Active rather than left ambiguous.
    expect(history.text()).toContain('Active')
    expect(history.text()).toContain('Completed')

    // The roster is a permission the waiter does not hold.
    expect(wrapper.find('.table-wrap').exists()).toBe(false)
    expect(mockApiGet).toHaveBeenCalledWith('timeclock/me/history')
  })

  it('keeps the state card working when the history read fails', async () => {
    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint === 'timeclock/me') return Promise.resolve({ clockedIn: true, entry: { clock_in: '08:20' } })
      if (endpoint === 'timeclock/me/history') return refused(500)
      return refused()
    })

    const wrapper = await mountView()

    expect(wrapper.find('.tc-me').text()).toContain('On shift')
    expect(wrapper.find('.tc-history-empty').text()).toContain('No shifts recorded yet')
    // The clock buttons must still be there and usable.
    expect(wrapper.find('.tc-me .btn').text()).toContain('Clock Out')
  })

  it('shows the empty state on a fresh account', async () => {
    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint === 'timeclock/me') return Promise.resolve({ clockedIn: false, entry: null })
      if (endpoint === 'timeclock/me/history') return Promise.resolve({ ok: true, entries: [] })
      return refused()
    })

    const wrapper = await mountView()

    expect(wrapper.find('.tc-history-empty').exists()).toBe(true)
    expect(wrapper.find('.tc-history-list').exists()).toBe(false)
  })

  it('refreshes the history after a clock-out', async () => {
    mockApiGet.mockImplementation((endpoint) => {
      if (endpoint === 'timeclock/me') return Promise.resolve({ clockedIn: true, entry: { clock_in: '08:20' } })
      if (endpoint === 'timeclock/me/history') return Promise.resolve({ ok: true, entries: HISTORY })
      return refused()
    })
    mockApiPost.mockResolvedValue({ ok: true })

    const wrapper = await mountView()
    const historyCallsBefore = mockApiGet.mock.calls.filter((c) => c[0] === 'timeclock/me/history').length

    await wrapper.find('.tc-me .btn').trigger('click')
    await flushPromises()

    const historyCallsAfter = mockApiGet.mock.calls.filter((c) => c[0] === 'timeclock/me/history').length
    expect(historyCallsAfter).toBeGreaterThan(historyCallsBefore)
  })
})
