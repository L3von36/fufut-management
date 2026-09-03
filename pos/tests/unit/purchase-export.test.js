import { describe, it, expect } from 'vitest'
import { purchaseQuery, purchasesToCsv, purchaseExportName } from '../../src/lib/purchaseExport'
import { toCsv, csvCell } from '../../src/lib/csv'

/**
 * The purchases export: the manager's "what did we buy on day X / this month"
 * answer as a spreadsheet. The tests care about what actually breaks an
 * export in Excel: date bounds landing in the URL (or not, when empty), one
 * row per *item line* rather than one per purchase, supplier names with
 * commas surviving the quoting, and a purchase with no readable lines still
 * showing up instead of silently vanishing.
 */
describe('purchaseQuery', () => {
  it('sends the day bounds the server already understands', () => {
    expect(purchaseQuery({ from: '2026-08-20', to: '2026-08-21' })).toBe('?from=2026-08-20&to=2026-08-21')
    expect(purchaseQuery({ from: '2026-08-20' })).toBe('?from=2026-08-20')
    expect(purchaseQuery({ to: '2026-08-21' })).toBe('?to=2026-08-21')
  })

  it('keeps "all days" as the plain list', () => {
    expect(purchaseQuery({})).toBe('')
    expect(purchaseQuery({ from: '', to: '' })).toBe('')
  })
})

describe('purchaseExportName', () => {
  it('names the file after the range', () => {
    expect(purchaseExportName({ from: '2026-08-01', to: '2026-08-31' })).toBe('purchases-2026-08-01-to-2026-08-31.csv')
    expect(purchaseExportName({ from: '2026-08-01' })).toBe('purchases-from-2026-08-01.csv')
    expect(purchaseExportName({ to: '2026-08-31' })).toBe('purchases-to-2026-08-31.csv')
    expect(purchaseExportName({})).toBe('purchases-all.csv')
  })
})

describe('purchasesToCsv', () => {
  const P = (over = {}) => ({
    id: 'P1', date: '2026-08-20T00:00:00.000Z', supplier_name: 'Butcher, Merkato',
    total: 14000, paid: 5000, payment_method: 'telebirr',
    lines: [
      { item_name: 'Beef', qty: 20, unit: 'kg', unit_cost: 650, total_cost: 13000 },
      { item_name: 'Salt', qty: 2, unit: 'kg', unit_cost: 500, total_cost: 1000 },
    ],
    ...over,
  })

  it('emits one row per item line with the purchase summary riding along', () => {
    const csv = purchasesToCsv([P()])
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(3) // header + 2 item lines
    expect(lines[0]).toContain('Item')
    expect(lines[1]).toContain('Beef')
    expect(lines[1]).toContain('13000')
    expect(lines[2]).toContain('Salt')
    // Every row carries its purchase header so the sheet stands alone filtered.
    expect(lines[2]).toContain('Butcher, Merkato')
  })

  it('keeps a purchase with no readable lines visible, marked', () => {
    const csv = purchasesToCsv([P({ lines: [] })])
    expect(csv).toContain('(no lines recorded)')
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(2)
  })

  it('quotes commas and doubles embedded quotes the way Excel expects', () => {
    expect(csvCell('Beef, prime')).toBe('"Beef, prime"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
    expect(csvCell(12.5)).toBe('12.5')
  })

  it('lets a supplier name with a comma survive a round trip', () => {
    const csv = purchasesToCsv([P()])
    const row = csv.split('\r\n')[1]
    expect(row).toContain('"Butcher, Merkato"')
  })

  it('builds CRLF files through the shared csv helper', () => {
    const csv = toCsv(['a', 'b'], [[1, 2]])
    expect(csv).toBe('a,b\r\n1,2')
  })
})
