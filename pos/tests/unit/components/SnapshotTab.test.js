import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

let currentRole = 'manager'
vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    get roleKey() { return currentRole },
    isAuthenticated: true,
    hasPermission: () => true,
  })),
}))

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
vi.mock('../../../src/api', () => ({
  apiGet: (...a) => mockApiGet(...a),
  apiPost: (...a) => mockApiPost(...a),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  ROLE_PERMISSIONS: {},
  ROLE_DEFAULT_VIEW: {},
  NAV_ITEMS: [],
  TODAY: () => '2026-09-01',
}))

const printReportSpy = vi.fn(() => true)
vi.mock('../../../src/lib/print', () => ({ printReport: (...a) => printReportSpy(...a) }))

import StockControlView from '../../../src/views/StockControlView.vue'

const toastSpy = vi.fn()
const globalConfig = {
  global: { provide: { toast: toastSpy, confirm: vi.fn(() => Promise.resolve(true)) } },
}

const SNAPSHOT = {
  ok: true,
  date: '2026-09-01',
  items: [
    {
      inventoryId: 'I1', name: 'Coffee beans', unit: 'kg', category: 'Coffee & Tea',
      stockAtDate: 10, basis: 'ledger', stockNow: 7,
      day: { purchased: 10, sold: 2, wasted: 0, adjusted: 0 },
    },
    {
      inventoryId: 'I2', name: 'Milk', unit: 'l', category: 'Dairy',
      stockAtDate: 11, basis: 'estimate', stockNow: 8,
      day: { purchased: 0, sold: 0, wasted: 0, adjusted: 0 },
    },
  ],
  note: 'Stock at end of day comes from the ledger.',
}

describe('StockControlView — As Of tab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    toastSpy.mockReset()
    printReportSpy.mockReset()
    printReportSpy.mockReturnValue(true)
    mockApiGet.mockReset()
    mockApiPost.mockReset()
    mockApiGet.mockResolvedValue({ items: [], count: 0, estimatedTotal: 0, note: '' })
  })

  async function openSnapshotTab() {
    const w = mount(StockControlView, globalConfig)
    await flushPromises()
    const tabBtn = w.findAll('button.tab').find((b) => b.text().includes('As Of'))
    expect(tabBtn).toBeTruthy()
    await tabBtn.trigger('click')
    await flushPromises()
    return w
  }

  it('fetches the snapshot for the chosen day and renders both bases', async () => {
    mockApiGet.mockImplementation((path) =>
      String(path).startsWith('inventory/snapshot') ? Promise.resolve(SNAPSHOT) : Promise.resolve({ items: [] })
    )
    const w = await openSnapshotTab()

    expect(mockApiGet).toHaveBeenCalledWith('inventory/snapshot?date=2026-09-01')
    const text = w.text()
    expect(text).toContain('Coffee beans')
    expect(text).toContain('10 kg')          // recorded closing figure
    expect(text).toContain('recorded')
    expect(text).toContain('Milk')
    expect(text).toContain('11 l')           // worked backwards from today
    expect(text).toContain('estimated')
  })

  it('re-fetches when the manager picks another day and presses Show', async () => {
    mockApiGet.mockImplementation((path) =>
      String(path).startsWith('inventory/snapshot') ? Promise.resolve(SNAPSHOT) : Promise.resolve({ items: [] })
    )
    const w = await openSnapshotTab()

    // Three date inputs exist once the tab is open — the toolbar's from/to
    // window and the snapshot's own "As of". The snapshot's is the last.
    const dateInput = w.findAll('input[type="date"]').at(-1)
    await dateInput.setValue('2026-08-20')
    const showBtn = w.findAll('button').find((b) => b.text() === 'Show')
    await showBtn.trigger('click')
    await flushPromises()

    const snapshotCalls = mockApiGet.mock.calls.filter((c) => String(c[0]).startsWith('inventory/snapshot'))
    expect(snapshotCalls.some((c) => c[0] === 'inventory/snapshot?date=2026-08-20')).toBe(true)
  })

  it('prints the day as its own document', async () => {
    mockApiGet.mockImplementation((path) =>
      String(path).startsWith('inventory/snapshot') ? Promise.resolve(SNAPSHOT) : Promise.resolve({ items: [] })
    )
    const w = await openSnapshotTab()

    const printBtn = w.find('.table-toolbar button[title="Print this view"]')
    expect(printBtn.exists()).toBe(true)
    await printBtn.trigger('click')

    expect(printReportSpy).toHaveBeenCalledTimes(1)
    const spec = printReportSpy.mock.calls[0][0]
    expect(spec.title).toBe('Stock as of 2026-09-01')
    expect(spec.headers).toEqual(
      ['Item', 'Stock at end of day', 'Basis', 'Stock now', 'Bought', 'Consumed', 'Wasted', 'Adjusted']
    )
    expect(spec.rows[0]).toEqual(['Coffee beans', '10 kg', 'recorded', '7 kg', 10, 2, 0, 0])
    expect(spec.rows[1]).toEqual(['Milk', '11 l', 'estimated', '8 l', 0, 0, 0, 0])
    expect(spec.footer).toBe('Stock at end of day comes from the ledger.')
  })
})
