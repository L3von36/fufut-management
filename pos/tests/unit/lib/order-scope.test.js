import { describe, it, expect } from 'vitest'
import {
  parseOrderLines,
  lineIsDrink,
  scopedLines,
  orderVisibleToRole,
  orderLinesForRole,
} from '../../../src/lib/orderScope'

const drinkLine = (name, qty = 1) => ({ menuItemId: 'M-d', name, qty, basePrice: 60 })
const foodLine = (name, qty = 1) => ({ menuItemId: 'M-f', name, qty, basePrice: 180 })

const order = (items, extra = {}) => ({ id: 'O-1', items, status: 'new', ...extra })

describe('parseOrderLines', () => {
  it('parses the JSON array the POS writes', () => {
    const raw = JSON.stringify([drinkLine('Latte'), foodLine('Chechebesa')])
    const lines = parseOrderLines(raw)
    expect(lines).toHaveLength(2)
    expect(lines[0].name).toBe('Latte')
  })

  it('accepts an already-parsed array', () => {
    expect(parseOrderLines([drinkLine('Soda')])).toHaveLength(1)
  })

  it('returns null for the legacy human-readable summary (fail open upstream)', () => {
    expect(parseOrderLines('2xEspresso, 1xFut breakfast Gebeta')).toBeNull()
  })

  it('returns null for null, objects and junk', () => {
    expect(parseOrderLines(null)).toBeNull()
    expect(parseOrderLines(undefined)).toBeNull()
    expect(parseOrderLines({ name: 'Latte' })).toBeNull()
    expect(parseOrderLines('[broken')).toBeNull()
  })

  it('drops entries with no name and no menu id', () => {
    const raw = JSON.stringify([drinkLine('Latte'), { qty: 2 }, null])
    expect(parseOrderLines(raw)).toHaveLength(1)
  })
})

describe('lineIsDrink', () => {
  it('judges by category first', () => {
    expect(lineIsDrink({ category: 'Drinks', name: 'Mango Juice' })).toBe(true)
    expect(lineIsDrink({ category: 'SALAD BOWL', name: 'Fruit Salad' })).toBe(false)
  })

  it('falls back to the name when the line carries no category (what the POS writes)', () => {
    expect(lineIsDrink({ category: '', name: 'Macchiato' })).toBe(true)
    expect(lineIsDrink({ category: '', name: 'Chechebesa' })).toBe(false)
    expect(lineIsDrink({ name: 'Fut Detox Juice' })).toBe(true)
  })

  it('agrees with the board about the same line', () => {
    // The whole point of routing through lib/drinks.js: a line cannot route
    // to the barista's board and disappear from their Orders list.
    expect(lineIsDrink({ name: 'Soda' })).toBe(true)
    expect(lineIsDrink({ name: 'FRUIT SALAD' })).toBe(false)
  })
})

describe('scopedLines', () => {
  const raw = JSON.stringify([drinkLine('Latte', 2), foodLine('Chechebesa'), drinkLine('Soda')])

  it('bar station keeps drinks only', () => {
    expect(scopedLines(raw, 'bar').map(l => l.name)).toEqual(['Latte', 'Soda'])
  })

  it('kitchen station keeps food only', () => {
    expect(scopedLines(raw, 'kitchen').map(l => l.name)).toEqual(['Chechebesa'])
  })

  it('returns null (not an empty array) for unparseable rows so callers fail open', () => {
    expect(scopedLines('2xEspresso', 'bar')).toBeNull()
  })
})

