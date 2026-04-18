const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

let input = null;
let outputFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o') {
    outputFile = args[i + 1];
    i++;
  } else {
    input = args[i];
  }
}

if (!input) {
  console.log('Usage: node twitter-follow.js <twitter_url> [-o output.png]');
  process.exit(1);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const profileDir = path.join(process.cwd(), 'twitter-profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  // Normalize link for X.com
  let targetUrl = input;
  if (targetUrl.includes('twitter.com')) {
    targetUrl = targetUrl.replace('twitter.com', 'x.com');
  }

  console.log(`Opening X profile: ${targetUrl}`);
  try {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
  } catch (e) {
      console.log("Navigation timeout, attempting to continue...");
  }

  // Ensure logged in
  if (page.url().includes('/login')) {
    console.log("❌ Not logged in. Run twitter-login.js first.");
    process.exit(1);
  }

  await sleep(rand(4000, 7000));

  // Twitter Follow button logic
  // X uses aria-labels frequently. "Follow @username"
  const followBtn = await page.$('[data-testid$="-follow"]') || 
                    await page.$('button:has-text("Follow")') ||
                    await page.$('[aria-label^="Follow"]');

  if (followBtn) {
    const btnText = await followBtn.innerText();
    if (btnText.includes('Follow') && !btnText.includes('Following')) {
        console.log("Following...");
        await followBtn.click();
        await sleep(rand(2000, 4000));
    } else {
        console.log("Already following or button in different state.");
    }
  } else {
    console.log("Follow button not found.");
  }

  // Screenshot
  const proofsDir = path.join(__dirname, '..', 'proofs');
  if (!fs.existsSync(proofsDir)) {
    fs.mkdirSync(proofsDir, { recursive: true });
  }

  const fileName = outputFile || `twitter-follow-${Date.now()}.png`;
  const filePath = path.join(proofsDir, fileName);
  
  await page.screenshot({ path: filePath, fullPage: true });

  console.log(`📸 Screenshot saved: ${filePath}`);

  await sleep(rand(3000, 5000));

  await context.close();
})();
