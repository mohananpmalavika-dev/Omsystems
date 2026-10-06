import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('tmp/camera-recovery-qa', { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [1600, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1050 } });
    await context.addCookies([{ name: 'sentinel_access', value: 'qa', domain: '127.0.0.1', path: '/' }]);
    await context.addInitScript(() => {
      localStorage.setItem('accessToken', 'qa');
      sessionStorage.setItem('user', JSON.stringify({ id: 'qa', role: 'superadmin' }));
      localStorage.setItem('userRole', 'superadmin');
    });
    let verified = false, recoveryRequests = 0, bearer = false;
    await context.route(/\/(api|v1)\//, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/bring-online')) {
        recoveryRequests++;
        bearer = route.request().headers().authorization === 'Bearer qa';
        assert.deepEqual(route.request().postDataJSON(), { cameraId: 'camera-qa', branchId: 'branch-qa' });
        return route.fulfill({ status: 202, json: { success: true, message: 'Recovery requested. Status updates after the gateway verifies the stream.', data: { queuedCount: 1, cameraIds: ['camera-qa'], commands: [{ id: 'command-qa', cameraId: 'camera-qa', status: 'queued' }], skipped: [] } } });
      }
      if (path.endsWith('/workspace')) return route.fulfill({ json: { success: true, data: {
        branch: { branchId: 'branch-qa', name: 'Recovery test branch', branchCode: 'QA', region: 'Actual region', cameras: { total: 1, working: verified ? 1 : 0 }, internet: { mode: 'Unknown' } },
        cameras: [{ cameraId: 'camera-qa', name: 'Entrance camera', operationalState: verified ? 'ONLINE' : 'OFFLINE', isStreaming: verified, isRecording: false, zone: 'Actual zone' }],
        recorders: [], events: [],
      } } });
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'qa', role: 'superadmin', tenantId: 'qa' } });
      return route.fulfill({ json: { data: [] } });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:3014/operations/branches/branch-qa', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.getByRole('button', { name: 'Cameras (1)', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: 'Entrance camera' });
    await row.getByRole('button', { name: 'Make online', exact: true }).click();
    await page.getByText('Recovery requested. Status updates after the gateway verifies the stream.', { exact: true }).waitFor();
    assert.match(await row.innerText(), /offline/i);
    assert.equal(recoveryRequests, 1);
    assert.equal(bearer, true);
    await page.screenshot({ path: `tmp/camera-recovery-qa/pending-${width}.png`, fullPage: true });
    verified = true;
    // The branch screen must pick up actual recovery without a reload or manual status override.
    await row.getByText('Healthy', { exact: true }).waitFor({ timeout: 22000 });
    assert.equal(await row.getByRole('button', { name: 'Make online', exact: true }).count(), 0);
    assert.match(await row.innerText(), /Observed available/);
    assert.deepEqual(errors, []);
    results.push({ width, pendingStaysOffline: true, verifiedRecoveryAutoRefreshes: true, authenticatedRequest: bearer, errors });
    await context.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results));
