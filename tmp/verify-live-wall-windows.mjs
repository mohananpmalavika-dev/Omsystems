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
  await page.goto('http://127.0.0.1:3000/control-room?branchId=b0', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.locator('.los-scope-sheet > summary').click();
  const scope = page.getByRole('region', { name: 'Live Wall Scope Selection' });
  await page.locator('#zone-select').filter({ hasText: 'All Zones (4)' }).waitFor({ timeout: 60000 });
  await page.locator('#zone-select').click();
  const zoneGroup = page.getByRole('group', { name: 'Select zones' });
  assert.equal(await zoneGroup.getByRole('checkbox').count(), 5);
  await zoneGroup.getByRole('checkbox', { name: 'North Zone', exact: true }).check();
  await zoneGroup.getByRole('checkbox', { name: 'South Zone', exact: true }).check();
  await zoneGroup.getByRole('button', { name: 'Done' }).click();
  await scope.getByRole('button', { name: 'All Feeds (2)' }).waitFor();
  assert.match(await page.locator('#region-select').innerText(), /All Regions \(2\)/);
  await page.locator('#region-select').click();
  const regions = page.getByRole('group', { name: 'Select regions' });
  await regions.getByRole('checkbox', { name: 'North Region', exact: true }).check();
  await regions.getByRole('checkbox', { name: 'South Region', exact: true }).check();
  await regions.getByRole('button', { name: 'Done' }).click();
  await page.locator('#area-select').click();
  const areas = page.getByRole('group', { name: 'Select areas' });
  await areas.getByRole('checkbox', { name: 'North Area', exact: true }).check();
  await areas.getByRole('checkbox', { name: 'South Area', exact: true }).check();
  await areas.getByRole('button', { name: 'Done' }).click();
  await page.locator('#branch-select').click();
  const branches = page.getByRole('group', { name: 'Select branches' });
  await branches.getByRole('checkbox', { name: 'North Branch (1 cams)', exact: true }).check();
  await branches.getByRole('checkbox', { name: 'South Branch (1 cams)', exact: true }).check();
  await branches.getByRole('button', { name: 'Done' }).click();
  await scope.getByRole('button', { name: 'All Feeds (2)' }).waitFor();
  assert.match(await page.locator('#branch-select').innerText(), /2 branches selected/);
  await scope.getByRole('button', { name: 'Overlays on', exact: true }).click();
  await scope.getByRole('button', { name: 'Online (2)', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search cameras by name, IP address, or channel' }).fill('Entrance');
  const windowControls = page.getByRole('region', { name: 'Multiple Live Wall windows' });
  const firstPromise = context.waitForEvent('page');
  await windowControls.getByRole('button', { name: 'Open wall window' }).click();
  const first = await firstPromise;
  first.on('pageerror', error => errors.push(error.message));
  await first.waitForLoadState('domcontentloaded');
  await first.getByRole('button', { name: 'Fleet wall', exact: true }).waitFor();
  assert.equal(await first.getByRole('button', { name: 'Fleet wall', exact: true }).getAttribute('aria-pressed'), 'true');
  const firstUrl = new URL(first.url());
  for (const [key, ids] of [['zoneId', ['z0', 'z1']], ['regionId', ['r0', 'r1']], ['areaId', ['a0', 'a1']], ['branchId', ['b0', 'b1']]]) assert.deepEqual(firstUrl.searchParams.getAll(key), ids);
  assert.equal(firstUrl.searchParams.get('status'), 'ONLINE');
  assert.equal(firstUrl.searchParams.get('overlays'), 'false');
  assert.equal(firstUrl.searchParams.get('q'), 'Entrance');
  await first.locator('.camera-tile[data-camera-id="c0"]').waitFor();
  await first.locator('.camera-tile[data-camera-id="c1"]').waitFor();
  assert.equal(await first.locator('.camera-tile[data-camera-id="c2"]').count(), 0);
  assert.equal(await first.evaluate(() => window.opener), null);
  await first.waitForFunction(() => document.title.includes('North Branch, South Branch'));
  assert.match(await first.title(), /North Branch, South Branch/);
  await first.locator('.los-scope-sheet > summary').click();
  const firstScope = first.getByRole('region', { name: 'Live Wall Scope Selection' });
  await firstScope.getByRole('button', { name: 'Overlays off', exact: true }).waitFor();
  assert.match(await first.locator('#branch-select').innerText(), /2 branches selected/);

  await page.locator('#zone-select').click();
  await zoneGroup.getByRole('checkbox', { name: 'All Zones (4)', exact: true }).check();
  await zoneGroup.getByRole('checkbox', { name: 'East Zone', exact: true }).check();
  await zoneGroup.getByRole('button', { name: 'Done' }).click();
  const secondPromise = context.waitForEvent('page');
  await windowControls.getByRole('button', { name: 'Open wall window' }).click();
  const second = await secondPromise;
  second.on('pageerror', error => errors.push(error.message));
  await second.waitForLoadState('domcontentloaded');
  await second.locator('.camera-tile[data-camera-id="c2"]').waitFor();
  assert.deepEqual(new URL(second.url()).searchParams.getAll('zoneId'), ['z2']);
  assert.match(await first.locator('#branch-select').innerText(), /2 branches selected/);
  assert.equal(await windowControls.getByRole('button', { name: /^Wall [12]:/ }).count(), 2);

  await first.getByRole('textbox', { name: 'Search cameras by name, IP address, or channel' }).fill('North');
  await firstScope.getByRole('button', { name: 'All Feeds (1)', exact: true }).waitFor();
  assert.equal(await second.locator('.camera-tile[data-camera-id="c2"]').count(), 1);
  assert.equal(await page.getByRole('textbox', { name: 'Search cameras by name, IP address, or channel' }).inputValue(), 'Entrance');
  await firstScope.getByRole('button', { name: 'Reset', exact: true }).click();
  await firstScope.getByRole('button', { name: 'All Feeds (3)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Refresh scope', exact: true }).click();
  assert.match(await page.locator('#zone-select').innerText(), /East Zone/);
  assert.deepEqual(new URL(second.url()).searchParams.getAll('zoneId'), ['z2']);
  await windowControls.getByRole('button', { name: /^Wall 2:/ }).click();

  await page.setViewportSize({ width: 390, height: 1100 });
  await windowControls.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'tmp/live-wall-windows-mobile.png' });
  await first.setViewportSize({ width: 1440, height: 1000 });
  await first.screenshot({ path: 'tmp/live-wall-window-combined.png' });
  const closedSecond = second.waitForEvent('close');
  await second.getByRole('button', { name: 'Close window', exact: true }).click();
  await closedSecond;
  await page.waitForTimeout(2200);
  assert.equal(await windowControls.getByRole('button', { name: /^Wall 2:/ }).count(), 0);
  const closedFirst = first.waitForEvent('close');
  await windowControls.getByRole('button', { name: 'Close wall 1', exact: true }).click();
  await closedFirst;
  assert.equal(await windowControls.getByRole('button', { name: /^Wall 1:/ }).count(), 0);

  await page.evaluate(() => { window.open = () => null; });
  await windowControls.getByRole('button', { name: 'Open wall window' }).click();
  const alert = windowControls.getByRole('alert');
  await alert.waitFor();
  const fallback = alert.getByRole('link', { name: 'open the selected wall in a new tab' });
  assert.deepEqual(new URL(await fallback.getAttribute('href'), page.url()).searchParams.getAll('zoneId'), ['z2']);
  assert.equal(await fallback.getAttribute('rel'), 'noopener noreferrer');
  assert.deepEqual(errors, []);
  console.log('PASS: combined multi-location popup, two independent wall windows, inherited display filters, fleet view, isolated child edits/reset, refresh persistence, focus/close controls, manual-close tracking, mobile layout, and blocked-popup fallback.');
} finally { await browser.close(); }
