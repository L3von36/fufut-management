import { describe, it, expect } from 'vitest'
import { occupancyUrgency, MAX_TABLE_HOURS } from '../../src/lib/tableUrgency'

/**
 * The floor plan's copy of the four-hour rule.
 *
 * fufut-api's cron releases any table occupied past four hours — to cleaning
 * when a check is still open. This is the bucket the floor plan colours by, so
 * a waiter sees "this table is about to be taken back" instead of the card
 * silently changing under them. The two thresholds are one rule and must not
 * drift apart.
 */

const NOW = Date.parse('2026-08-25T12:00:00.000Z')
const H = 3600000

function seated(hoursAgo) {
  return { seated_at: new Date(NOW - hoursAgo * H).toISOString() }
}

describe('occupancyUrgency', () => {
  it('keeps the maximum in step with the server sweep (4h)', () => {
    expect(MAX_TABLE_HOURS).toBe(4)
  })

  it('calls an ordinary sitting fresh, and a long one late', () => {
    expect(occupancyUrgency(seated(0.2), NOW)).toBe('fresh')
    expect(occupancyUrgency(seated(1), NOW)).toBe('warm')
    expect(occupancyUrgency(seated(2), NOW)).toBe('late')
  })

  it('flags a table past the maximum as overdue', () => {
    expect(occupancyUrgency(seated(4), NOW)).toBe('overdue')
    expect(occupancyUrgency(seated(114), NOW)).toBe('overdue')
  })

  it('treats a table seconds short of the maximum as still late', () => {
    // 3h59m — the sweep has not touched it yet, so the badge must not either.
    expect(occupancyUrgency(seated(4 - 1 / 60), NOW)).toBe('late')
  })

  it('refuses to guess at a table with no readable seated_at', () => {
    expect(occupancyUrgency({}, NOW)).toBe('none')
    expect(occupancyUrgency({ seated_at: '' }, NOW)).toBe('none')
    expect(occupancyUrgency({ seated_at: 'not a date' }, NOW)).toBe('none')
    expect(occupancyUrgency(null, NOW)).toBe('none')
  })

  it('does not call a future seated_at overdue', () => {
    // A clock skew or a hand-edited stamp must not pulse the whole floor plan.
    expect(occupancyUrgency(seated(-1), NOW)).toBe('none')
  })
})
