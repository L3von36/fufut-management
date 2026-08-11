import { describe, it, expect, vi, beforeEach } from 'vitest'
import { esc, line, row, table, kitchenTicket, printReport } from '../../src/lib/print.js'

describe('print escaping', () => {
  /**
   * Order notes, customer names and expense descriptions are free text typed by
   * staff and guests, and the document is written into a window. Interpolating
   * them raw is a straightforward injection.
   */
  it('escapes the characters that would break out of the document', () => {
    expect(esc('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    )
    expect(esc('Mr "Big" O\'Brien & Co')).toBe('Mr &quot;Big&quot; O&#39;Brien &amp; Co')
  })

  it('renders null and undefined as empty rather than as the words', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
    expect(esc(0)).toBe('0')
  })

  it('escapes through the row and line helpers, not just esc', () => {
    // The helpers exist so a caller cannot forget; this asserts they honour it.
    expect(line('Note', '<b>x</b>')).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(row(['<img>', 'ok'])).toContain('&lt;img&gt;')
    expect(table(['<th>'], [['<td>']])).toContain('&lt;th&gt;')
  })
})

describe('printing', () => {
  let written
  let opened

  beforeEach(() => {
    written = ''
    opened = true
    vi.stubGlobal('open', vi.fn(() => (opened ? {
      document: {
        write: (html) => { written += html },
        close: vi.fn(),
        readyState: 'complete',
      },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    } : null)))
  })

  /**
   * A blocked pop-up is the most likely failure and it is completely silent.
   * Returning false lets the caller say so instead of appearing to print.
   */
  it('reports a blocked pop-up rather than failing silently', () => {
    opened = false
    expect(printReport({ title: 'x', headers: ['a'], rows: [['b']] })).toBe(false)
  })

  it('returns true when the window opened', () => {
    expect(printReport({ title: 'Reorder list', headers: ['Item'], rows: [['Coffee']] })).toBe(true)
    expect(written).toContain('Reorder list')
    expect(written).toContain('Coffee')
  })

  it('prints an A4 report and an 80mm ticket differently', () => {
    printReport({ title: 'Report', headers: ['a'], rows: [['b']] })
    expect(written).toContain('A4')

    written = ''
    kitchenTicket({ id: 'O1234', type: 'takeaway' }, [])
    expect(written).toContain('80mm')
  })
})

describe('kitchen ticket', () => {
  let written
  beforeEach(() => {
    written = ''
    vi.stubGlobal('open', vi.fn(() => ({
      document: { write: (h) => { written += h }, close: vi.fn(), readyState: 'complete' },
      focus: vi.fn(), print: vi.fn(), close: vi.fn(),
    })))
  })

  /**
   * §4: the kitchen must tell dine-in from takeaway from delivery at a glance.
   * A takeaway plated on china is a remake.
   */
  it('shouts the order type', () => {
    kitchenTicket({ id: 'O1234', type: 'takeaway' }, [])
    expect(written).toContain('TAKEAWAY')
    expect(written).toContain('badge-type')
  })

  it('shows the table for a dine-in order', () => {
    kitchenTicket({ id: 'O1234', type: 'dine-in', tableNum: '5' }, [])
    expect(written).toContain('Table 5')
  })

  it('lists the tracked lines with their modifiers', () => {
    kitchenTicket({ id: 'O1', type: 'dine-in' }, [
      { qty: 2, name: 'Macchiato', modifiers: '[{"name":"Large"}]' },
    ])
    expect(written).toContain('2 × Macchiato')
    expect(written).toContain('Large')
  })

  it('falls back to the summary string for an order with no tracked lines', () => {
    // Orders predating per-item tracking must still print something usable.
    kitchenTicket({ id: 'O1', type: 'dine-in', items: '1xTea, 1xBread' }, [])
    expect(written).toContain('1xTea, 1xBread')
  })

  /**
   * Allergies and prep instructions. Last and largest on the ticket, because it
   * is the line that must not be missed.
   */
  it('prints order notes prominently', () => {
    kitchenTicket({ id: 'O1', type: 'dine-in', notes: 'no dairy - allergy' }, [])
    expect(written).toContain('no dairy - allergy')
    expect(written).toContain('**')
  })

  it('escapes a malicious customer name', () => {
    kitchenTicket({ id: 'O1', type: 'delivery', customer: '<script>x</script>' }, [])
    expect(written).not.toContain('<script>x')
    expect(written).toContain('&lt;script&gt;')
  })
})
