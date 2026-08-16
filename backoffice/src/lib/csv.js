/**
 * CSV serialisation for exports.
 *
 * Quoting matters more here than it looks. An order's `items` field is prose
 * like `1xMacchiato, 1xFut breakfast Gebeta`, and an unquoted comma inside it
 * splits one order across two columns and silently shifts every field after it
 * — the kind of corruption nobody notices until the accountant's totals are
 * wrong. Embedded quotes are doubled per RFC 4180, which is what a spreadsheet
 * expects.
 */

/**
 * @param {Array<object>} rows
 * @returns {string} CSV with a header row, CRLF line endings
 */
export function toCsv(rows) {
  if (!Array.isArray(rows) || !rows.length) return ''

  // The union of every row's keys, not the first row's. Rows written before a
  // migration lack the newer columns, and keying off row zero would drop those
  // columns for every row in the file.
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r || {})))]

  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => cell(r ? r[h] : undefined)).join(',')),
  ].join('\r\n')
}

export function cell(v) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Trigger a browser download without leaking the object URL. */
export function download(content, filename, type) {
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
