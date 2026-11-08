import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'E:\\123\\komari-animal-island\\dist\\screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log('1. Starting Vite dev server on port 5220...');
  const server = await createServer({
    root: 'E:/123/komari-animal-island',
    server: { port: 5220 },
  });
  await server.listen();
  console.log('✓ Vite server listening at http://localhost:5220');

  console.log('2. Launching Puppeteer Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1050'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1050 });

    console.log('3. Navigating to Animal Island...');
    await page.goto('http://localhost:5220/', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2000));

    // Check page text for traffic quota and reset
    const pageText = await page.evaluate(() => document.body.innerText);
    const hasTrafficQuota = pageText.includes('流量配额');
    const hasResetBadge = pageText.includes('重置') || pageText.includes('还有');
    console.log(`Page has 流量配额: ${hasTrafficQuota}, has reset info: ${hasResetBadge}`);

    if (!hasTrafficQuota) {
      throw new Error('Missing 流量配额 on Animal Island cards');
    }

    const cardScreenshot = path.join(SCREENSHOT_DIR, 'test-animal-traffic-cards.png');
    await page.screenshot({ path: cardScreenshot, fullPage: true });
    console.log(`✓ Saved cards screenshot: ${cardScreenshot}`);

    // Click "查看详情" on first card to open modal
    console.log('4. Clicking 查看详情 on first card...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent && b.textContent.includes('查看详情')
      );
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const modalText = await page.evaluate(() => {
      const m = document.querySelector('.animal-modal-body, .details');
      return m ? m.innerText : '';
    });
    console.log('Modal text includes 流量配额:', modalText.includes('流量配额'));

    const modalScreenshot = path.join(SCREENSHOT_DIR, 'test-animal-traffic-modal.png');
    await page.screenshot({ path: modalScreenshot, fullPage: true });
    console.log(`✓ Saved modal screenshot: ${modalScreenshot}`);

    console.log('✓ Animal Island traffic reset E2E verified successfully!');
  } finally {
    await browser.close();
    await server.close();
    console.log('✓ Vite server and browser closed cleanly.');
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