describe('orderVisibleToRole', () => {
  const mixed = order(JSON.stringify([drinkLine('Latte'), foodLine('Chechebesa')]))
  const drinksOnly = order(JSON.stringify([drinkLine('Espresso', 3)]))
  const foodOnly = order(JSON.stringify([foodLine('Chechebesa'), foodLine('Fruit Salad')]))
  const legacy = order('2xEspresso, 1xChechebesa')

  it('barista sees tickets that carry a drink, not the kitchen-only ones', () => {
    expect(orderVisibleToRole(mixed, 'barista')).toBe(true)
    expect(orderVisibleToRole(drinksOnly, 'barista')).toBe(true)
    expect(orderVisibleToRole(foodOnly, 'barista')).toBe(false)
  })

  it('chef sees tickets that carry food, not the bar-only ones', () => {
    expect(orderVisibleToRole(mixed, 'head-chef')).toBe(true)
    expect(orderVisibleToRole(foodOnly, 'head-chef')).toBe(true)
    expect(orderVisibleToRole(drinksOnly, 'head-chef')).toBe(false)
    expect(orderVisibleToRole(drinksOnly, 'assistant-chef')).toBe(false)
  })

  it('legacy unparseable tickets stay visible to the stations (fail open)', () => {
    expect(orderVisibleToRole(legacy, 'barista')).toBe(true)
    expect(orderVisibleToRole(legacy, 'head-chef')).toBe(true)
  })

  it('head-waiter sees his own tickets wherever they are', () => {
    const mine = order(JSON.stringify([foodLine('Chechebesa')]), { created_by: 'S-abc' })
    expect(orderVisibleToRole(mine, 'head-waiter', { myId: 'S-abc', myTables: new Set(['7']) })).toBe(true)
  })

  it('head-waiter sees tickets on his assigned tables, even when a colleague or guest fired them', () => {
    const onMyTable = order(JSON.stringify([foodLine('Chechebesa')]), { created_by: 'S-other', table_id: '7' })
    const qrOrder = order(JSON.stringify([foodLine('Chechebesa')]), { created_by: null, table_id: '7' })
    const ctx = { myId: 'S-me', myTables: new Set(['7', '12']) }
    expect(orderVisibleToRole(onMyTable, 'head-waiter', ctx)).toBe(true)
    expect(orderVisibleToRole(qrOrder, 'head-waiter', ctx)).toBe(true)
  })

  it('head-waiter does not see other waiters’ work elsewhere', () => {
    const elsewhere = order(JSON.stringify([foodLine('Chechebesa')]), { created_by: 'S-other', table_id: '3' })
    const takeaway = order(JSON.stringify([foodLine('Chechebesa')]), { created_by: 'S-other', table_id: null })
    const ctx = { myId: 'S-me', myTables: new Set(['7']) }
    expect(orderVisibleToRole(elsewhere, 'head-waiter', ctx)).toBe(false)
    expect(orderVisibleToRole(takeaway, 'head-waiter', ctx)).toBe(false)
  })

  it('head-waiter with no tables and no tickets sees nothing (empty list, not an error)', () => {
    const any = order(JSON.stringify([foodLine('Chechebesa')]), { created_by: 'S-other', table_id: '3' })
    expect(orderVisibleToRole(any, 'head-waiter', { myId: 'S-me', myTables: new Set() })).toBe(false)
    expect(orderVisibleToRole(any, 'head-waiter', { myId: 'S-me' })).toBe(false)
  })

  it('money and overview roles keep the whole list', () => {
    for (const role of ['manager', 'cashier', 'accountant', '', undefined]) {
      expect(orderVisibleToRole(drinksOnly, role)).toBe(true)
      expect(orderVisibleToRole(foodOnly, role)).toBe(true)
    }
  })
})

describe('orderLinesForRole', () => {
  const raw = JSON.stringify([drinkLine('Latte'), foodLine('Chechebesa')])

  it('barista reads drink lines only, chef reads food lines only', () => {
    expect(orderLinesForRole(order(raw), 'barista').map(l => l.name)).toEqual(['Latte'])
    expect(orderLinesForRole(order(raw), 'head-chef').map(l => l.name)).toEqual(['Chechebesa'])
  })

  it('other roles (and legacy rows) read the ticket unchanged', () => {
    expect(orderLinesForRole(order(raw), 'manager')).toBeNull()
    expect(orderLinesForRole(order('2xEspresso'), 'barista')).toBeNull()
  })
})
