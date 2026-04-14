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
  console.log('Usage: node tiktok-like.js <tiktok_url> [-o output.png]');
  process.exit(1);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const profileDir = path.join(process.cwd(), 'tiktok-profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  console.log(`Opening TikTok link: ${input}`);
  try {
      await page.goto(input, {
        waitUntil: 'networkidle'
      });
  } catch (e) {
      console.log("Navigation timeout, attempting to continue anyway...");
  }

  // Ensure logged in
  if (page.url().includes('/login')) {
    console.log("❌ Not logged in. Run tiktok-login.js first.");
    process.exit(1);
  }

  await sleep(rand(3000, 6000));

  // TikTok Like button selector (data-e2e="like-icon" is common)
  const likeBtn = await page.$('[data-e2e="browse-like-icon"]') || await page.$('[data-e2e="like-icon"]');

  if (likeBtn) {
    // Check if already liked (often color changes or aria-label changes)
    const isLiked = await likeBtn.evaluate(el => {
        // This is a heuristic, might need adjustment based on TikTok's live site
        return el.innerHTML.includes('fill="rgba(255, 43, 85, 1)"') || el.classList.contains('liked');
    });

    if (!isLiked) {
        console.log("Liking video...");
        await likeBtn.click();
        await sleep(rand(1000, 3000));
    } else {
        console.log("Already liked.");
    }
  } else {
    console.log("Like button not found. Attempting to click by generic selector...");
    // Fallback: search for heart icons
    const fallbackBtn = await page.$('span[data-e2e="like-icon"]');
    if (fallbackBtn) {
        await fallbackBtn.click();
        await sleep(rand(1000, 3000));
    } else {
        console.log("Could not find like button accurately.");
    }
  }

  // Screenshot
  const proofsDir = path.join(__dirname, '..', 'proofs');
  if (!fs.existsSync(proofsDir)) {
    fs.mkdirSync(proofsDir, { recursive: true });
  }

  const fileName = outputFile || `tiktok-like-${Date.now()}.png`;
  const filePath = path.join(proofsDir, fileName);
  
  await page.screenshot({ path: filePath, fullPage: false });

  console.log(`📸 Screenshot saved: ${filePath}`);

  await sleep(rand(2000, 4000));

  await context.close();
})();
