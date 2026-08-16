/**
 * One place that decides what colour a status is.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Views bound `:class="'badge-' + status"` directly. That works only while
 * every status happens to have a matching CSS class, and it fails **silently**
 * when one does not: the span renders with no background, no border and no
 * padding, so it reads as plain text rather than as a status.
 *
 * It was already failing. The delivery lifecycle produces `picked_up` and
 * `out_for_delivery`; styles.css defines neither, so a driver's two busiest
 * states showed unstyled. Order status `served` had the same problem.
 *
 * The deeper failure was semantic: `occupied` was mapped to `badge-cancelled`,
 * painting a table doing its job in the one colour that means something went
 * wrong. A string concatenation cannot express "occupied is blue" — only a
 * mapping can.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * Colour carries meaning, so it is assigned by meaning rather than by name:
 *
 *   green   this is finished, or fine
 *   blue    this is in progress, or in use
 *   amber   this is waiting on somebody
 *   red     this went wrong, or was stopped
 *   grey    unknown — and it still looks like a badge
 */

/** Only classes that exist in styles.css. Anything else renders unstyled. */
const GREEN = 'badge-success'
const BLUE = 'badge-new'
const AMBER = 'badge-pending'
const RED = 'badge-cancelled'

const STATUS_CLASS = {
  // ── finished, or fine ──
  available: GREEN,
  active: GREEN,
  completed: GREEN,
  fulfilled: GREEN,
  delivered: GREEN,
  served: GREEN,          // was unstyled
  paid: GREEN,
  approved: GREEN,
  verified: GREEN,
  settled: GREEN,
  posted: GREEN,
  ok: GREEN,

  // ── in progress, or in use ──
  // `occupied` is deliberately blue. It was red, which on a floor plan reads as
  // a table to go and fix rather than a table with guests at it.
  occupied: BLUE,
  new: BLUE,
  preparing: BLUE,
  confirmed: BLUE,
  assigned: BLUE,
  picked_up: BLUE,        // was unstyled
  'picked-up': BLUE,
  out_for_delivery: BLUE, // was unstyled
  'out-for-delivery': BLUE,
  'in-transit': BLUE,
  in_transit: BLUE,
  open: BLUE,
  ready: BLUE,
  seated: BLUE,

  // ── waiting on somebody ──
  pending: AMBER,
  reserved: AMBER,
  cleaning: AMBER,
  awaiting: AMBER,
  partial: AMBER,
  unpaid: AMBER,
  recorded: AMBER,
  draft: AMBER,
  provisional: AMBER,
  low: AMBER,
  late: AMBER,
  'on-leave': AMBER,
  'early-departure': AMBER,

  // ── went wrong, or was stopped ──
  cancelled: RED,
  canceled: RED,
  rejected: RED,
  voided: RED,
  failed: RED,
  absent: RED,
  expired: RED,
  'out-of-stock': RED,
  critical: RED,
  inactive: RED,
  'no-show': RED,
}

/**
 * The badge class for a status.
 *
 * Never returns nothing: an unrecognised status still gets a neutral badge, so
 * a new state added to the API shows up as a grey chip rather than as bare text
 * that nobody notices is broken.
 */
export function statusBadgeClass(status) {
  if (status === null || status === undefined || status === '') return 'badge-neutral'
  const key = String(status).trim().toLowerCase()
  return STATUS_CLASS[key] || STATUS_CLASS[key.replace(/_/g, '-')] || 'badge-neutral'
}

/** Human-readable: "out_for_delivery" → "Out for delivery". */
export function statusLabel(status) {
  if (status === null || status === undefined || status === '') return '—'
  const s = String(status).trim().replace(/[_-]+/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Both at once, for a template that wants one call. */
export function useStatusBadge() {
  return { statusBadgeClass, statusLabel }
}
