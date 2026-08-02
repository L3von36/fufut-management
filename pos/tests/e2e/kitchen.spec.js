import { test, expect } from '@playwright/test'

test.describe('Login Page Rendering', () => {
  test('should render brand identity', async ({ page }) => {
    await page.goto('/pos/login')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.brand-title')).toContainText('FU FUT')
    await expect(page.locator('.brand-sub')).toContainText('COFFEE')
    await expect(page.locator('.brand-sub')).toContainText('POS')
  })

  test('should have accessible form labels', async ({ page }) => {
    await page.goto('/pos/login')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('label[for="email"]')).toBeVisible()
    await expect(page.locator('label[for="password"]')).toBeVisible()
  })

  test('should have form-footer branding', async ({ page }) => {
    await page.goto('/pos/login')
    await page.waitForLoadState('networkidle')
    const footer = page.locator('.form-footer')
    await expect(footer).toContainText('FU FUT COFFEE')
  })

  test('email and password fields should be required', async ({ page }) => {
    await page.goto('/pos/login')
    await page.waitForLoadState('networkidle')
    const isRequired = await page.locator('#email').evaluate(el => el.required)
    const pwdRequired = await page.locator('#password').evaluate(el => el.required)
    expect(isRequired).toBeTruthy()
    expect(pwdRequired).toBeTruthy()
  })
})
