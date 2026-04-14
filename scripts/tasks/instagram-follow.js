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
  console.log('Usage: node follow.js <instagram_url_or_username> [-o output.png]');
  process.exit(1);
}

// extract username
const match = input.match(/instagram\.com\/([^/?]+)/);
const USERNAME = match ? match[1] : input;

function rand(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const context = await chromium.launchPersistentContext('./ig-profile', {
    headless: true,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  console.log(`Opening profile: ${USERNAME}`);
  await page.goto(`https://www.instagram.com/${USERNAME}/`, {
    waitUntil: 'domcontentloaded'
  });

  // Ensure logged in
  if (page.url().includes('/accounts/login')) {
    console.log("❌ Not logged in. Run login.js first.");
    process.exit(1);
  }

  await sleep(rand(4000, 7000));

  // simulate light human behavior
  await page.mouse.wheel(0, rand(300, 800));
  await sleep(rand(2000, 5000));

  const firstPost = await page.$('article a');
  if (firstPost) {
    await firstPost.click();
    await sleep(rand(3000, 6000));
    await page.keyboard.press('Escape');
  }

  await sleep(rand(3000, 7000));

  // Follow button
  const followBtn = await page.$('button:has-text("Follow")');

  if (followBtn) {
    console.log("Following...");
    await followBtn.click();
    await sleep(rand(2000, 4000));
  } else {
    console.log("Already following or button not found.");
  }

  // Screenshot
  const proofsDir = path.join(__dirname, '..', 'proofs');
  if (!fs.existsSync(proofsDir)) {
    fs.mkdirSync(proofsDir, { recursive: true });
  }

  const fileName = outputFile || `follow-${USERNAME}-${Date.now()}.png`;
  const filePath = path.join(proofsDir, fileName);
  
  await page.screenshot({ path: filePath, fullPage: true });

  console.log(`📸 Screenshot saved: ${filePath}`);

  await sleep(rand(5000, 10000));

  await context.close();
})();