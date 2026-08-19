/**
 * One spelling for a table reference, on the screen side.
 *
 * `tables.id` is free text and has been written "T6" in the seeded rows and
 * "Table 6" in the live ones, while an order for that same table is filed
 * under "6". Every screen here compares the two as strings, so the floor plan
 * showed nothing against a table a guest had just ordered from.
 *
 * This mirrors normaliseTableId() in the API (fufut-api/src/lib/staleness.js).
 * The API normalises on write so new rows agree; this is what lets the screens
 * agree about rows written before that, and about `tables.id` itself, which
 * keeps whatever the venue called it.
 *
 * Only unambiguous numeric forms are touched, prefix or no prefix. A table
 * labelled "A1" or "Patio 2" keeps exactly what it was given — those are
 * names, and collapsing them would merge two real tables into one.
 */
export function normaliseTableId(value) {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null
  const m = raw.match(/^(?:table|tbl|t)?[\s._-]*(\d+)(?:\.0+)?$/i)
  if (m) return String(parseInt(m[1], 10))
  return raw
}

/**
 * Do these two references point at the same table?
 *
 * A table row carries both an `id` and a `number`, and which one an order was
 * filed under depends on where it came in from. Comparing against both is
 * what makes a QR order and a POS order for table 6 land on the same tile.
 */
export function sameTable(ref, table) {
  const a = normaliseTableId(ref)
  if (a === null) return false
  if (table === null || table === undefined) return false
  if (typeof table !== 'object') return a === normaliseTableId(table)
  return a === normaliseTableId(table.id) || a === normaliseTableId(table.number)
}
