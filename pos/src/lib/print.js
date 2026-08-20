/**
 * Printing — §53.
 *
 * Two screens rolled their own print window (CheckoutView, OrdersView), each
 * with its own inline stylesheet, and everything else had no print path at all:
 * no kitchen ticket, no purchase record, no expense record, no management
 * report, no payslip.
 *
 * This is the shared surface. Callers supply a title and body HTML; the paper
 * size, the header, the escaping and the print-then-close dance live here once.
 *
 * ── Two paper widths ────────────────────────────────────────────────────────
 *
 * `receipt` is 80 mm thermal — the till roll and the kitchen printer. `a4` is
 * for anything a manager files or hands to an accountant. They are genuinely
 * different documents: a report squeezed onto 80 mm is unreadable, and a
 * receipt on A4 wastes most of a page.
 *
 * ── Escaping is not optional here ───────────────────────────────────────────
 *
 * Order notes, customer names and expense descriptions are free text typed by
 * staff and guests. Interpolating them raw into a document that is then written
 * into a window is a straightforward injection, so everything goes through
 * `esc()` and callers are given `row()`/`line()` helpers rather than being
 * trusted to remember.
 */

const PAPER = {
  receipt: { width: '80mm', margin: '4mm', base: '12px' },
  a4: { width: '210mm', margin: '12mm', base: '13px' },
}

/** HTML-escape a value for interpolation into a printed document. */
export function esc(v) {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A label/value line, both escaped. */
export function line(label, value) {
  return `<div class="ln"><span>${esc(label)}</span><span>${esc(value)}</span></div>`
}

/** A table row from an array of cells, all escaped. */
export function row(cells, { bold = false, tag = 'td' } = {}) {
  const style = bold ? ' style="font-weight:700"' : ''
  return `<tr${style}>${cells.map((c) => `<${tag}>${esc(c)}</${tag}>`).join('')}</tr>`
}

export function table(headers, rows) {
  return `<table>
    <thead>${row(headers, { bold: true, tag: 'th' })}</thead>
    <tbody>${rows.map((r) => row(r)).join('')}</tbody>
  </table>`
}

function styles(paper) {
  const p = PAPER[paper] || PAPER.receipt
  return `
    @page { size: ${paper === 'a4' ? 'A4' : p.width + ' auto'}; margin: ${p.margin}; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: ${p.base}; margin: 0; padding: 0; color: #000;
      width: ${paper === 'a4' ? 'auto' : p.width};
    }
    h1 { font-size: 1.25em; margin: 0 0 2px; text-align: center; letter-spacing: .04em; }
    .sub { text-align: center; font-size: .85em; margin-bottom: 8px; }
    .meta { font-size: .82em; margin-bottom: 8px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .ln { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
    .ln.total { font-weight: 700; font-size: 1.1em; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: .85em; }
    th, td { text-align: left; padding: 3px 4px; vertical-align: top; }
    thead th { border-bottom: 1px solid #000; }
    tbody tr { border-bottom: 1px solid #eee; }
    .right { text-align: right; }
    .foot { margin-top: 10px; text-align: center; font-size: .78em; }
    /* Kitchen tickets are read across a hot pass at arm's length. */
    .ticket-item { font-size: 1.15em; font-weight: 700; padding: 3px 0; }
    .ticket-mods { font-size: .85em; font-weight: 400; padding-left: 10px; }
    .badge-type { border: 2px solid #000; padding: 2px 8px; font-weight: 700; display: inline-block; }
  `
}

/**
 * Open a print window and print it.
 *
 * @param {object} opts
 * @param {string} opts.title     document title — also the default filename on "save as PDF"
 * @param {string} opts.body      HTML, already escaped by the caller
 * @param {'receipt'|'a4'} [opts.paper]
 * @param {string} [opts.heading] shop name at the top; omit for none
 * @param {string} [opts.subtitle]
 * @returns {boolean} false if the browser blocked the window
 */
export function printDocument({ title, body, paper = 'receipt', heading = 'FU FUT COFFEE', subtitle = '' }) {
  const w = window.open('', '_blank', 'width=420,height=640')
  // A blocked pop-up is the single most likely failure, and it is silent —
  // the caller needs to be able to tell the user rather than appear to print.
  if (!w) return false

  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${styles(paper)}</style></head>
<body>
  ${heading ? `<h1>${esc(heading)}</h1>` : ''}
  ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  ${body}
</body></html>`)
  w.document.close()
  w.focus()

  // Chrome needs the document settled before print() or the dialog opens on a
  // blank page. onload is the reliable signal; the timeout is the fallback for
  // the case where it has already fired.
  const go = () => { try { w.print(); w.close() } catch { /* user cancelled */ } }
  if (w.document.readyState === 'complete') setTimeout(go, 60)
  else w.onload = go

  return true
}

/** Local date/time for a document footer. */
export function stamp(d = new Date()) {
  return d.toLocaleString()
}

/**
 * Kitchen order ticket — the thing the pass actually reads.
 *
 * Order type is boxed and shouted because §4 turns on the kitchen being able to
 * tell dine-in from takeaway from delivery at a glance; a takeaway plated on
 * china is a remake.
 */
export function kitchenTicket(order, items = []) {
  const type = String(order.order_type || order.type || 'dine-in').replace('-', ' ').toUpperCase()
  const where = order.tableNum || order.table_number || order.table_id
  const body = [
    `<div style="text-align:center;margin-bottom:6px"><span class="badge-type">${esc(type)}</span></div>`,
    `<h1 style="font-size:1.6em">#${esc(String(order.id || '').slice(-4))}</h1>`,
    where ? `<div class="sub">Table ${esc(where)}</div>` : '',
    order.customer ? `<div class="sub">${esc(order.customer)}</div>` : '',
    order.customer_phone ? `<div class="sub">${esc(order.customer_phone)}</div>` : '',
    '<hr>',
    items.length
      ? items.map((i) => {
          const mods = i.modifiers && i.modifiers !== '[]' ? modsText(i.modifiers) : ''
          return `<div class="ticket-item">${esc(i.qty)} × ${esc(i.name)}</div>` +
                 (mods ? `<div class="ticket-mods">${esc(mods)}</div>` : '') +
                 (i.notes ? `<div class="ticket-mods">! ${esc(i.notes)}</div>` : '')
        }).join('')
      : `<div class="ticket-item">${esc(order.items || '')}</div>`,
    '<hr>',
    // Order-level notes are allergies and prep instructions. Last, largest,
    // because it is the line that must not be missed.
    order.notes ? `<div class="ticket-item" style="font-size:1.2em">** ${esc(order.notes)} **</div>` : '',
    `<div class="foot">${esc(stamp())}</div>`,
  ].join('')

  return printDocument({ title: `Kitchen ticket ${order.id}`, body, paper: 'receipt', subtitle: 'KITCHEN' })
}

