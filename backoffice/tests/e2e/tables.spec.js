import { test, expect, ORDERS, STAFF, DELIVERY } from '../support/fixtures.js'

/**
 * Characterization coverage for the table screens, written immediately before
 * they are migrated onto a shared BaseTable component.
 *
 * These describe what the tables render **today**. The migration has to leave
 * every one of them passing untouched; a test here that needs editing during
 * the refactor is evidence the refactor changed behaviour, which is exactly
 * what this suite exists to catch.
 *
 * They assert what a person would look at — a row count, the text in a cell,
 * whether a badge is actually styled — rather than internal structure, so they
 * survive the markup changing underneath them. That is the whole point: a test
 * coupled to the current DOM would have to be rewritten by the migration and
 * would therefore prove nothing about it.
 */

test.describe('Orders table', () => {
  test('renders a row per order with its id, items and time', async ({ app, page }) => {
    await app.goto('orders')

    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(ORDERS.length)
    await expect(page.locator('table')).toContainText('O-alpha')
    await expect(page.locator('table')).toContainText('2x Macchiato, 1x Tea')
  })

  /**
   * `created` is UTC and the clock on the wall is UTC+3. A 22:30 stamp is a
   * 01:30 sale, and the kitchen was being shown the UTC time.
   */
  test('shows local time, not UTC', async ({ app, page }) => {
    await app.goto('orders')
    const row = page.locator('table tbody tr', { hasText: 'O-delta' })
    await expect(row).toContainText('01:30')
    await expect(row).not.toContainText('22:30')
  })

  /**
   * Revenue counted cancelled and voided orders. 550 + 900 + 400 + 300 = 2150
   * gross; the honest figure is 550 − 50 tip + 300 = 800.
   */
  test('net sales excludes cancelled, voided and tips', async ({ app, page }) => {
    await app.goto('orders')
    const summary = page.locator('.summary-grid')
    await expect(summary).toContainText('800')
    await expect(summary).not.toContainText('2150')
    await expect(summary).toContainText('2 excluded')
  })

  test('every status badge is actually styled', async ({ app, page }) => {
    await app.goto('orders')
    // A badge whose class does not exist renders with no background — the
    // silent failure this replaces. Transparent means unstyled.
    const badges = page.locator('table tbody .badge')
    const count = await badges.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const bg = await badges.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(bg, `badge ${i} is unstyled`).not.toBe('rgba(0, 0, 0, 0)')
    }
  })

  test('says why the table is empty rather than just showing nothing', async ({ app, page }) => {
    app.mockApi.set('orders', [])
    await app.goto('orders')
    await expect(page.locator('table tbody')).toContainText('No orders')
  })

  test('paginates rather than rendering every row', async ({ app, page }) => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      ...ORDERS[0], id: `O-${i}`, status: 'fulfilled',
    }))
    app.mockApi.set('orders', many)
    await app.goto('orders')

    // 50 to a page, not 120 in the DOM.
    await expect(page.locator('table tbody tr')).toHaveCount(50)
    await expect(page.locator('.pagination')).toContainText('1–50 of 120')

    await page.locator('.pagination button', { hasText: 'Next' }).click()
    await expect(page.locator('.pagination')).toContainText('51–100 of 120')
  })
})

test.describe('Delivery table', () => {
  /**
   * The defect that motivated the badge composable: `picked_up` and
   * `out_for_delivery` had no CSS class, so a driver's two busiest states
   * rendered as bare text.
   */
  test('styles every lifecycle status, including picked_up', async ({ app, page }) => {
    await app.goto('delivery')

    const badges = page.locator('table tbody .badge')
    await expect(badges).toHaveCount(DELIVERY.length)
    for (let i = 0; i < DELIVERY.length; i++) {
      const bg = await badges.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(bg, `status badge ${i} is unstyled`).not.toBe('rgba(0, 0, 0, 0)')
    }
  })

  test('renders machine statuses readably', async ({ app, page }) => {
    await app.goto('delivery')
    await expect(page.locator('table')).toContainText('Out for delivery')
    await expect(page.locator('table')).not.toContainText('out_for_delivery')
  })
})

test.describe('Staff table', () => {
  test('shows the email each account signs in with', async ({ app, page }) => {
    await app.goto('staff')
    await expect(page.locator('table')).toContainText('selam@fufut.coffee')
  })

  /** An account with no email cannot log in; that has to be visible. */
  test('flags an account that cannot sign in', async ({ app, page }) => {
    await app.goto('staff')
    const row = page.locator('table tbody tr', { hasText: 'Nohemail' })
    await expect(row).toContainText('cannot sign in')
  })

  test('offers a role selector showing the current role', async ({ app, page }) => {
    await app.goto('staff')
    const row = page.locator('table tbody tr', { hasText: 'Selam' })
    // The dropdown rendered blank for every row when stored roles were title
    // case and the options were canonical.
    await expect(row.locator('select')).toHaveValue('head-chef')
  })
})

test.describe('Table conventions that must survive the refactor', () => {
  test('a wide table freezes its first column', async ({ app, page }) => {
    await app.goto('orders')
    const firstCell = page.locator('table tbody tr td').first()
    await expect(firstCell).toHaveCSS('position', 'sticky')
  })

  test('every table scrolls horizontally rather than overflowing the page', async ({ app, page }) => {
    await app.goto('orders')
    await expect(page.locator('.table-scroll')).toHaveCSS('overflow-x', 'auto')
  })

  test('keyboard focus is visible on a table control', async ({ app, page }) => {
    await app.goto('staff')
    const button = page.locator('table tbody button').first()
    await button.focus()
    const outline = await button.evaluate((el) => getComputedStyle(el).outlineWidth)
    expect(outline, 'no focus ring — keyboard users cannot see where they are').not.toBe('0px')
  })
})
