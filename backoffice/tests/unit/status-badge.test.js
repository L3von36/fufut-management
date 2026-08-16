import { describe, it, expect } from 'vitest'
import { statusBadgeClass, statusLabel } from '../../src/composables/useStatusBadge.js'

/** Every class the composable may return must exist in styles.css. */
const DEFINED = ['badge-success', 'badge-new', 'badge-pending', 'badge-cancelled', 'badge-neutral']

describe('statusBadgeClass', () => {
  /**
   * The bug this replaces. Views bound `'badge-' + status` directly, so a
   * status with no matching class rendered a span with no background, border or
   * padding — plain text where a badge should be, which nobody notices is
   * broken.
   */
  it('styles the delivery states that were rendering unstyled', () => {
    // The delivery lifecycle produces both; styles.css defines neither.
    expect(statusBadgeClass('picked_up')).toBe('badge-new')
    expect(statusBadgeClass('out_for_delivery')).toBe('badge-new')
  })

  it('styles order status "served", which was also unstyled', () => {
    expect(statusBadgeClass('served')).toBe('badge-success')
  })

  /**
   * A table with guests at it is not a failure. `occupied` mapped to
   * badge-cancelled — the one colour that means something went wrong — so a
   * busy floor plan read as a list of problems.
   */
  it('paints an occupied table as in-use, not as an error', () => {
    expect(statusBadgeClass('occupied')).toBe('badge-new')
    expect(statusBadgeClass('occupied')).not.toBe('badge-cancelled')
  })

  it('never returns a class that does not exist', () => {
    const statuses = [
      'new', 'preparing', 'ready', 'served', 'fulfilled', 'completed', 'cancelled',
      'confirmed', 'assigned', 'picked_up', 'out_for_delivery', 'delivered',
      'available', 'occupied', 'reserved', 'cleaning',
      'pending', 'approved', 'rejected', 'paid', 'unpaid', 'partial',
      'active', 'inactive', 'late', 'absent', 'on-leave',
    ]
    for (const s of statuses) {
      expect(DEFINED, `"${s}" produced an undefined class`).toContain(statusBadgeClass(s))
    }
  })

  /**
   * The property that makes this safe to ship: a status nobody anticipated
   * still looks like a badge. Silence is what let the old bug survive.
   */
  it('gives an unknown status a neutral badge rather than nothing', () => {
    expect(statusBadgeClass('some_new_state')).toBe('badge-neutral')
    expect(statusBadgeClass(null)).toBe('badge-neutral')
    expect(statusBadgeClass('')).toBe('badge-neutral')
    expect(statusBadgeClass(undefined)).toBe('badge-neutral')
  })

  it('tolerates the case and separator the API happens to use', () => {
    expect(statusBadgeClass('PICKED_UP')).toBe('badge-new')
    expect(statusBadgeClass('picked-up')).toBe('badge-new')
    expect(statusBadgeClass('  Cancelled  ')).toBe('badge-cancelled')
  })

  it('keeps red for things that actually went wrong', () => {
    for (const s of ['cancelled', 'rejected', 'failed', 'absent', 'expired']) {
      expect(statusBadgeClass(s)).toBe('badge-cancelled')
    }
  })
})

describe('statusLabel', () => {
  it('turns a machine status into something readable', () => {
    expect(statusLabel('out_for_delivery')).toBe('Out for delivery')
    expect(statusLabel('picked-up')).toBe('Picked up')
    expect(statusLabel('new')).toBe('New')
  })

  it('renders an em dash for nothing rather than "undefined"', () => {
    expect(statusLabel(null)).toBe('—')
    expect(statusLabel('')).toBe('—')
  })
})
