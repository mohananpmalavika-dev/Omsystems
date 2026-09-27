import { chromium } from '../node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.route(/^https?:/, route => route.fulfill({ status: 503, json: { message: 'Offline visual preview' } }));
for (const name of ['index', 'bulk-upload', 'forensic-verifier', 'krypton-ai-features']) {
  await page.goto(`file:///C:/Omsystems/Omsystems/public/${name}.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `tmp/experience-qa/utility-${name}.png` });
  console.log(name, await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent, background: getComputedStyle(document.body).backgroundImage, overflow: document.documentElement.scrollWidth > innerWidth })));
  await page.setViewportSize({ width:390, height:844 });
  await page.screenshot({ path: `tmp/experience-qa/utility-${name}-mobile.png` });
  console.log('mobile overflow:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await page.setViewportSize({ width:1440, height:1000 });
}
await browser.close();