/**
 * Customer receipt — the thing the guest takes home.
 *
 * Replaces the inline HTML in CheckoutView.printReceipt(). Uses the shared
 * printDocument() so the receipt matches the kitchen ticket's paper size and
 * font stack.
 */
export function customerReceipt(payload, storeItems, storeHelpers) {
  const id = payload.id || '—'
  const date = stamp()
  const lines = storeItems.map(i => {
    const modStr = (i.selectedModifiers || []).map(m => m.name).join(', ')
    const nameParts = [i.name]
    if (modStr) nameParts.push(`[${modStr}]`)
    return line(
      `${i.qty}x ${nameParts.join(' ')}`,
      `ETB ${Math.round(storeHelpers.lineTotal(i) * i.qty)}`
    )
  }).join('')

  const summary = [
    line('Subtotal', `ETB ${Math.round(payload.subtotal || 0)}`),
  ]
  if (payload.discount > 0) {
    summary.push(line(`Discount${payload.discountReason ? ' (' + esc(payload.discountReason) + ')' : ''}`, `-ETB ${Math.round(payload.discount)}`))
  }
  if (payload.tip > 0) {
    summary.push(line('Tip', `ETB ${Math.round(payload.tip)}`))
  }
  if (payload.deliveryFee > 0) {
    summary.push(line('Delivery Fee', `ETB ${Math.round(payload.deliveryFee)}`))
  }

  const paymentLines = (payload.paymentBreakdown || []).map(pb => {
    const method = esc(pb.method.charAt(0).toUpperCase() + pb.method.slice(1))
    let ln = line(method, `ETB ${Math.round(pb.amount)}`)
    if (pb.tendered !== undefined) {
      ln += line(`  Tendered`, `ETB ${Math.round(pb.tendered)}`)
      ln += line(`  Change`, `ETB ${Math.round(pb.change || 0)}`)
    }
    return ln
  }).join('')

  const body = [
    line('Type', `${esc(payload.type)}${payload.tableNum ? ' · Table ' + esc(payload.tableNum) : ''}`),
    line('Customer', esc(payload.customer) || 'Walk-in'),
    '<hr>',
    lines,
    '<hr>',
    summary.join(''),
    `<div class="ln total"><span>GRAND TOTAL</span><span>ETB ${esc(String(payload.total))}</span></div>`,
    '<hr>',
    `<div style="font-size:.82em;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;color:#666">Payment</div>`,
    paymentLines,
    '<hr>',
    `<div class="foot">Thank you for visiting!<br>FU FUT COFFEE</div>`,
    `<div class="foot">${esc(date)}</div>`,
  ].join('')

  return printDocument({ title: `Receipt #${id}`, body, paper: 'receipt', subtitle: 'FU FUT CAFÉ' })
}

function modsText(modifiers) {
  let list = modifiers
  if (typeof list === 'string') {
    try { list = JSON.parse(list) } catch { return list }
  }
  if (!Array.isArray(list)) return ''
  return list.map((m) => (typeof m === 'string' ? m : m && m.name)).filter(Boolean).join(', ')
}

/** A4 document: title, optional summary lines, and a table. */
export function printReport({ title, subtitle = '', summary = [], headers, rows, footer = '' }) {
  const body = [
    `<div class="meta"><strong>${esc(title)}</strong>${subtitle ? ' — ' + esc(subtitle) : ''}</div>`,
    summary.length ? summary.map(([l, v]) => line(l, v)).join('') + '<hr>' : '',
    headers && rows ? table(headers, rows) : '',
    footer ? `<div class="foot">${esc(footer)}</div>` : '',
    `<div class="foot">Printed ${esc(stamp())}</div>`,
  ].join('')

  return printDocument({ title, body, paper: 'a4', subtitle })
}
