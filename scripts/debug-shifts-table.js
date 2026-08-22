const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await page.goto('https://backoffice.fufutcoffee.com/backoffice/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"]', 'amanuel@fufut.coffee');
    await page.fill('input[type="password"]', 'selam@336');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/backoffice/app/**', { timeout: 15000 });

    await page.click('text=Shifts');
    await page.waitForTimeout(3000);

    // Screenshot the table
    await page.screenshot({ path: '/home/z/my-project/fufut-management/scripts/shifts-table.png', fullPage: false });
    console.log('Screenshot saved');

    // Intercept the API response to see what shifts data looks like
    const apiResponse = await page.evaluate(async () => {
      const r = await fetch('/api/shifts', { credentials: 'include' });
      return await r.json();
    });
    console.log('\n=== API /api/shifts response ===');
    console.log(JSON.stringify(apiResponse, null, 2));

    // Also check what the table HTML looks like
    const tableHTML = await page.locator('table').first().innerHTML().catch(() => 'no table');
    console.log('\n=== Table HTML (first 2000 chars) ===');
    console.log(tableHTML.substring(0, 2000));

  } catch (e) {
    console.error(e.message);
  } finally {
    await browser.close();
  }
})();
