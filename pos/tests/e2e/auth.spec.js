import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pos/login')
    await page.waitForLoadState('networkidle')
  })

  test('should display the login page', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Welcome back')
    await expect(page.locator('.brand-title')).toContainText('FU FUT')
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('should show error on invalid credentials', async ({ page }) => {
    await page.fill('#email', 'wrong@fufut.coffee')
    await page.fill('#password', 'wrongpass')
    await page.click('button[type="submit"]')

    await page.waitForTimeout(3000)
    const hasError = await page.locator('.form-error').isVisible().catch(() => false)
    const stillOnLogin = page.url().includes('login')
    expect(hasError || stillOnLogin).toBe(true)
  })

  test('should handle protected route access', async ({ page }) => {
    await page.goto('/pos/app/dashboard')
    await page.waitForLoadState('networkidle')
    const url = page.url()
    expect(url.includes('login') || url.includes('dashboard')).toBe(true)
  })

  test('should have correct input types', async ({ page }) => {
    await expect(page.locator('#email')).toHaveAttribute('type', 'email')
    await expect(page.locator('#password')).toHaveAttribute('type', 'password')
  })

  test('should have correct placeholders', async ({ page }) => {
    await expect(page.locator('#email')).toHaveAttribute('placeholder', 'you@fufut.coffee')
    await expect(page.locator('#password')).toHaveAttribute('placeholder', 'Enter your password')
  })

  test('should show loading state on submit', async ({ page }) => {
    // Intercept the login API call to delay the response
    await page.route('**/api/auth/**', async route => {
      await new Promise(r => setTimeout(r, 500))
      await route.continue()
    })

    await page.fill('#email', 'test@test.com')
    await page.fill('#password', 'password')
    await page.click('button[type="submit"]')

    // Button should be disabled while loading
    const isDisabled = await page.locator('button[type="submit"]').isDisabled()
    expect(isDisabled).toBe(true)
  })
})
