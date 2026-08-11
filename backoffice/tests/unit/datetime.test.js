import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  parseStamp, localDate, localTime, localDateTime,
  withinLocalRange, localDayStartUtc, localDayEndUtc,
} from '../../src/lib/datetime.js'

/**
 * Every case here is stated in Addis terms (UTC+3), because the bug only shows
 * itself in the three hours where the local date and the UTC date disagree.
 *
 * The tests set TZ explicitly rather than trusting the runner's zone — CI runs
 * UTC, this machine runs EAST, and a timezone test that passes only in one of
 * them is worse than none.
 */
const TZ = process.env.TZ
beforeAll(() => { process.env.TZ = 'Africa/Addis_Ababa' })
afterAll(() => { process.env.TZ = TZ })

/** Skips the suite rather than reporting false confidence if TZ did not apply. */
const zoneApplied = () => new Date('2026-08-11T00:30:00Z').getHours() === 3

describe('parsing stored stamps', () => {
  it('reads SQLite CURRENT_TIMESTAMP as UTC, not local', () => {
    // "2026-08-11 07:57:11" is UTC — verified against `date -u` in production.
    // Without the Z the browser would read it as local and shift it by three
    // hours in the wrong direction.
    const d = parseStamp('2026-08-11 07:57:11')
    expect(d.toISOString()).toBe('2026-08-11T07:57:11.000Z')
  })

  it('respects a stamp that already states its offset', () => {
    expect(parseStamp('2026-08-11T07:57:11Z').toISOString()).toBe('2026-08-11T07:57:11.000Z')
    expect(parseStamp('2026-08-11T10:57:11+03:00').toISOString()).toBe('2026-08-11T07:57:11.000Z')
  })

  it('returns null for nothing rather than an Invalid Date', () => {
    expect(parseStamp(null)).toBeNull()
    expect(parseStamp('')).toBeNull()
    expect(parseStamp('not a date')).toBeNull()
  })
})

describe('the 00:00–03:00 window, which is the whole bug', () => {
  it.runIf(zoneApplied())('files a 1am local sale under the local date', () => {
    // Stored 2026-08-10 22:30 UTC = 2026-08-11 01:30 in Addis.
    // .slice(0,10) gives "2026-08-10" — the previous business day.
    const stamp = '2026-08-10 22:30:00'
    expect(stamp.slice(0, 10)).toBe('2026-08-10')   // the old, wrong answer
    expect(localDate(stamp)).toBe('2026-08-11')     // the local business day
  })

  it.runIf(zoneApplied())('shows the kitchen the time on the wall', () => {
    // .slice(11,19) would show "22:30:00" for a sale rung up at half one.
    expect(localTime('2026-08-10 22:30:00', true)).toBe('01:30:00')
  })

  it.runIf(zoneApplied())('includes a post-midnight sale in that day’s range', () => {
    // A report for the 11th must contain the 01:30 sale on the 11th.
    expect(withinLocalRange('2026-08-10 22:30:00', '2026-08-11', '2026-08-11')).toBe(true)
    // …and must not contain the 23:00 sale from the 10th.
    expect(withinLocalRange('2026-08-10 20:00:00', '2026-08-11', '2026-08-11')).toBe(false)
  })
})

describe('date ranges', () => {
  it('is inclusive at both ends', () => {
    expect(withinLocalRange('2026-08-11 09:00:00', '2026-08-11', '2026-08-11')).toBe(true)
  })

  it('does not exclude a row that has no date', () => {
    // A date filter should narrow, not silently drop rows it cannot judge.
    expect(withinLocalRange(null, '2026-08-01', '2026-08-31')).toBe(true)
  })

  it('treats an open end as unbounded', () => {
    expect(withinLocalRange('2020-01-01 00:00:00', '', '2026-08-11')).toBe(true)
    expect(withinLocalRange('2030-01-01 00:00:00', '2026-08-11', '')).toBe(true)
  })
})

describe('local day boundaries as UTC instants', () => {
  /**
   * AuditLogView sent `${date}T00:00:00.000Z`, which is 03:00 local — so the
   * first three hours of every local day were missing from the log.
   */
  it.runIf(zoneApplied())('starts a local day three hours before UTC midnight', () => {
    expect(localDayStartUtc('2026-08-11')).toBe('2026-08-10T21:00:00.000Z')
  })

  it.runIf(zoneApplied())('ends it just before the next local midnight', () => {
    expect(localDayEndUtc('2026-08-11')).toBe('2026-08-11T20:59:59.999Z')
  })

  it.runIf(zoneApplied())('covers the whole local day and no more', () => {
    const start = localDayStartUtc('2026-08-11')
    const end = localDayEndUtc('2026-08-11')
    // The 01:30 local sale sits inside the window.
    expect('2026-08-10T22:30:00.000Z' >= start).toBe(true)
    expect('2026-08-10T22:30:00.000Z' <= end).toBe(true)
    // 23:00 local on the 10th does not.
    expect('2026-08-10T20:00:00.000Z' >= start).toBe(false)
  })
})

describe('formatting', () => {
  it.runIf(zoneApplied())('renders date and time together in local terms', () => {
    expect(localDateTime('2026-08-10 22:30:00')).toBe('2026-08-11 01:30:00')
  })

  it('renders nothing for a missing stamp rather than "Invalid Date"', () => {
    expect(localDate(null)).toBe('')
    expect(localTime(undefined)).toBe('')
    expect(localDateTime('')).toBe('')
  })
})
