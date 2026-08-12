/**
 * Shared data formatting utilities for Backoffice.
 * Prevents raw JSON, unparsed arrays, or [object Object] from leaking into UI tables.
 */

/**
 * Capitalizes words and replaces hyphens/underscores with spaces.
 */
export function titleCase(str) {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

/**
 * Format order items safely.
 * Accepts flat strings, JSON strings, arrays of item objects, or single objects.
 */
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

/**
 * Format modifiers list cleanly.
 */
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

/**
 * Formats arbitrary objects or arrays into readable text for audit logs or table cells.
 */
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
