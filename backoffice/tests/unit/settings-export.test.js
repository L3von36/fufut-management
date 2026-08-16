import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
vi.mock('../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  API: '',
  isOnline: () => true,
  onOnlineChange: () => () => {},
  TODAY: () => '2026-08-10',
}))

vi.mock('../../src/stores/auth', () => ({
  useAuthStore: () => ({
    user: { firstName: 'Amanuel', lastName: 'T', role: 'Manager', id: 'S1' },
  }),
}))

import SettingsView from '../../src/views/SettingsView.vue'

const toastSpy = vi.fn()
const globalConfig = { global: { provide: { toast: toastSpy, confirm: vi.fn() } } }

/** Capture what the browser was asked to download. */
let lastDownload = null
beforeEach(() => {
  vi.clearAllMocks()
  lastDownload = null
  global.fetch = vi.fn(() => Promise.resolve({ ok: true }))
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = Object.assign(document.createElementNS('http://www.w3.org/1999/xhtml', tag), {})
    if (tag === 'a') {
      el.click = vi.fn(() => { lastDownload = { href: el.href, name: el.download } })
    }
    return el
  })
})

const ORDERS = [
  { id: 'O1', items: '1xMacchiato, 1xTea', total: 280, tip: 30 },
  { id: 'O2', items: '2xCoffee', total: 120 },
]

async function open() {
  const w = mount(SettingsView, globalConfig)
  await flushPromises()
  return w
}

describe('SettingsView exports', () => {
  /**
   * These buttons POSTed to `/api/export/csv`, an endpoint that has never
   * existed. Every export failed, and because the failure was caught and
   * toasted generically it read as a transient glitch rather than a missing
   * feature — the same shape of bug as the audit log calling a 404.
   */
  it('does not call the endpoint that never existed', async () => {
    mockApiGet.mockResolvedValue(ORDERS)
    const w = await open()
    await w.findAll('button').find((b) => /export orders/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiPost).not.toHaveBeenCalledWith('export/csv', expect.anything())
    for (const call of mockApiPost.mock.calls) {
      expect(call[0]).not.toContain('export')
    }
  })

  it('reads the resource endpoint that already exists and downloads a file', async () => {
    mockApiGet.mockResolvedValue(ORDERS)
    const w = await open()
    await w.findAll('button').find((b) => /export orders/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiGet).toHaveBeenCalledWith('orders')
    expect(lastDownload).not.toBeNull()
    expect(lastDownload.name).toBe('orders-2026-08-10.csv')
  })

  it('says so rather than downloading an empty file', async () => {
    mockApiGet.mockResolvedValue([])
    const w = await open()
    await w.findAll('button').find((b) => /export orders/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(lastDownload).toBeNull()
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/no orders/i), 'error')
  })

  it('offers the accountant pack over the §51 period', async () => {
    mockApiGet.mockResolvedValue({
      sales: ORDERS, payments: [], expenses: [], supplierPurchases: [],
      supplierBalances: [], tips: [{ id: 'TP1', amount: 30 }], attendance: [],
      overtime: [], leave: [], payroll: [],
      notes: ['Order totals include tips.'],
    })
    const w = await open()
    await w.findAll('button').find((b) => /csv bundle/i.test(b.text())).trigger('click')
    await flushPromises()

    expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('reports/accountant'))
    expect(lastDownload.name).toMatch(/^fufut-accountant-/)
  })

  it('warns on screen that tips are not sales', async () => {
    mockApiGet.mockResolvedValue(ORDERS)
    const w = await open()
    expect(w.text()).toMatch(/tips are listed separately/i)
  })
})
