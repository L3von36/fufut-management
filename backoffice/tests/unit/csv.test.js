import { describe, it, expect } from 'vitest'
import { toCsv, cell } from '../../src/lib/csv.js'

describe('CSV quoting', () => {
  /**
   * The failure this exists to prevent. `orders.items` is prose —
   * "1xMacchiato, 1xFut breakfast Gebeta" — and an unquoted comma inside it
   * splits one order across two columns and shifts every field after it. The
   * accountant's totals come out wrong and nothing looks broken.
   */
  it('quotes a value containing a comma', () => {
    const csv = toCsv([{ id: 'O1', items: '1xMacchiato, 1xFut breakfast Gebeta', total: 280 }])
    expect(csv).toContain('"1xMacchiato, 1xFut breakfast Gebeta"')
    // Header plus exactly one data row — not two.
    expect(csv.split('\r\n')).toHaveLength(2)
  })

  it('doubles embedded quotes rather than escaping them with a backslash', () => {
    // RFC 4180 — a backslash would be taken literally by a spreadsheet.
    expect(cell('He said "no dairy"')).toBe('"He said ""no dairy"""')
  })

  it('quotes values containing newlines', () => {
    const csv = toCsv([{ note: 'line one\nline two' }])
    expect(csv).toContain('"line one\nline two"')
  })

  it('renders null and undefined as empty, not as the strings', () => {
    // "null" in a currency column is worse than a blank: it reads as data.
    expect(cell(null)).toBe('')
    expect(cell(undefined)).toBe('')
    expect(toCsv([{ a: null, b: undefined, c: 0 }])).toBe('a,b,c\r\n,,0')
  })

  it('keeps a zero rather than blanking it', () => {
    // A zero total is a fact; treating it as empty loses it.
    expect(cell(0)).toBe('0')
    expect(cell(false)).toBe('false')
  })

  it('serialises an object cell as JSON', () => {
    expect(cell({ method: 'cash' })).toBe('"{""method"":""cash""}"')
  })

  /**
   * Rows written before a migration lack the newer columns. Taking headers from
   * row zero alone would drop `tip` and `discount` from the whole file whenever
   * the first row happened to be an old one.
   */
  it('takes the union of every row’s keys, not the first row’s', () => {
    const csv = toCsv([
      { id: 'O1', total: 100 },
      { id: 'O2', total: 200, tip: 20, discount: 5 },
    ])
    const [header] = csv.split('\r\n')
    expect(header).toBe('id,total,tip,discount')
    expect(csv.split('\r\n')[1]).toBe('O1,100,,')
  })

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('')
    expect(toCsv(null)).toBe('')
  })

  it('survives a null row without dropping the file', () => {
    expect(() => toCsv([{ a: 1 }, null])).not.toThrow()
  })

  it('uses CRLF, which is what spreadsheets expect', () => {
    expect(toCsv([{ a: 1 }, { a: 2 }])).toBe('a\r\n1\r\n2')
  })
})
