/**
 * Shared order-line parsing for kitchen and pipeline views.
 *
 * Both KitchenView and PipelineView had their own copies of getStructuredLines /
 * getOrderLines / parseFlatItems / formatModName.  This module consolidates them
 * so a bug fix in one place propagates everywhere.
 */

import { formatOrderItems } from './formatters'

/**
 * Convert a kebab-case modifier name to Title Case.
 * "oat-milk" → "Oat Milk"
 */
export function formatModName(mod) {
  return String(mod)
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Parse a flat item string like "2x Latte [oat-milk, vanilla], 1x Espresso"
 * into structured lines: { qty, name, modifiers, notes }
 */
export function parseFlatItems(flat) {
  if (!flat) return []
  if (typeof flat === 'string' && (flat.trim().startsWith('[') || flat.trim().startsWith('{'))) {
    try {
      const parsed = JSON.parse(flat.trim())
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      return arr.map(i => {
        if (typeof i === 'string') return { qty: 1, name: i, modifiers: [], notes: '' }
        return {
          qty: i.qty || i.quantity || 1,
          name: i.name || i.title || 'Item',
          modifiers: Array.isArray(i.modifiers)
            ? i.modifiers.map(m => ({ name: typeof m === 'string' ? m : m.name, priceDelta: 0 }))
            : [],
          notes: i.notes || ''
        }
      })
    } catch { /* fall through */ }
  }
  const lines = []
  const parts = flat.split(/,(?=\s*\d+x)/)
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const qtyMatch = trimmed.match(/^(\d+)x\s*(.*)/)
    if (!qtyMatch) continue
    const qty = parseInt(qtyMatch[1], 10)
    const rest = qtyMatch[2].trim()
    const modMatch = rest.match(/\[([^\]]*)\]/)
    const mods = modMatch
      ? modMatch[1].split(',').map(m => ({ name: m.trim(), priceDelta: 0 })).filter(m => m.name)
      : []
    const noteMatch = rest.match(/\(([^)]*)\)/)
    const notes = noteMatch ? noteMatch[1].trim() : ''
    let name = rest
      .replace(/\[[^\]]*\]/, '').trim()
      .replace(/\([^)]*\)/, '').trim()
    if (name) lines.push({ qty, name, modifiers: mods, notes })
  }
  return lines
}

/**
 * Parse order into structured lines.
 * Uses `order_items` (Phase 1 structured JSON) when available,
 * falls back to flat `items` string.
 *
 * Returns: { qty, name, modifiers, notes }[]
 */
export function getOrderLines(order) {
  const structured = order.order_items || order.orderItems
  if (Array.isArray(structured) && structured.length > 0) {
    return structured.map(item => ({
      qty: item.qty || 1,
      name: item.name || 'Unknown',
      modifiers: (item.modifiers || []).map(m => ({
        name: m.name || m,
        priceDelta: m.priceDelta || 0
      })),
      notes: item.notes || ''
    }))
  }
  const flat = order.items
  if (!flat || typeof flat !== 'string') return []
  return parseFlatItems(flat)
}

/**
 * Simplified structured lines for the Pipeline view.
 * Returns: { qty, name, modifiers: string[] }[]
 */
export function getStructuredLines(order) {
  const structured = order.order_items || order.orderItems
  if (Array.isArray(structured) && structured.length > 0) {
    return structured.map(item => ({
      qty: item.qty || 1,
      name: item.name || 'Unknown',
      modifiers: (item.modifiers || []).map(m => formatModName(m.name || m))
    }))
  }
  const flat = order.items
  if (!flat) return []
  if (typeof flat === 'string' && (flat.trim().startsWith('[') || flat.trim().startsWith('{'))) {
    try {
      const parsed = JSON.parse(flat.trim())
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      return arr.map(i => {
        if (typeof i === 'string') return { qty: 1, name: i, modifiers: [] }
        return {
          qty: i.qty || i.quantity || 1,
          name: i.name || i.title || 'Item',
          modifiers: Array.isArray(i.modifiers) ? i.modifiers.map(m => formatModName(m.name || m)) : []
        }
      })
    } catch { /* fall through */ }
  }
  if (typeof flat !== 'string') return []
  const lines = []
  const parts = flat.split(/,(?=\s*\d+x)/)
  for (const part of parts) {
    const trimmed = part.trim()
    const qtyMatch = trimmed.match(/^(\d+)x\s*(.*)/)
    if (!qtyMatch) continue
    const rest = qtyMatch[2].trim()
    const modMatch = rest.match(/\[([^\]]*)\]/)
    const mods = modMatch ? modMatch[1].split(',').map(m => formatModName(m.trim())).filter(Boolean) : []
    const name = rest.replace(/\[[^\]]*\]/, '').replace(/\([^)]*\)/, '').trim()
    if (name) lines.push({ qty: parseInt(qtyMatch[1], 10), name, modifiers: mods })
  }
  return lines
}

/**
 * Re-export the formatters utility for convenience.
 */
export { formatOrderItems }
