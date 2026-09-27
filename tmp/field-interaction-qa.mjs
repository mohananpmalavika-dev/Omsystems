import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addCookies([{ name: 'sentinel_access', value: 'qa', domain: 'localhost', path: '/' }]);
  await context.addInitScript(() => { localStorage.setItem('accessToken', 'qa'); sessionStorage.setItem('user', JSON.stringify({ id: 'qa', role: 'superadmin' })); });
  await context.route(/\/(api|v1)\//, route => {
    if (route.request().url().includes('/auth/me')) return route.fulfill({ status: 200, json: { id: 'qa', role: 'superadmin' } });
    return route.fulfill({ status: 503, json: { message: 'Visual QA: service unavailable' } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error' && /hydration|didn't match|does not match/i.test(msg.text())) errors.push(msg.text()); });
  const scenarios = process.argv.length > 2 ? process.argv.slice(2) : ['/maintenance', '/reports', '/compliance', '/compliance/risks', '/admin', '/communications/calls', '/maintenance/assets/new', '/modules'];
  for (const route of scenarios) {
    await page.goto('http://localhost:3000' + route, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('h1').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    if (route === '/compliance') {
      await page.getByRole('button', { name: 'New Framework', exact: true }).click();
      await page.getByLabel('Framework Name').fill('Visual QA');
      assert.equal(await page.getByLabel('Framework Name').inputValue(), 'Visual QA');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    if (route === '/reports') {
      await page.getByRole('radio').filter({ hasText: 'Camera Availability' }).click();
      assert.equal(await page.getByRole('radio').filter({ hasText: 'Camera Availability' }).getAttribute('aria-checked'), 'true');
    }
    if (route === '/communications/calls') {
      await page.getByRole('button', { name: 'Call History', exact: true }).click();
      await page.getByRole('button', { name: 'Directory', exact: true }).click();
    }
    if (route === '/maintenance/assets/new') {
      await page.getByLabel('Asset type').fill('Visual QA camera');
      assert.equal(await page.getByRole('button', { name: 'Register asset', exact: true }).isEnabled(), true);
    }
    if (route === '/modules') {
      await page.getByRole('textbox', { name: 'Search available modules' }).fill('coverage');
      assert.equal(await page.getByRole('textbox', { name: 'Search available modules' }).inputValue(), 'coverage');
    }
    const name = route.slice(1).replaceAll('/', '-');
    await page.screenshot({ path: `tmp/experience-qa/field-${name}.png` });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.classList.toggle('dark', theme !== 'light'); }, theme);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(750);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (overflow) {
          console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 3 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 15).map(el => ({ tag: el.tagName, cls: el.className, right: el.getBoundingClientRect().right, width: getComputedStyle(el).width }))));
          await page.screenshot({ path: 'tmp/experience-qa/field-overflow.png' });
        }
        assert.equal(overflow, false, `${route} ${theme} ${width}`);
      }
      if (theme === 'dark') await page.screenshot({ path: `tmp/experience-qa/field-${name}-dark-mobile.png` });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log(route, 'interactive controls, themes and mobile passed');
  }
  assert.deepEqual(errors, []);
  console.log('No runtime or hydration errors.');
} finally { await browser.close(); }
