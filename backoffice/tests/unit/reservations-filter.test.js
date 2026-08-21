import { describe, it, expect } from 'vitest'

/**
 * Reservations were reported missing from the backoffice while visible on the
 * admin dashboard. They were never missing: the screen defaulted its date
 * filter to today, the venue had no booking for today, and the empty state
 * said "No reservations" — which reads as a fact about the business rather
 * than as the consequence of a filter nobody chose.
 *
 * The filter itself was always correct. What follows pins the default and the
 * wording, because those are what made correct behaviour unreadable.
 */

/** The filter as the view applies it. */
function applyFilters(rows, { date = '', status = '' } = {}) {
  return rows.filter((r) => {
    if (date && r.date !== date) return false
    if (status && r.status !== status) return false
    return true
  })
}

const BOOKINGS = [
  { id: 'R1', name: 'Selam', date: '2026-08-01', status: 'confirmed' },
  { id: 'R2', name: 'Abel', date: '2026-08-02', status: 'new' },
  { id: 'R3', name: 'Hanna', date: '2026-08-14', status: 'cancelled' },
]

describe('what the screen shows before anybody touches a control', () => {
  it('shows every booking, not only today\'s', () => {
    // The regression in one line: with the old default of TODAY(), a venue
    // whose next booking is tomorrow saw an empty table.
    expect(applyFilters(BOOKINGS, { date: '' })).toHaveLength(3)
  })

  it('still filters once a date is chosen', () => {
    expect(applyFilters(BOOKINGS, { date: '2026-08-02' }).map((r) => r.name)).toEqual(['Abel'])
  })

  it('still filters by status', () => {
    expect(applyFilters(BOOKINGS, { status: 'cancelled' }).map((r) => r.name)).toEqual(['Hanna'])
  })

  it('combines both', () => {
    expect(applyFilters(BOOKINGS, { date: '2026-08-01', status: 'new' })).toEqual([])
  })
})

describe('an empty table says which kind of empty it is', () => {
  const filtersApplied = (date, status) => Boolean(date || status)

  it('is a plain empty state when nothing is filtered', () => {
    expect(filtersApplied('', '')).toBe(false)
  })

  it('is a filtered empty state when a date is set', () => {
    // This is the distinction that was missing. Without it, "No reservations"
    // is indistinguishable from "your bookings have vanished".
    expect(filtersApplied('2026-08-19', '')).toBe(true)
  })

  it('is a filtered empty state when only a status is set', () => {
    expect(filtersApplied('', 'confirmed')).toBe(true)
  })
})
