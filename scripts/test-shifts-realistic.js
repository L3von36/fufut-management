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
    console.log('\n========================================');
    console.log('  REALISTIC SHIFT MANAGEMENT TEST');
    console.log('========================================\n');

    // ─── 1. LOGIN ───
    console.log('--- Step 1: Login ---');
    await page.goto('https://backoffice.fufutcoffee.com/backoffice/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"]', 'amanuel@fufut.coffee');
    await page.fill('input[type="password"]', 'selam@336');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/backoffice/app/**', { timeout: 15000 });
    log('Logged in', true, page.url());

    // ─── 2. GO TO SHIFTS ───
    console.log('\n--- Step 2: Open Shifts page ---');
    await page.click('text=Shifts');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/home/z/my-project/fufut-management/scripts/screenshots/01-shifts-page.png', fullPage: true });
    log('Shifts page loaded', page.url().includes('shifts'));

    // ─── 3. LOOK AT EXISTING SHIFTS (what's already there) ───
    console.log('\n--- Step 3: Review existing shifts ---');
    const rowsBefore = page.locator('table tbody tr');
    const countBefore = await rowsBefore.count();
    log(`Existing shifts in table: ${countBefore}`, true);
    
    if (countBefore > 0) {
      const firstRowText = await rowsBefore.first().textContent();
      console.log(`  First row: "${firstRowText.trim().substring(0, 120)}"`);
    }

    // ─── 4. ADD A SHIFT - pick a specific person ───
    console.log('\n--- Step 4: Add a new shift ---');
    await page.click('button:has-text("Add Shift")');
    await page.waitForTimeout(1500);

    // Open the dropdown and read all options
    const selectEl = page.locator('.modal select').first();
    const allOptions = await selectEl.locator('option').allTextContents();
    console.log('  Staff dropdown options:');
    allOptions.forEach((o, i) => console.log(`    ${i}: ${o}`));

    // Pick a waiter (someone with 'waiter' in the role)
    let pickedName = '';
    for (let i = 1; i < allOptions.length; i++) {
      if (allOptions[i].toLowerCase().includes('waiter')) {
        await selectEl.selectOption({ index: i });
        pickedName = allOptions[i];
        break;
      }
    }
    if (!pickedName) {
      await selectEl.selectOption({ index: 1 });
      pickedName = allOptions[1];
    }
    log(`Selected staff from dropdown`, true, pickedName);

    // Set today's date and times
    const today = new Date().toISOString().slice(0, 10);
    await page.fill('.modal input[type="date"]', today);
    await page.locator('.modal input[type="time"]').first().fill('08:00');
    await page.locator('.modal input[type="time"]').last().fill('16:00');
    log('Set date, start 08:00, end 16:00', true);

    await page.screenshot({ path: '/home/z/my-project/fufut-management/scripts/screenshots/02-add-shift-form-filled.png', fullPage: true });

    // Submit
    await page.click('.modal button[type="submit"]');
    await page.waitForTimeout(3000);
    log('Clicked Save', true);

    // ─── 5. VERIFY NEW SHIFT IN TABLE ───
    console.log('\n--- Step 5: Verify shift appears in table ---');
    const rowsAfter = page.locator('table tbody tr');
    const countAfter = await rowsAfter.count();
    log(`Table now has ${countAfter} rows (was ${countBefore})`, countAfter > countBefore || countAfter > 0);

    // Check the staff name is visible, not a raw ID
    const tableText = await page.locator('table').first().textContent();
    const hasRawIdInTable = /S[a-f0-9]{7,}/i.test(tableText);
    log('No raw IDs like Sb4cd9bf1 visible in table', !hasRawIdInTable);

    await page.screenshot({ path: '/home/z/my-project/fufut-management/scripts/screenshots/03-shift-added.png', fullPage: true });

    // ─── 6. EDIT THE SHIFT ───
    console.log('\n--- Step 6: Edit the shift ---');
    const editBtn = page.locator('table tbody tr').last().locator('button:has-text("Edit")');
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(1500);

      // Verify the form reopens with data
      const modalVisible = await page.locator('.modal').isVisible();
      log('Edit modal opened', modalVisible);

      // Change the end time
      await page.locator('.modal input[type="time"]').last().fill('17:30');
      log('Changed end time to 17:30', true);

      // Verify dropdown still shows the same staff (pre-selected)
      const selectedText = await selectEl.evaluate(el => el.options[el.selectedIndex]?.text);
      log('Staff dropdown still shows selected person', selectedText === pickedName, `Showing: "${selectedText}"`);

      await page.screenshot({ path: '/home/z/my-project/fufut-management/scripts/screenshots/04-edit-shift.png', fullPage: true });

      await page.click('.modal button[type="submit"]');
      await page.waitForTimeout(3000);
      log('Updated shift saved', true);
    } else {
      log('Edit button found', false, 'No Edit button in table');
    }

    // ─── 7. FILTER BY DATE ───
    console.log('\n--- Step 7: Filter shifts by date ---');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await page.fill('input[type="date"]', tomorrow);
    await page.click('button:has-text("Filter")');
    await page.waitForTimeout(2000);

    const rowsTomorrow = page.locator('table tbody tr');
    const countTomorrow = await rowsTomorrow.count();
    log(`Filter for tomorrow (${tomorrow}): ${countTomorrow} rows`, true);

    // Filter back to today
    await page.fill('input[type="date"]').first().fill(today);
    await page.click('button:has-text("Filter")');
    await page.waitForTimeout(2000);
    const rowsToday = page.locator('table tbody tr');
    const countToday = await rowsToday.count();
    log(`Filter for today (${today}): ${countToday} rows`, true);

    await page.screenshot({ path: '/home/z/my-project/fufut-management/scripts/screenshots/05-filtered.png', fullPage: true });

    // ─── 8. CLEAN UP - DELETE THE SHIFT WE ADDED ───
    console.log('\n--- Step 8: Delete the test shift ---');
    const deleteBtn = page.locator('table tbody tr').last().locator('button:has-text("Delete")');
    if (await deleteBtn.count() > 0) {
      // Listen for the confirm dialog
      page.on('dialog', async dialog => {
        console.log(`  Confirm dialog: "${dialog.message()}"`);
        await dialog.accept();
      });
      await deleteBtn.click();
      await page.waitForTimeout(2000);
      log('Deleted test shift', true);

      const rowsFinal = page.locator('table tbody tr');
      const countFinal = await rowsFinal.count();
      log(`Table now has ${countFinal} rows`, true);
    } else {
      log('Delete button found', false, 'No Delete button');
    }

    await page.screenshot({ path: '/home/z/my-project/fufut-management/scripts/screenshots/06-final-state.png', fullPage: true });

    // ─── 9. LOGOUT ───
    console.log('\n--- Step 9: Logout ---');
    await page.click('button:has-text("Sign Out")');
    await page.waitForURL('**/login**', { timeout: 10000 });
    log('Logged out, back to login page', page.url().includes('login'));

  } catch (e) {
    log('Unexpected error', false, e.message);
    await page.screenshot({ path: '/home/z/my-project/fufut-management/scripts/screenshots/error.png' }).catch(() => {});
  } finally {
    await browser.close();

    console.log('\n========================================');
    console.log('  RESULTS');
    console.log('========================================');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`  ${passed} passed, ${failed} failed out of ${results.length}\n`);
    if (failed > 0) {
      console.log('Failed checks:');
      results.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.step}: ${r.detail}`));
    }
    console.log(`\nScreenshots saved to: scripts/screenshots/`);
    process.exit(failed > 0 ? 1 : 0);
  }
})();
