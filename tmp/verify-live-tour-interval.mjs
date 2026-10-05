import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const zones = ['North', 'South', 'East', 'West'];
const nodes = zones.flatMap((name, index) => [
  { id: `z${index}`, name: `${name} Zone`, type: 'zone', parentId: null },
  { id: `r${index}`, name: `${name} Region`, type: 'region', parentId: `z${index}` },
  { id: `a${index}`, name: `${name} Area`, type: 'area', parentId: `r${index}` },
  { id: `b${index}`, name: `${name} Branch`, type: 'branch', parentId: `a${index}` },
]);
const cameras = zones.slice(0, 3).map((name, index) => ({ id: `c${index}`, name: `${name} Entrance`, branchId: `b${index}`, branchName: `${name} Branch`, status: 'online', vendor: 'other', channel: index + 1, capabilities: { ptz: false, audio: false, events: true }, sourceType: 'ip-camera' }));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block' });
  await context.addCookies([{ name: 'sentinel_access', value: 'qa', domain: '127.0.0.1', path: '/' }]);
  await context.addInitScript(() => { localStorage.setItem('accessToken', 'qa'); sessionStorage.setItem('user', JSON.stringify({ id: 'qa', role: 'superadmin' })); });
  await context.route(/\/(api|v1)\//, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/organization/nodes')) return route.fulfill({ json: { data: nodes } });
    if (path.endsWith('/cameras')) return route.fulfill({ json: { data: cameras, total: cameras.length } });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'qa', role: 'superadmin' } });
    if (path.endsWith('/analytics/live-wall')) return route.fulfill({ json: { data: { cameraIds: cameras.map(c => c.id), rules: [], alerts: [], correlations: [], summary: { total: 0, open: 0 }, sampledAt: new Date().toISOString() } } });
    if (path.endsWith('/analytics/engine-health')) return route.fulfill({ json: { status: 'online' } });
    if (path.endsWith('/health/summary')) return route.fulfill({ json: { data: { totalCameras: 3, camerasOnline: 3 } } });
    if (path === '/api/live') return route.fulfill({ status: 503, json: { message: 'QA gateway offline' } });
    return route.fulfill({ json: { data: [] } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    window.qaIntervals = new Map();
    window.setInterval = (callback, delay, ...args) => {
      const id = nativeSetInterval(callback, delay, ...args);
      window.qaIntervals.set(id, { callback, delay, source: String(callback) });
      return id;
    };
    window.clearInterval = id => { window.qaIntervals.delete(id); return nativeClearInterval(id); };
  });
  await page.goto('http://127.0.0.1:3000/control-room?wallWindow=true', { waitUntil: 'domcontentloaded', timeout: 180000 });
  const interval = page.getByRole('combobox', { name: 'Live tour interval', exact: true });
  await interval.waitFor({ timeout: 60000 });
  const expected = ['15 s', '30 s', '45 s', '1 min', '5 min'];
  assert.deepEqual(await interval.locator('option').allTextContents(), expected);
  assert.equal(await interval.inputValue(), '15');
  await page.getByRole('combobox', { name: 'Fleet tile layout', exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Start tour', exact: true }).click();
  for (const seconds of [15, 30, 45, 60, 300]) {
    await interval.selectOption(String(seconds));
    await page.waitForFunction(seconds => {
      const timers = [...window.qaIntervals.values()].filter(timer => timer.source.includes('setFleetPage'));
      return timers.length === 1 && timers[0].delay === seconds * 1000;
    }, seconds);
  }
  const toolbar = page.locator('.los-fleet-toolbar');
  await toolbar.getByRole('status').filter({ hasText: 'Page 1 / 3' }).waitFor();
  await page.evaluate(() => [...window.qaIntervals.values()].find(timer => timer.source.includes('setFleetPage')).callback());
  await toolbar.getByRole('status').filter({ hasText: 'Page 2 / 3' }).waitFor();
  await page.getByRole('button', { name: 'Pause tour', exact: true }).click();
  await page.waitForFunction(() => ![...window.qaIntervals.values()].some(timer => timer.source.includes('setFleetPage')));

  await page.locator('.los-patrol-sheet > summary').click();
  const patrol = page.getByRole('combobox', { name: 'Patrol tour interval', exact: true });
  assert.deepEqual(await patrol.locator('option').allTextContents(), expected);
  assert.equal(await patrol.inputValue(), '15');
  await patrol.selectOption('300');
  await page.getByRole('button', { name: 'Start Auto-Patrol Tour', exact: true }).click();
  await page.locator('.countdown-tag').filter({ hasText: '300s' }).waitFor();
  await patrol.selectOption('60');
  await page.locator('.countdown-tag').filter({ hasText: '60s' }).waitFor();
  await page.getByRole('button', { name: 'Pause Patrol', exact: true }).click();
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await toolbar.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `tmp/live-tour-interval-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: exact dropdown choices and 15-second defaults, all five live rotation timer delays, timer replacement while running, page advance, pause cleanup, patrol dropdown/countdown changes, and desktop/mobile layout.');
} finally { await browser.close(); }
