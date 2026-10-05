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
  await page.waitForTimeout(31000);
  assert.match(await page.locator('#branch-select').innerText(), /2 branches selected/);
  await scope.getByRole('button', { name: 'Reset' }).click();
  await scope.getByRole('button', { name: 'All Feeds (3)' }).waitFor();
  await page.locator('#zone-select').click();
  await page.getByRole('textbox', { name: 'Search zones' }).fill('West');
  assert.equal(await zoneGroup.getByRole('checkbox').count(), 2);
  await zoneGroup.getByRole('checkbox', { name: 'West Zone', exact: true }).check();
  await page.keyboard.press('Escape');
  await scope.getByRole('button', { name: 'All Feeds (0)' }).waitFor();
  assert.match(await page.locator('#branch-select').innerText(), /All Branches \(1\)/);
  await scope.getByRole('button', { name: 'Reset' }).click();
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.locator('#zone-select').click();
    await zoneGroup.waitFor();
    const bounds = await zoneGroup.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `Dropdown outside viewport at ${width}`);
    const hit = await zoneGroup.getByRole('checkbox', { name: 'West Zone', exact: true }).evaluate(el => {
      const box = el.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === el;
    });
    assert.ok(hit, `Dropdown clipped at ${width}`);
    await page.screenshot({ path: `tmp/live-hierarchy-${width}.png` });
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  console.log('PASS: four configured zones, multiple zones/regions/areas/branches, counts, empty zone, search, reset, refresh persistence, keyboard dismissal, desktop/mobile dropdown layout.');
} finally { await browser.close(); }
