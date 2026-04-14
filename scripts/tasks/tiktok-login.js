const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const profileDir = path.join(process.cwd(), 'tiktok-profile');

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  console.log("Opening TikTok...");
  await page.goto('https://www.tiktok.com/login');

  console.log("👉 Log in manually, then press ENTER here...");

  await new Promise(resolve => process.stdin.once('data', resolve));

  console.log("✅ Session saved.");

  await context.close();
})();