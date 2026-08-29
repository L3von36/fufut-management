import { describe, it, expect } from 'vitest'
import { isResumableCheck, latestResumableCheck } from '../../src/lib/openChecks'

// The resume filter that used to live inline in TablesView excluded status
// 'fulfilled' — the kitchen's whole-ticket "Served" word. The first check on
// a table stopped being resumable the moment the chef marked the food served,
// so the guest's next round opened a second ticket and the first leaked at
// the till. A check is open until it is PAID.
describe('isResumableCheck', () => {
  it('treats a served-but-unpaid order as an open check', () => {
    expect(isResumableCheck({ status: 'fulfilled', payment_status: 'unpaid' })).toBe(true)
    expect(isResumableCheck({ status: 'served' })).toBe(true)
  })

  it('closes a check only on cancellation, completion or payment', () => {
    expect(isResumableCheck({ status: 'cancelled', payment_status: 'unpaid' })).toBe(false)
    expect(isResumableCheck({ status: 'completed', payment_status: 'unpaid' })).toBe(false)
    expect(isResumableCheck({ status: 'fulfilled', payment_status: 'paid' })).toBe(false)
    expect(isResumableCheck({ status: 'new', payment_status: 'paid' })).toBe(false)
  })

  it('tolerates old rows with no payment status at all', () => {
    expect(isResumableCheck({ status: 'new' })).toBe(true)
    expect(isResumableCheck(null)).toBe(false)
  })
})

describe('latestResumableCheck', () => {
  const orders = [
    { id: 'O-1', status: 'new', table_number: '3' },
    { id: 'O-2', status: 'fulfilled', table_number: '3' },   // served, unpaid
    { id: 'O-3', status: 'fulfilled', table_number: '3', payment_status: 'paid' },
  ]

  it('resumes the latest check that has not been paid', () => {
    expect(latestResumableCheck(orders, 3).id).toBe('O-2')
  })

  it('picks by created timestamp, not array position', () => {
    // GET /orders returns newest first; "last element" would quietly pick the
    // oldest open check when a table somehow has two.
    const newestFirst = [
      { id: 'O-new', status: 'fulfilled', table_number: '5', created: '2026-08-25T10:00:00Z' },
      { id: 'O-old', status: 'fulfilled', table_number: '5', created: '2026-08-25T09:00:00Z' },
    ]
    expect(latestResumableCheck(newestFirst, 5).id).toBe('O-new')

    const oldestFirst = [...newestFirst].reverse()
    expect(latestResumableCheck(oldestFirst, 5).id).toBe('O-new')
  })

  it('matches table numbers spelled differently across eras of the data', () => {
    expect(latestResumableCheck(orders, '3').id).toBe('O-2')
    expect(latestResumableCheck([{ id: 'O-9', status: 'new', tableNum: 'T-03' }], 'T-03').id).toBe('O-9')
  })

  it('returns null when the table has nothing resumable', () => {
    expect(latestResumableCheck(orders, 7)).toBeNull()
    expect(latestResumableCheck([], 3)).toBeNull()
    expect(latestResumableCheck(null, 3)).toBeNull()
  })
})
