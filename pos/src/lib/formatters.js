/**
 * Shared data formatting utilities for POS.
 * Prevents raw JSON, unparsed arrays, or [object Object] from leaking into UI tables.
 */

export function titleCase(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

export function formatOrderItems(rawItems) {
  if (!rawItems) return '—'

  let parsed = rawItems
  if (typeof rawItems === 'string') {
    const trimmed = rawItems.trim()
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        return rawItems
      }
    } else {
      return rawItems
    }
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return '—'
    return parsed
      .map(item => {
        if (typeof item === 'string') return item
        if (typeof item === 'number') return String(item)
        if (typeof item === 'object' && item !== null) {
          const qty = item.qty || item.quantity || 1
          const name = item.name || item.title || item.menuItemId || 'Item'
          const mods = item.modifiers || item.selectedModifiers
          let modStr = ''

          if (Array.isArray(mods) && mods.length > 0) {
            const modNames = mods
              .map(m => (typeof m === 'string' ? titleCase(m) : titleCase(m.name || m.label || '')))
              .filter(Boolean)
            if (modNames.length) modStr = ` (${modNames.join(', ')})`
          } else if (typeof mods === 'string' && mods.trim()) {
            modStr = ` (${mods.trim()})`
          }

          const qtyPrefix = qty > 1 ? `${qty}× ` : ''
          return `${qtyPrefix}${name}${modStr}`
        }
        return String(item)
      })
      .join(', ')
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const qty = parsed.qty || parsed.quantity || 1
    const name = parsed.name || parsed.title || 'Item'
    const qtyPrefix = qty > 1 ? `${qty}× ` : ''
    return `${qtyPrefix}${name}`
  }

  return String(parsed)
}

export function formatModifiers(mods) {
  if (!mods) return '—'
  let parsed = mods

  if (typeof mods === 'string') {
    const trimmed = mods.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        parsed = trimmed.split(',').map(s => s.trim())
      }
    } else {
      parsed = trimmed.split(',').map(s => s.trim())
    }
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return '—'
    return parsed
      .map(m => (typeof m === 'string' ? titleCase(m) : titleCase(m.name || m.label || '')))
      .filter(Boolean)
      .join(', ')
  }

  if (typeof parsed === 'object' && parsed !== null) {
    return titleCase(parsed.name || parsed.label || String(parsed))
  }

  return titleCase(String(parsed))
}

export function formatValue(val) {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'number') return String(val)

  let parsed = val
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        return val
      }
    } else {
      return val
    }
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return '—'
    return parsed
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          if (item.name && item.qty) return `${item.qty}× ${item.name}`
          if (item.method && item.amount) return `${item.method}: ETB ${item.amount}`
          return Object.entries(item)
            .map(([k, v]) => `${titleCase(k)}: ${v}`)
            .join('; ')
        }
        return String(item)
      })
      .join(', ')
  }

  if (typeof parsed === 'object' && parsed !== null) {
    return Object.entries(parsed)
      .map(([k, v]) => `${titleCase(k)}: ${typeof v === 'object' ? formatValue(v) : v}`)
      .join(', ')
  }

  return String(parsed)
}

/**
 * Is this order a real sale?
 *
 * Voided and cancelled orders stay in the database for the audit trail, but
 * they are not revenue and must not be counted as such anywhere. The API's
 * reports exclude them with `voided_at IS NULL AND status <> 'cancelled'`
 * (REAL_ORDERS in fufut-api/src/handlers/reports.js); this is the front-end's
 * copy of that rule, for the screens that sum orders client-side.
 *
 * A void sets both markers (status = 'cancelled', voided_at = timestamp), so
 * either one excludes — belt and braces, because rows written before one of
 * the columns existed carry only the other.
 */
export function isRealOrder(o) {
  if (!o) return false
  if (o.voided_at) return false
  const st = String(o.status || '').toLowerCase()
  return st !== 'cancelled' && st !== 'voided'
}
