import { toCsv } from './csv';

/**
 * Query string for the purchases list. The server already understands
 * from/to against the purchase date; empty bounds stay out of the URL so
 * "all days" remains the plain unfiltered list the page has always loaded.
 */
export function purchaseQuery({ from, to } = {}) {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * One CSV row per purchased *item line* — "what did we buy on day X" is a
 * question about items, not about purchase headers. The purchase summary
 * columns (date, supplier, totals) ride along on every row so the sheet
 * still stands alone once somebody filters it in Excel.
 *
 * A purchase with no readable lines still gets one row marked "(no lines
 * recorded)" — a silent gap in an export is indistinguishable from a day
 * with nothing bought.
 */
export function purchasesToCsv(purchasesWithLines) {
  const headers = [
    'Date', 'Purchase', 'Supplier', 'Item', 'Qty', 'Unit',
    'Unit cost (ETB)', 'Line total (ETB)', 'Purchase total (ETB)', 'Paid (ETB)', 'Payment method',
  ];
  const rows = [];
  for (const p of purchasesWithLines || []) {
    const lines = p.lines && p.lines.length
      ? p.lines
      : [{ item_name: '(no lines recorded)', qty: '', unit: '', unit_cost: '', total_cost: '' }];
    for (const l of lines) {
      rows.push([
        (p.date || '').slice(0, 10),
        p.id,
        p.supplier_name || '',
        l.item_name || l.inventory_id || '',
        l.qty ?? '',
        l.unit || '',
        l.unit_cost ?? '',
        l.total_cost ?? '',
        p.total ?? '',
        p.paid ?? '',
        p.payment_method || '',
      ]);
    }
  }
  return toCsv(headers, rows);
}

export function purchaseExportName({ from, to } = {}) {
  if (from && to) return `purchases-${from}-to-${to}.csv`;
  if (from) return `purchases-from-${from}.csv`;
  if (to) return `purchases-to-${to}.csv`;
  return 'purchases-all.csv';
}
