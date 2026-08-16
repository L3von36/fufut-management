/**
 * Local-time formatting for stamps stored in UTC.
 *
 * ── What is actually stored ────────────────────────────────────────────────
 *
 * `orders.created` and friends default to SQLite's CURRENT_TIMESTAMP, which is
 * **UTC**, and are written as `"2026-08-11 07:57:11"` — no `Z`, no offset.
 * Verified directly: CURRENT_TIMESTAMP came back equal to `date -u` to the
 * second, while the machine's local clock was three hours ahead.
 *
 * A comment in the POS asserts these stamps are local. It is wrong, and it is
 * wrong in the expensive direction: code written against it shifts every
 * comparison three hours the *opposite* way. The conclusion it reaches —
 * never build "today" with toISOString() — is still right, because a local
 * business day is what a restaurant is asking about.
 *
 * ── The bug this module fixes ──────────────────────────────────────────────
 *
 * `o.created.slice(0, 10)` takes the UTC date and compares it against a date
 * the manager picked from a local calendar. Addis is UTC+3, so every order
 * between 00:00 and 03:00 local carries the *previous* UTC date: a 1am sale on
 * the 11th files under the 10th, and a report for "today" silently loses the
 * end of last night's trade.
 *
 * `slice(11, 19)` has the same root and is more visible — it shows the kitchen
 * a time three hours behind the clock on the wall.
 */

/** Parse a stored stamp as UTC, whatever shape it arrives in. */
export function parseStamp(value) {
  if (!value) return null
  const s = String(value).trim()
  // Already explicit about its offset — trust it.
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  // "2026-08-11 07:57:11" — SQLite's CURRENT_TIMESTAMP, which is UTC. The `T`
  // and the `Z` are what stop the browser reading it as local time.
  const iso = s.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The local calendar date of a stored stamp, as YYYY-MM-DD.
 *
 * This is the replacement for `.slice(0, 10)`. Built from the local date parts
 * rather than toISOString(), which would put the UTC date back and reintroduce
 * exactly the bug.
 */
export function localDate(value) {
  const d = parseStamp(value)
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local wall-clock time — the replacement for `.slice(11, 19)`. */
export function localTime(value, withSeconds = false) {
  const d = parseStamp(value)
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return withSeconds ? `${hm}:${pad(d.getSeconds())}` : hm
}

/** Local date and time together, for an audit trail or a receipt. */
export function localDateTime(value) {
  const d = parseStamp(value)
  if (!d) return ''
  return `${localDate(value)} ${localTime(value, true)}`
}

/**
 * Is this stamp within an inclusive local date range?
 *
 * Both ends are local calendar dates as the manager typed them, so a range of
 * 11th–11th covers local midnight to local midnight — which is the business
 * day, and is not the same 24 hours as the UTC 11th.
 */
export function withinLocalRange(value, from, to) {
  const d = localDate(value)
  if (!d) return true       // undated rows are not excluded by a date filter
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

/** Today's local date. Never toISOString(), for the reason above. */
export function todayLocal() {
  const pad = (n) => String(n).padStart(2, '0')
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * A local date as the UTC instant that local day begins / ends.
 *
 * For endpoints that filter on a UTC timestamp column. AuditLogView sent
 * `${date}T00:00:00.000Z`, which is 03:00 local — so the first three hours of
 * every local day were missing from the log.
 */
export function localDayStartUtc(date) {
  return new Date(`${date}T00:00:00`).toISOString()
}

export function localDayEndUtc(date) {
  return new Date(`${date}T23:59:59.999`).toISOString()
}
