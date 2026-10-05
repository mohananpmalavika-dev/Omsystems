import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const baseUrl = process.env.DASHBOARD_QA_URL || 'http://127.0.0.1:3014';

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
  await context.addCookies([{ name: 'sentinel_access', value: 'qa', url: baseUrl }]);
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
  await page.goto(baseUrl + '/control-room?branchId=b0', { waitUntil: 'domcontentloaded', timeout: 180000 });
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
  await first.locator('.camera-only-wall').waitFor();
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
  async function checkCameraOnly(wall) {
    assert.equal(await wall.locator('.sidebar, .topbar, .los-page-heading, .los-mode-bar, .los-scene-nav, .los-fleet-toolbar, .los-feed-dock, .los-event-ribbon, .los-scope-sheet').count(), 0);
    assert.equal(await wall.getByRole('link').count(), 0);
    assert.equal(await wall.getByRole('button', { name: /logout|sign out|Open KryptonAI Assistant/i }).count(), 0);
    const fit = await wall.locator('.los-video-stage').evaluate(el => {
      const box = el.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(Math.abs(fit.x) < 1 && Math.abs(fit.y) < 1, JSON.stringify(fit));
    assert.ok(Math.abs(fit.width - fit.viewportWidth) < 2 && Math.abs(fit.height - fit.viewportHeight) < 2, JSON.stringify(fit));
    for (const tile of await wall.locator('.camera-tile').all()) {
      const box = await tile.boundingBox();
      assert.ok(box.height > 40 && box.y + box.height <= fit.viewportHeight + 1, JSON.stringify(box));
    }
    assert.ok(await wall.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await checkCameraOnly(first);

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
  assert.equal(await first.locator('.camera-tile').count(), 2);
  assert.equal(await windowControls.getByRole('button', { name: /^Wall [12]:/ }).count(), 2);

  await first.reload({ waitUntil: 'domcontentloaded' });
  await first.locator('.camera-tile[data-camera-id="c0"]').waitFor();
  await first.locator('.camera-tile[data-camera-id="c1"]').waitFor();
  await checkCameraOnly(first);
  assert.equal(await second.locator('.camera-tile[data-camera-id="c2"]').count(), 1);
  assert.equal(await page.getByRole('textbox', { name: 'Search cameras by name, IP address, or channel' }).inputValue(), 'Entrance');
  await page.getByRole('button', { name: 'Refresh scope', exact: true }).click();
  assert.match(await page.locator('#zone-select').innerText(), /East Zone/);
  assert.deepEqual(new URL(second.url()).searchParams.getAll('zoneId'), ['z2']);
  await windowControls.getByRole('button', { name: /^Wall 2:/ }).click();

  await page.setViewportSize({ width: 390, height: 1100 });
  await windowControls.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'tmp/live-wall-windows-mobile.png' });
  await first.setViewportSize({ width: 1440, height: 1000 });
  await checkCameraOnly(first);
  await first.screenshot({ path: 'tmp/camera-only-wall-desktop.png' });
  await first.setViewportSize({ width: 390, height: 844 });
  await checkCameraOnly(first);
  await first.screenshot({ path: 'tmp/camera-only-wall-mobile.png' });
  const closedSecond = second.waitForEvent('close');
  await second.close();
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
  cameras.splice(0, cameras.length, ...Array.from({ length: 32 }, (_, index) => ({ ...cameras[0], id: `dense-${index}`, name: `Camera ${index + 1}` })));
  const dense = await context.newPage();
  dense.on('pageerror', error => errors.push(error.message));
  await dense.goto(baseUrl + '/control-room?wallWindow=true&hideUnavailable=false', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await dense.waitForFunction(() => document.querySelectorAll('.camera-tile').length === 32);
  await checkCameraOnly(dense);
  await dense.screenshot({ path: 'tmp/camera-only-wall-32-cameras.png' });
  await dense.getByRole('button', { name: 'Open fullscreen monitor' }).click();
  await dense.waitForFunction(() => document.fullscreenElement?.classList.contains('los-video-stage'));
  await checkCameraOnly(dense);
  await dense.getByRole('button', { name: 'Exit fullscreen monitor' }).click();
  await dense.waitForFunction(() => !document.fullscreenElement);
  await dense.close();
  const empty = await context.newPage();
  await empty.goto(baseUrl + '/control-room?wallWindow=true&branchId=nonexistent', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await empty.getByRole('status').filter({ hasText: 'No cameras match the selected wall scope.' }).waitFor();
  assert.equal(await empty.locator('.sidebar, .topbar, .los-page-heading').count(), 0);
  await empty.close();
  assert.deepEqual(errors, []);
  console.log('PASS: camera-only popup without menus/logout/global UI, two independent scoped windows, inherited filters, reload persistence, viewport-filling fleet grid, desktop/mobile resize, 32-camera grid, native fullscreen, empty scope, focus/close controls, and blocked-popup fallback.');
} finally { await browser.close(); }
