import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('sentinel-grid-active-theme', 'emerald'));
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(1000);
  const cssUrls = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href));
  const oldWorker = `self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.url.includes('/_next/static/'))e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});`;
  await context.route('**/sw.js', route => route.fulfill({ contentType: 'application/javascript', body: oldWorker }));
  await page.evaluate(async cssUrls => {
    const cache = await caches.open('kryptonvision-pwa-v3');
    for (const url of cssUrls) {
      const css = await (await fetch(url)).text();
      await cache.put(url, new Response(css + '\nhtml body .auth-entry .login-introduction,html body .auth-entry .login-button{background: #008744 !important;}', { headers: { 'Content-Type': 'text/css' } }));
    }
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  }, cssUrls);
  assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
  await context.unroute('**/sw.js');
  await page.reload();
  await page.waitForFunction(() => sessionStorage.getItem('sentinel_preview_cache_recovered') === '1' && !navigator.serviceWorker.controller);
  await page.waitForTimeout(1000);
  const result = await page.evaluate(async () => ({
    url: location.href,
    introduction: getComputedStyle(document.querySelector('.login-introduction')).backgroundImage,
    button: getComputedStyle(document.querySelector('.login-button')).backgroundImage,
    worker: !!navigator.serviceWorker.controller,
    caches: await caches.keys(),
    theme: document.documentElement.dataset.theme
  }));
  assert.match(result.button, /73, 102, 232/);
  assert.equal(result.worker, false);
  assert.equal(result.caches.some(name => name.startsWith('kryptonvision-pwa-')), false);
  await page.screenshot({ path: 'tmp/experience-qa/login-cache-recovered.png' });
  console.log('Old green CSS cache recovered:', result);
} finally { await browser.close(); }
