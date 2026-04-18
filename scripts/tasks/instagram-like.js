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
  console.log('Usage: node instagram-like.js <post_url> [-o output.png]');
  process.exit(1);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const profileDir = path.join(__dirname, '..', '..', 'ig-profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  console.log(`Opening post: ${input}`);
  await page.goto(input, {
    waitUntil: 'domcontentloaded'
  });

  // Ensure logged in
  if (page.url().includes('/accounts/login')) {
    console.log("❌ Not logged in. Run login.js first.");
    await context.close();
    process.exit(1);
  }

  await sleep(rand(5000, 8000));

  // Target the SVG for the main post specifically by its size (24px)
  // Comment Like buttons are typically smaller (12px)
  const mainLikeLocator = page.locator('svg[aria-label="Like"][width="24"]').first();
  const mainUnlikeLocator = page.locator('svg[aria-label="Unlike"][width="24"]').first();

  if (await mainUnlikeLocator.isVisible()) {
    console.log("Post already liked (Unlike button visible).");
  } else if (await mainLikeLocator.isVisible()) {
    console.log("Liking main post...");
    await mainLikeLocator.scrollIntoViewIfNeeded();
    await sleep(1000);
    
    // Try to click the parent button relative to this SVG
    const parentButton = mainLikeLocator.locator('xpath=./ancestor::div[@role="button"]').first();
    
    if (await parentButton.isVisible()) {
        await parentButton.hover();
        await sleep(rand(500, 1000));
        await parentButton.click();
    } else {
        await mainLikeLocator.hover();
        await sleep(rand(500, 1000));
        await mainLikeLocator.click();
    }
    
    console.log("Wait for Like to register...");
    await sleep(rand(4000, 6000));
  } else {
    console.log("Like button (24px) not found. Checking for any Like button...");
    const anyLike = page.locator('svg[aria-label="Like"]').first();
    if (await anyLike.isVisible()) {
        await anyLike.scrollIntoViewIfNeeded();
        await anyLike.click();
        console.log("Clicked first available Like button.");
        await sleep(rand(4000, 6000));
    } else {
        console.log("Could not find any Like button.");
    }
  }

  // Screenshot
  const proofsDir = path.join(__dirname, '..', 'proofs');
  if (!fs.existsSync(proofsDir)) {
    fs.mkdirSync(proofsDir, { recursive: true });
  }

  const fileName = outputFile || `like-${Date.now()}.png`;
  const filePath = path.join(proofsDir, fileName);
  
  await page.screenshot({ path: filePath });

  console.log(`📸 Screenshot saved: ${filePath}`);

  await sleep(rand(3000, 5000));

  await context.close();
})();
