/**
 * Open-check resolution for the floor plan.
 *
 * The two screens that resume a table's tab (TablesView's "Add Round" and
 * "Go to Checkout") had their own copies of a filter that excluded order
 * status 'fulfilled' — the kitchen's whole-ticket "Served" word. That conflated
 * food served with the check closed: a ticket with money still owed stopped
 * being resumable the moment the chef marked the food served, so a second
 * round silently opened a *second* ticket for the same table, and the first
 * check leaked at the till.
 *
 * A check is open until it is paid. Only cancellation, completion or actual
 * payment close it — which is exactly the API's own definition in
 * listOpenChecks.
 */

/**
 * Can this order still take lines and be settled — i.e. is it an open check?
 */
export function isResumableCheck(order) {
  if (!order) return false
  const status = String(order.status || '').toLowerCase()
  if (status === 'cancelled' || status === 'completed') return false
  return String(order.payment_status || '').toLowerCase() !== 'paid'
}

/**
 * The open check a table's next action should attach to: the newest resumable
 * order for that table number, or null when the table is starting fresh.
 *
 * "Newest" is by created timestamp, not array position — GET /orders returns
 * rows newest-first, so "the last element" quietly selected the OLDEST open
 * check whenever a table had more than one.
 *
 * Table ids are compared as strings because they have drifted between 'T-01',
 * 'Table 1' and '1' over the life of the data — the same trap the occupancy
 * sweep had to be taught about.
 */
export function latestResumableCheck(orders, tableNum) {
  if (!Array.isArray(orders) || orders.length === 0) return null
  const target = String(tableNum)
  let best = null
  let bestTime = -Infinity
  for (const o of orders) {
    if (
      isResumableCheck(o) &&
      (String(o.table_number || '') === target || String(o.tableNum || '') === target)
    ) {
      const t = Date.parse(o.created || '')
      const score = Number.isFinite(t) ? t : -Infinity
      // >= so that, between rows with no parseable timestamp, the later array
      // position wins — the behaviour the old "last element" code had.
      if (score >= bestTime) {
        bestTime = score
        best = o
      }
    }
  }
  return best
}
