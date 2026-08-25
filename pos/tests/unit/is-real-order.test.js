import { describe, it, expect } from 'vitest'
import { isRealOrder } from '../../src/lib/formatters'

/**
 * Revenue must not count orders that were never really sold.
 *
 * The API's reports exclude voided orders with `voided_at IS NULL AND
 * status <> 'cancelled'`; the POS sums orders client-side on the Dashboard and
 * Reports screens, which was counting them — a voided ETB 370 test order sat
 * in "Today Revenue" on launch day. isRealOrder is the front-end's copy of the
 * same rule.
 */
describe('isRealOrder', () => {
  it('accepts an ordinary order', () => {
    expect(isRealOrder({ status: 'new', total: 130 })).toBe(true)
    expect(isRealOrder({ status: 'served', total: 370 })).toBe(true)
    expect(isRealOrder({ status: 'paid', total: 90 })).toBe(true)
  })

  it('rejects a voided order by either marker', () => {
    // A void sets both; rows written before one column existed carry one.
    expect(isRealOrder({ status: 'cancelled', voided_at: '2026-08-25T00:00:00Z' })).toBe(false)
    expect(isRealOrder({ status: 'cancelled' })).toBe(false)
    expect(isRealOrder({ status: 'new', voided_at: '2026-08-25T00:00:00Z' })).toBe(false)
  })

  it('is case-insensitive about status spellings', () => {
    expect(isRealOrder({ status: 'Cancelled' })).toBe(false)
    expect(isRealOrder({ status: 'CANCELLED' })).toBe(false)
  })

  it('refuses nullish input rather than counting it', () => {
    expect(isRealOrder(null)).toBe(false)
    expect(isRealOrder(undefined)).toBe(false)
  })
})
