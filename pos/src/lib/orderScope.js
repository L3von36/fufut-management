/**
 * Which orders a role sees on the Orders screen, and which lines of each.
 *
 * The boards already route strictly by station (KitchenView renders only its
 * own lines — Task 17), but the Orders list showed every role the whole
 * ticket: the barista scrolled past Chechebesa, the chef scrolled past soda
 * rounds, and one waiter could read another waiter's work. This module is the
 * single source of truth for that screen's scoping:
 *
 *   barista                  tickets with at least one drink line, drinks only
 *   head-chef, assistant-chef  tickets with at least one food line, food only
 *   head-waiter              tickets he created, or tickets sitting on a
 *                            table assigned to him — whole ticket, because
 *                            the whole guest's bill is his to run
 *   everyone else            unchanged (manager, cashier, accountant…)
 *
 * "Drink" is judged exactly the way the boards judge it — lib/drinks.js — so
 * a ticket cannot route to the barista's board but vanish from their list
 * (or the reverse). That judgement is name-based for lines the POS writes
 * (serializeOrderItems does not stamp a category), which is the same fallback
 * the boards have always lived with.
 *
 * The scoping is a screen focus, not a security boundary: every one of these
 * roles already holds a server-side `orders` READ grant (the board, the SSE
 * feed and the SLA rules all ride on it), so nothing new is exposed here.
 * What changes is what the screen puts in front of them.
 */
import { nameIsDrink } from './drinks'

/**
 * The lines of a stored ticket, or null when they cannot be known.
 *
 * Orders are written as a JSON array of line objects, so a parseable array is
 * the normal case. A null return means a legacy row — the old human-readable
 * "1xMacchiato, 1xFut breakfast" summary — and the caller fails OPEN: an
 * order nobody can classify is shown unfiltered rather than silently hiding
 * somebody's work behind a parse failure.
 */
export function parseOrderLines(rawItems) {
  if (rawItems == null) return null
  let parsed = rawItems
  if (typeof parsed === 'string') {
    const t = parsed.trim()
    if (!t.startsWith('[') || !t.endsWith(']')) return null
    try {
      parsed = JSON.parse(t)
    } catch {
      return null
    }
  }
  if (!Array.isArray(parsed)) return null
  return parsed.filter((l) => l && typeof l === 'object' && (l.name || l.menuItemId))
}

/**
 * A line belongs to the bar when its category — or, for rows written before
 * categories were stamped, its name — reads as a drink. Mirrors
 * KitchenView.lineIsDrink word for word on purpose.
 */
export function lineIsDrink(line) {
  if (nameIsDrink(line.category)) return true
  return nameIsDrink(line.name)
}

/**
 * The station's own lines of a ticket. station is 'bar' (drinks) or
 * 'kitchen' (everything else), matching the board filters.
 */
export function scopedLines(rawItems, station) {
  const lines = parseOrderLines(rawItems)
  if (!lines) return null
  const wantDrink = station === 'bar'
  return lines.filter((l) => (wantDrink ? lineIsDrink(l) : !lineIsDrink(l)))
}

/**
 * Does this order belong on this role's Orders screen at all?
 *
 * ctx carries what the server already scopes for the caller:
 *   myId     — the signed-in staff id (auth.user.id); orders stamp the
 *              creator's id server-side as created_by, so a waiter's own
 *              tickets are recognisable no matter what table they name
 *   myTables — Set of table numbers the caller may work. For a head-waiter
 *              this comes from /api/tables, which the server already narrows
 *              to the tables assigned to them by name.
 */
export function orderVisibleToRole(order, roleKey, ctx = {}) {
  const role = String(roleKey || '').toLowerCase()
  if (role === 'barista') {
    const lines = scopedLines(order.items, 'bar')
    return !lines || lines.length > 0
  }
  if (role === 'head-chef' || role === 'assistant-chef') {
    const lines = scopedLines(order.items, 'kitchen')
    return !lines || lines.length > 0
  }
  if (role === 'head-waiter') {
    const mine = ctx.myId != null && String(order.created_by || '') === String(ctx.myId)
    if (mine) return true
    // A ticket on one of his assigned tables is his to run even when a
    // colleague or a guest QR order fired it. Takeaways with no table stay
    // with whoever took them.
    const tables = ctx.myTables
    if (!tables || !tables.size) return false
    const tid = String(order.table_id ?? order.tableNum ?? order.table_number ?? '')
    return !!tid && tables.has(tid)
  }
  return true
}

/**
 * The lines of a ticket this role should READ, or null to show the ticket
 * unchanged. Station roles get only their own lines — the same strict split
 * the boards use, so a dimmed Chechebesa line never sits in the barista's
 * list implying it is theirs to make.
 */
export function orderLinesForRole(order, roleKey) {
  const role = String(roleKey || '').toLowerCase()
  if (role === 'barista') return scopedLines(order.items, 'bar')
  if (role === 'head-chef' || role === 'assistant-chef') return scopedLines(order.items, 'kitchen')
  return null
}
