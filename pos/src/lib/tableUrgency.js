/**
 * Floor-plan urgency for a seated table.
 *
 * The venue's rule: a sitting lasts at most four hours. The server enforces it
 * — fufut-api's cron releases any table held longer, to cleaning when a check
 * is still open (DEFAULT_TABLE_MAX_HOURS in src/lib/staleness.js). This module
 * is the POS's copy of the same clock, so the floor plan can show what is
 * about to happen instead of the table silently disappearing underneath it.
 *
 * Keep the two constants in step: this one explains, that one acts.
 */
export const MAX_TABLE_HOURS = 4

/**
 * Bucket a table's seated time so the card can colour it.
 *
 * 'fresh'   — under 45 minutes, an ordinary sitting
 * 'warm'    — under 90, ready to pay or has been forgotten
 * 'late'    — past 90 minutes, somebody should look at it
 * 'overdue' — past the maximum; the sweep releases the table within the minute
 *
 * A table with no readable seated_at is 'none': the server stamps those and
 * starts ageing them from when it noticed, so guessing an age here would
 * disagree with the sweep.
 */
export function occupancyUrgency(table, nowMs = Date.now()) {
  if (!table || !table.seated_at) return 'none'
  const seated = Date.parse(String(table.seated_at).trim())
  if (!Number.isFinite(seated)) return 'none'
  const mins = (nowMs - seated) / 60000
  if (mins < 0) return 'none'
  if (mins >= MAX_TABLE_HOURS * 60) return 'overdue'
  if (mins < 45) return 'fresh'
  if (mins < 90) return 'warm'
  return 'late'
}
