// Isolated browser QA of the actual React panel with controlled API fixtures.
// Does not connect to production, send notifications or modify a branch.
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('qa-artifacts/branch-protection');
await mkdir(output, { recursive: true });
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BranchProtectionPanel} from './dashboard/components/branch-protection-panel'; createRoot(document.getElementById('root')).render(<BranchProtectionPanel branchId="branch-a" />);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const css = await postcss([tailwindcss({ content: ['./dashboard/components/branch-protection-panel.tsx'], theme: { extend: {} } })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
let verifying = false;
let savedPolicy;
const policy = { enabled: false, verificationIntervalMinutes: 15, verificationFreshMinutes: 30, maxGapSeconds: 60, requiredRetentionDays: 90, criticalCameraIds: ['camera-a'], bandwidthMode: 'low', maxConcurrentStreams: 2, sopRules: [] };
const check = { cameraId: 'camera-a', status: 'FAILED', checkedAt: new Date().toISOString(), sampleAt: new Date().toISOString(), framesDecoded: 0, timestampProgressing: false, reason: 'Archive sample could not be decoded', gaps: [{ from: '2026-10-02T03:00:00Z', to: '2026-10-02T03:05:00Z', seconds: 300 }], indexedRetentionDays: 61, incidentId: 'incident-a' };
const apiRequests = [];
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/bundle.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle.outputFiles[0].text); return; }
  if (path === '/style.css') { response.setHeader('Content-Type', 'text/css'); response.end(css.css); return; }
  if (!path.startsWith('/v1/')) { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-slate-950"><main id="root" class="mx-auto max-w-7xl p-5"></main><script src="/bundle.js"></script></body></html>'); return; }
  apiRequests.push({ method: request.method, path });
  let raw = ''; for await (const chunk of request) raw += chunk;
  let data;
  if (path.endsWith('/policy')) { savedPolicy = JSON.parse(raw); data = {}; }
  else if (path.endsWith('/verify')) { verifying = true; response.statusCode = 202; data = {}; }
  else if (path.endsWith('/offline')) data = { observed: true, status: { connectivity_state: 'OFFLINE', queued_items_count: 8 } };
  else if (path.endsWith('/incident-delivery')) data = [{ incident_id: 'incident-a', channel: 'email', status: 'FAILED', delivered_at: null, last_error: 'provider unavailable' }];
  else if (path.endsWith('/report')) data = { events: [], generatedAt: new Date().toISOString() };
  else data = { status: 'AT_RISK', reasons: ['Cash counter: indexed recording gaps detected', 'Retention below policy'], totalCameras: 1, verifiedCameras: 0, lastRunAt: new Date().toISOString(), verificationRunning: verifying, policy: savedPolicy ?? policy, reviews: [], cameras: [{ id: 'camera-a', name: 'Cash counter', critical: true, check }] };
  response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ success: true, data }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByText('AT RISK', { exact: true }).waitFor();
  await page.getByText('email: FAILED · provider unavailable').waitFor();
  await page.screenshot({ path: resolve(output, 'desktop.png'), fullPage: true });
  await page.getByText('Protection policy and SOP rules', { exact: true }).click();
  await page.getByLabel('Bandwidth mode').selectOption('normal');
  await page.getByRole('button', { name: 'Add SOP rule' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Branch opening review');
  const sop = page.getByRole('group', { name: 'SOP 1' });
  await sop.getByLabel('Cash counter').check();
  await page.getByRole('button', { name: 'Save policy', exact: true }).click();
  await page.getByText('Protection policy saved', { exact: true }).waitFor();
  assert.equal(savedPolicy.bandwidthMode, 'normal'); assert.equal(savedPolicy.sopRules[0].cameraIds[0], 'camera-a');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'Mobile page must not overflow the viewport');
  await page.getByRole('button', { name: 'Verify recordings', exact: true }).click();
  await page.getByRole('button', { name: 'Verifying recordings…', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ passed: true, errors, apiRequests, policySaved: savedPolicy }, null, 2));
  console.log('Browser QA passed: desktop/mobile rendering, policy/SOP save, delivery truth and background verification.');
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ errors, apiRequests, body: await page.locator('body').innerText() }, null, 2));
  console.error(JSON.stringify({ errors, apiRequests, body: await page.locator('body').innerText() }));
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
