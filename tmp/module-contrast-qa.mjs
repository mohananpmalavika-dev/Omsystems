import { chromium } from '../node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await page.context().addCookies([{ name: 'sentinel_access', value: 'qa', domain: '127.0.0.1', path: '/' }]);
await page.route(/\/(api|v1)\//, route => route.fulfill({ status: route.request().url().includes('/auth/me') ? 200 : 503, json: { id: 'qa', role: 'superadmin' } }));
await page.goto('http://127.0.0.1:3000/modules', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
for (const theme of ['light', 'dark']) {
  await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.classList.toggle('dark', theme === 'dark'); }, theme);
  console.log(theme, await page.evaluate(() => Object.fromEntries(['.page-hero-status strong', '.directory-quick-actions h2', '.directory-quick-actions a strong'].map(selector => [selector, getComputedStyle(document.querySelector(selector)).color]))));
  await page.screenshot({ path: `tmp/experience-qa/modules-${theme}-contrast.png` });
}
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(700);
console.log('Mobile overflow:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
await browser.close();
