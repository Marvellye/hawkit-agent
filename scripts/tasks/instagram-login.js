const { chromium } = require('playwright');

(async () => {
  const context = await chromium.launchPersistentContext('./ig-profile', {
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(0);

  console.log("Opening Instagram...");
  await page.goto('https://www.instagram.com/', {
    waitUntil: 'domcontentloaded'
  });

  console.log("👉 Please log in manually...");

  // Wait until login is complete
  await page.waitForFunction(() => {
    return !window.location.href.includes('/accounts/login');
  }, { timeout: 0 });

  console.log("✅ Login successful. Session saved.");

  // Give you time to handle popups (important)
  await page.waitForTimeout(15000);

  await context.close();
})();