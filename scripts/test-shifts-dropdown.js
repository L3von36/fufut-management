const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const results = [];

  function log(step, pass, detail) {
    const icon = pass ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${step}${detail ? ': ' + detail : ''}`);
    results.push({ step, pass, detail: detail || '' });
  }

  try {
    console.log('\n=== Testing Backoffice Shifts Dropdown ===\n');
    await page.goto('https://backoffice.fufutcoffee.com/backoffice/login', { waitUntil: 'networkidle', timeout: 30000 });
    log('Navigate to login page', page.url().includes('login'));

    await page.fill('input[type="email"], input[placeholder*="email"], input[name="email"]', 'amanuel@fufut.coffee');
    await page.fill('input[type="password"]', 'selam@336');
    await page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
    await page.waitForURL('**/backoffice/app/**', { timeout: 15000 });
    log('Login as manager', page.url().includes('/backoffice/app/'), 'URL: ' + page.url());

    await page.click('text=Shifts');
    await page.waitForTimeout(3000);
    log('Navigate to Shifts page', true, 'URL: ' + page.url());

    const addBtn = page.locator('button:has-text("Add Shift")');
    await addBtn.click();
    await page.waitForTimeout(1000);
    log('Click Add Shift button', true);

    await page.waitForTimeout(2000);
    
    const selectEl = page.locator('.modal select, .form-group select');
    const selectCount = await selectEl.count();
    const hasSelectForStaff = selectCount > 0;
    
    const staffInput = page.locator('.modal input:not([type="date"]):not([type="time"]):not([type="hidden"])');
    const inputCount = await staffInput.count();
    
    log('Staff field is a <select> dropdown', hasSelectForStaff, `Found ${selectCount} select element(s) in form`);
    log('No raw text input for Staff ID', inputCount === 0, `Found ${inputCount} non-date/time input(s) — should be 0`);

    if (hasSelectForStaff) {
      const options = await selectEl.first().locator('option').allTextContents();
      const placeholder = options[0] || '';
      const hasPlaceholder = placeholder.toLowerCase().includes('select');
      log('Dropdown has placeholder text', hasPlaceholder, `Placeholder: "${placeholder}"`);

      const nameOptions = options.filter(o => o && /[A-Za-z]{2,}/.test(o) && !o.toLowerCase().includes('select'));
      const hasNames = nameOptions.length > 0;
      log('Dropdown shows staff names', hasNames, `${nameOptions.length} options with real names. Examples: ${nameOptions.slice(0, 3).join(', ')}`);

      const rawIdOptions = nameOptions.filter(o => /^S[a-f0-9]{6,}$/i.test(o.trim()));
      log('No raw IDs visible in dropdown', rawIdOptions.length === 0, rawIdOptions.length > 0 ? `Found IDs: ${rawIdOptions.join(', ')}` : 'All options show names');
    }

    if (hasSelectForStaff) {
      await selectEl.first().selectOption({ index: 1 });
      const selectedValue = await selectEl.first().inputValue();
      log('Selected a staff member', true, `Selected ID: ${selectedValue}`);

      await page.fill('input[type="date"]', new Date().toISOString().slice(0, 10));
      await page.fill('input[type="time"]', '08:00');
      const timeInputs = page.locator('.modal input[type="time"]');
      if ((await timeInputs.count()) >= 2) {
        await timeInputs.nth(1).fill('17:00');
      }
      log('Filled form fields', true);

      await page.click('button[type="submit"], button:has-text("Save")');
      await page.waitForTimeout(3000);
      log('Submitted shift form', true);
    }

    await page.waitForTimeout(2000);
    const tableRows = page.locator('.table-wrap table tbody tr, base-table table tbody tr');
    const rowCount = await tableRows.count();
    log('Table has shift entries', rowCount > 0, `${rowCount} rows in table`);

    if (rowCount > 0) {
      const firstRowText = await tableRows.first().textContent();
      const hasRawId = /S[a-f0-9]{7,}/i.test(firstRowText);
      const hasName = /[A-Za-z][a-z]+ [A-Za-z][a-z]+/.test(firstRowText);
      log('Table shows staff names not IDs', !hasRawId && hasName, hasName ? 'Names found in table' : (hasRawId ? 'Raw IDs still visible!' : 'No clear names detected'));
    }

  } catch (e) {
    log('Unexpected error', false, e.message);
  } finally {
    await browser.close();

    console.log('\n=== Results ===');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`  ${passed} passed, ${failed} failed out of ${results.length} checks`);
    if (failed > 0) {
      console.log('\nFailed checks:');
      results.filter(r => !r.pass).forEach(r => console.log(`  - ${r.step}: ${r.detail}`));
    }
    process.exit(failed > 0 ? 1 : 0);
  }
})();
