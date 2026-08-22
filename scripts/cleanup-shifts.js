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

    // Get all shifts and delete those with null staff_id (broken entries from earlier testing)
    const shifts = await page.evaluate(async () => {
      const r = await fetch('/api/shifts', { credentials: 'include' });
      return await r.json();
    });

    const broken = shifts.filter(s => !s.staff_id);
    console.log(`Found ${broken.length} broken shift(s) with null staff_id`);

    for (const s of broken) {
      await page.evaluate(async (id) => {
        await fetch('/api/shifts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id })
        });
      }, s.id);
      console.log(`Deleted ${s.id}`);
    }

    // Also delete the test shift we just created (Yonas, today)
    const today = new Date().toISOString().slice(0, 10);
    const testShift = shifts.find(s => s.staff_id && s.date === today && s.start_time === '07:00');
    if (testShift) {
      await page.evaluate(async (id) => {
        await fetch('/api/shifts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id })
        });
      }, testShift.id);
      console.log(`Deleted test shift ${testShift.id}`);
    }

    console.log('Cleanup done');
  } catch (e) {
    console.error(e.message);
  } finally {
    await browser.close();
  }
})();
