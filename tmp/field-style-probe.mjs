import { chromium } from '../node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await page.context().addCookies([{ name: 'sentinel_access', value: 'qa', domain: '127.0.0.1', path: '/' }]);
await page.route(/\/(api|v1)\//, route => route.fulfill({ status: route.request().url().includes('/auth/me') ? 200 : 503, json: { id: 'qa', role: 'superadmin' } }));
for (const route of ['/maintenance', '/modules', '/compliance/risks', '/communications/calls']) {
  await page.goto('http://127.0.0.1:3000' + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(800);
  console.log(route, await page.evaluate(() => ['.page-hero', '.maintenance-summary-grid', '.maintenance-summary-card', '.workspace-heading'].map(selector => { const el = document.querySelector(selector); if (!el) return null; const s = getComputedStyle(el); return { selector, classes: el.className, grid: s.gridTemplateColumns, background: s.background, color: s.color }; })));
}
await browser.close();
