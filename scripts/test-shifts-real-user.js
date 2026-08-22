const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log('\n========================================');
  console.log('  Real-user shift management test');
  console.log('========================================\n');

  try {
    // ── 1. Login ──
    console.log('1. Logging in as manager...');
    await page.goto('https://backoffice.fufutcoffee.com/backoffice/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"]', 'amanuel@fufut.coffee');
    await page.fill('input[type="password"]', 'selam@336');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/backoffice/app/**', { timeout: 15000 });
    console.log('   -> Logged in, on: ' + page.url());

    // ── 2. Go to Shifts ──
    console.log('\n2. Navigating to Shifts...');
    await page.click('text=Shifts');
    await page.waitForTimeout(3000);
    console.log('   -> On: ' + page.url());

    // ── 3. Look at the existing table ──
    console.log('\n3. Reviewing existing shifts...');
    const rowsBefore = page.locator('table tbody tr');
    const countBefore = await rowsBefore.count();
    console.log(`   -> ${countBefore} existing shift(s) in the table`);

    if (countBefore > 0) {
      for (let i = 0; i < Math.min(countBefore, 3); i++) {
        const text = (await rowsBefore.nth(i).textContent()).trim().replace(/\s+/g, ' | ');
        console.log(`   -> Row ${i + 1}: ${text}`);
      }
    }

    // ── 4. Open Add Shift form ──
    console.log('\n4. Opening the Add Shift form...');
    await page.click('button:has-text("Add Shift")');
    await page.waitForTimeout(1500);

    // Screenshot the modal
    const modal = page.locator('.modal');
    if (await modal.isVisible()) {
      console.log('   -> Modal is open');
    } else {
      console.log('   -> WARNING: Modal not found, looking for form...');
    }

    // ── 5. Look at the dropdown options like a user would ──
    console.log('\n5. Checking what the staff dropdown shows...');
    const select = page.locator('.modal select');
    const options = await select.locator('option').allTextContents();
    console.log(`   -> ${options.length - 1} staff members available:`);
    for (let i = 1; i < options.length; i++) {
      console.log(`      ${i}. ${options[i]}`);
    }

    // ── 6. Pick a specific staff member (a waiter) ──
    console.log('\n6. Selecting a waiter for a morning shift...');
    // Find an option that contains 'waiter' (case insensitive)
    let targetIndex = -1;
    let targetName = '';
    for (let i = 1; i < options.length; i++) {
      if (options[i].toLowerCase().includes('waiter')) {
        targetIndex = i;
        targetName = options[i];
        break;
      }
    }
    if (targetIndex === -1) {
      // fallback: pick the first non-placeholder option
      targetIndex = 1;
      targetName = options[1];
    }
    await select.selectOption({ index: targetIndex });
    console.log(`   -> Selected: ${targetName}`);

    // ── 7. Set today's date and shift times ──
    console.log('\n7. Setting shift details...');
    const today = new Date().toISOString().slice(0, 10);
    await page.fill('.modal input[type="date"]', today);
    console.log(`   -> Date: ${today}`);

    const timeInputs = page.locator('.modal input[type="time"]');
    await timeInputs.first().fill('07:00');
    console.log('   -> Start: 07:00');

    if ((await timeInputs.count()) >= 2) {
      await timeInputs.nth(1).fill('15:00');
      console.log('   -> End: 15:00');
    }

    // ── 8. Save the shift ──
    console.log('\n8. Saving the shift...');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Check if modal closed
    const modalVisible = await modal.isVisible().catch(() => false);
    if (!modalVisible) {
      console.log('   -> Modal closed after save');
    } else {
      // Check for error messages
      const errorText = await page.locator('.modal').textContent().catch(() => '');
      console.log('   -> Modal still open. Content: ' + errorText.substring(0, 200));
    }

    // ── 9. Verify the new shift appears in the table ──
    console.log('\n9. Checking the table for the new shift...');
    const rowsAfter = page.locator('table tbody tr');
    const countAfter = await rowsAfter.count();
    console.log(`   -> ${countAfter} shift(s) in table now (was ${countBefore})`);

    // Find the row with today's date
    let foundNewShift = false;
    for (let i = 0; i < countAfter; i++) {
      const text = (await rowsAfter.nth(i).textContent()).trim();
      if (text.includes(today)) {
        console.log(`   -> Found today's shift: ${text.replace(/\s+/g, ' | ')}`);
        foundNewShift = true;

        // Check it has a name, not a raw ID
        const hasName = /[A-Za-z]{2,} [A-Za-z]{2,}/.test(text);
        const hasRawId = /S[a-f0-9]{7,}/i.test(text);
        if (hasName && !hasRawId) {
          console.log('   -> Staff name displayed correctly (no raw ID)');
        } else if (hasRawId) {
          console.log('   -> WARNING: Raw staff ID still showing in table!');
        }
        break;
      }
    }

    // ── 10. Try editing the shift we just created ──
    if (foundNewShift && countAfter > 0) {
      console.log('\n10. Editing the shift...');
      // Find the edit button in the row with today's date
      const todayRow = rowsAfter.locator(`:has-text("${today}")`).first();
      const editBtn = todayRow.locator('button:has-text("Edit")');
      if (await editBtn.isVisible()) {
        await editBtn.click();
        await page.waitForTimeout(1500);

        // Change the end time
        const editTimeInputs = page.locator('.modal input[type="time"]');
        if ((await editTimeInputs.count()) >= 2) {
          await editTimeInputs.nth(1).fill('16:00');
          console.log('   -> Changed end time to 16:00');
        }

        await page.click('button[type="submit"]');
        await page.waitForTimeout(3000);
        console.log('   -> Shift updated');

        // Verify the update
        const updatedRows = page.locator('table tbody tr');
        for (let i = 0; i < await updatedRows.count(); i++) {
          const text = (await updatedRows.nth(i).textContent()).trim();
          if (text.includes(today) && text.includes('16:00')) {
            console.log(`   -> Verified: ${text.replace(/\s+/g, ' | ')}`);
            break;
          }
        }
      } else {
        console.log('   -> No Edit button found on the row');
      }
    }

    // ── 11. Delete the test shift we created ──
    console.log('\n11. Cleaning up — deleting the test shift...');
    const finalRows = page.locator('table tbody tr');
    const finalCount = await finalRows.count();
    for (let i = 0; i < finalCount; i++) {
      const text = await finalRows.nth(i).textContent();
      if (text.includes(today) && text.includes('16:00')) {
        const deleteBtn = finalRows.nth(i).locator('button:has-text("Delete")');
        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();
          await page.waitForTimeout(500);
          // Handle confirm dialog if any
          const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button.btn-primary');
          if (await confirmBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
            await confirmBtn.first().click();
          }
          await page.waitForTimeout(2000);
          console.log('   -> Test shift deleted');
        }
        break;
      }
    }

    // ── 12. Final table state ──
    console.log('\n12. Final state of the shifts table:');
    const endRows = page.locator('table tbody tr');
    const endCount = await endRows.count();
    console.log(`   -> ${endCount} shift(s) remaining`);

    // ── 13. Logout ──
    console.log('\n13. Signing out...');
    await page.click('button:has-text("Sign Out"), a:has-text("Sign Out")');
    await page.waitForTimeout(2000);
    console.log('   -> On: ' + page.url());
    console.log(page.url().includes('login') ? '   -> Successfully logged out' : '   -> WARNING: Not on login page');

    console.log('\n========================================');
    console.log('  Test complete — all steps finished');
    console.log('========================================\n');

  } catch (e) {
    console.error('\nERROR: ' + e.message);
    // Take a screenshot for debugging
    await page.screenshot({ path: '/home/z/my-project/fufut-management/scripts/shift-test-error.png' });
    console.log('Screenshot saved to scripts/shift-test-error.png');
  } finally {
    await browser.close();
  }
})();
