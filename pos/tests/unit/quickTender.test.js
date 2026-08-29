import { describe, it, expect } from 'vitest'
import { quickTenderAmounts } from '../../src/lib/quickTender'

/**
 * Quick tender must be quicker than the number pad.
 *
 * The buttons exist to settle cash without typing, so every one of them has to
 * be an amount a guest might actually hand over: at or above the bill. The
 * previous padding logic filled short lists with 10 and 50 ETB, which on a 704
 * bill rendered as 500 · 1000 · 10 · 50 — one insufficient note and two
 * useless ones, unsorted. These tests pin the behaviour that replaces it.
 */
describe('quickTenderAmounts', () => {
  it('offers round-ups that cover the bill, ascending — the 704 regression', () => {
    // Old code answered [500, 1000, 10, 50] here.
    expect(quickTenderAmounts(704)).toEqual([710, 750, 800, 1000])
  })

  it('never offers an amount at or below the bill, for any total 1–1200', () => {
    for (let t = 1; t <= 1200; t++) {
      const amounts = quickTenderAmounts(t)
      expect(amounts.length, `total ${t}`).toBeGreaterThan(0)
      expect(amounts.length, `total ${t}`).toBeLessThanOrEqual(4)
      for (const a of amounts) {
        expect(a, `total ${t}`).toBeGreaterThan(t)
      }
      for (let i = 1; i < amounts.length; i++) {
        expect(amounts[i], `total ${t}`).toBeGreaterThan(amounts[i - 1])
      }
    }
  })

  it('answers something useful when the bill is exactly the largest note', () => {
    // 1000 exactly: no note covers it, so the row offers bill-plus-one-note.
    expect(quickTenderAmounts(1000)).toEqual([1050, 1100, 1200, 1500])
    // And above it — a 2400 party bill.
    expect(quickTenderAmounts(2400)).toEqual([2450, 2500, 2600, 2900])
  })

  it('sorts and deduplicates when round-ups coincide with notes', () => {
    // 45: round-ups and notes collapse into 50, 100, 200, 500.
    expect(quickTenderAmounts(45)).toEqual([50, 100, 200, 500])
  })

  it('rounds fractional bills up to whole birr first', () => {
    expect(quickTenderAmounts(703.5)).toEqual(quickTenderAmounts(704))
  })

  it('answers nothing for an empty cart', () => {
    expect(quickTenderAmounts(0)).toEqual([])
    expect(quickTenderAmounts(NaN)).toEqual([])
    expect(quickTenderAmounts(undefined)).toEqual([])
    expect(quickTenderAmounts(-5)).toEqual([])
  })
})
