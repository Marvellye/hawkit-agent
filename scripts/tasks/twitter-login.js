const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const profileDir = path.join(process.cwd(), 'twitter-profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(0);

  console.log("Opening X (Twitter)...");
  await page.goto('https://x.com/login', {
    waitUntil: 'domcontentloaded'
  });

  console.log("👉 Please log in manually...");

  // Wait until login is complete
  await page.waitForFunction(() => {
    return !window.location.href.includes('/login') && window.location.href.includes('x.com');
  }, { timeout: 0 });

  console.log("✅ Login successful. Session saved in 'twitter-profile'.");

  // Give you time to handle any popups
  await page.waitForTimeout(10000);

  await context.close();
})();
