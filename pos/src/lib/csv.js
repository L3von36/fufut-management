/**
 * CSV helpers shared by the export buttons.
 *
 * Kept tiny and dependency-free on purpose: the exports land in Excel on the
 * manager's laptop, so plain RFC-4180 rules — quote what needs quoting, double
 * embedded quotes, CRLF line endings — are the whole job. The BOM in
 * downloadCsv makes Excel read the file as UTF-8, which matters when a
 * supplier or item name carries an accent.
 */

export function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(filename, text) {
  const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
