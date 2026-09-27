import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const branches = Array.from({ length: 6 }, (_, i) => ({ branchId: `qa-${i}`, name: ['Kochi Central', 'Calicut North', 'Trivandrum', 'Thrissur', 'Kannur', 'Kottayam'][i], branchCode: `QA-0${i + 1}`, region: 'Visual QA', operationalState: i === 1 ? 'DEGRADED' : 'HEALTHY', cameras: { total: 12, working: i === 1 ? 10 : 12, offline: i === 1 ? 2 : 0, unknown: 0 }, risk: { level: i === 1 ? 'HIGH' : 'LOW', probabilityPct: i === 1 ? 65 : 2 }, recording: { status: 'HEALTHY', recordingChannels: 12, totalChannels: 12 } }));
try {
  for (const scenario of ['unavailable', 'empty', 'populated']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
    await context.addCookies([{ name: 'sentinel_access', value: 'visual-qa', domain: 'localhost', path: '/' }]);
    await context.addInitScript(() => { localStorage.setItem('accessToken', 'visual-qa'); sessionStorage.setItem('user', JSON.stringify({ id: 'qa', role: 'superadmin' })); });
    const summary = { branches: { total: scenario === 'populated' ? 6 : 0 }, cameras: { total: scenario === 'populated' ? 72 : 0, working: 70, offline: 2 }, lastTelemetryTimestamp: new Date().toISOString(), liveIncidents: [] };
    await context.route(/\/(api|v1)\//, route => {
      const url = route.request().url();
      if (url.includes('/auth/me')) return route.fulfill({ status: 200, json: { id: 'qa', role: 'superadmin' } });
      if (url.includes('/operations/command-center') && scenario !== 'unavailable') return route.fulfill({ status: 200, json: { success: true, data: summary } });
      if (url.includes('/operations/branches') && scenario !== 'unavailable') return route.fulfill({ status: 200, json: { success: true, data: scenario === 'populated' ? branches : [] } });
      if (url.includes('/operations/alerts')) return route.fulfill({ status: 200, json: { success: true, data: [] } });
      if (url.includes('/operations/command-center') || url.includes('/operations/branches')) return route.fulfill({ status: 503, json: { message: 'Visual QA: unavailable service' } });
      return route.fulfill({ status: 200, json: { success: true, data: [] } });
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error' && /hydration|didn't match|does not match/i.test(message.text())) errors.push(message.text()); });
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `tmp/experience-qa/command-atlas-${scenario}.png`, fullPage: true });
    await page.screenshot({ path: `tmp/experience-qa/command-atlas-${scenario}-desktop.png` });
    await page.locator('.atlas-stage').screenshot({ path: `tmp/experience-qa/command-atlas-${scenario}-canvas.png` });
    assert.equal(await page.locator('.atlas-stage').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (scenario === 'populated') {
      assert.equal(await page.locator('.atlas-node').count(), 6);
      await page.getByRole('button', { name: 'Risk', exact: true }).click();
      await assert.equal(await page.locator('.atlas-node').filter({ hasText: 'HIGH risk' }).count(), 1);
      await page.getByRole('button', { name: 'Open Calicut North workspace' }).click();
      assert.equal(await page.getByRole('dialog').count(), 1);
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('button', { name: 'Coverage', exact: true }).click();
    }
    for (const theme of ['dark', 'emerald', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.classList.toggle('dark', theme !== 'light'); }, theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${scenario} overflows at ${width}`);
    }
    await page.screenshot({ path: `tmp/experience-qa/command-atlas-${scenario}-mobile.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`${scenario}: desktop/mobile, theme checks, browser errors passed`);
    await context.close();
  }
} finally { await browser.close(); }
