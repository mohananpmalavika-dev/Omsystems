import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

let browser: Browser;
let page: Page;
let bundle: string;
let css: string;
const userId = '00000000-0000-4000-8000-000000000003';
const callId = '00000000-0000-4000-8000-000000000008';

beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import Calls from './dashboard/app/communications/calls/page';
      import Connect from './dashboard/app/communications/connect/page';
      createRoot(document.getElementById('root')).render(window.deviceSurface ? <Connect/> : <Calls/>);`,
      resolveDir: resolve('.'), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', outdir: 'tmp/communication-page-fixture',
    alias: { '@': resolve('dashboard') },
    plugins: [{ name: 'call-signaling-fixture', setup(builder) {
      builder.onResolve({ filter: /use-communication-signaling$/ }, () => ({ path: 'signaling', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: `
        const signaling = {connected:true,joinCall:async()=>{},sendWebRtcOffer:()=>{},sendWebRtcAnswer:()=>{},sendWebRtcIceCandidate:()=>{},sendCallMediaReady:()=>{}};
        for (const name of ['onCallInvite','onCallAccepted','onCallMediaReady','onWebRtcOffer','onWebRtcAnswer','onWebRtcIceCandidate','onCallAcceptedElsewhere','onCallConnected','onCallEnded','onCallRejected','onCallCancelled','onCallFailed','onPresenceChanged','onMessageCreated']) signaling[name]=()=>()=>{};
        export const useCommunicationSignaling = () => signaling;` }));
    }}],
  });
  bundle = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  const utilities = await postcss([tailwindcss({ content: ['dashboard/app/communications/{calls,connect}/page.tsx'] })]).process('@tailwind base; @tailwind utilities;', { from: undefined });
  css = utilities.css + result.outputFiles.find(file => file.path.endsWith('.css'))!.text;
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  await mkdir('tmp/communications-qa', { recursive: true });
});
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

async function mount(deviceSurface = false) {
  page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  page.setDefaultTimeout(5000);
  await page.route('http://localhost:3198/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://localhost:3198');
  await page.addStyleTag({ content: `${css}\n:root{--canvas:#f3f5f8;--surface:#fff;--surface-soft:#f0f4fa;--ink:#1a2b43;--muted:#697b94;--line:#dce3ed;--blue:#2563eb;--blue-dark:#235ab0;--blue-soft:#eaf1fd}body{font-family:'Segoe UI',sans-serif;margin:0}button{font-family:inherit}*{box-sizing:border-box}` });
  await page.evaluate(({ deviceSurface, userId, callId }) => {
    const w = window as any;
    w.deviceSurface = deviceSurface; w.requests = []; w.captureOrder = [];
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (w.denyCamera && constraints?.video) throw new DOMException('Camera denied', 'NotAllowedError');
      return capture(constraints);
    };
    if (deviceSurface) {
      for (const [key, value] of Object.entries({ commDeviceToken: 'fixture-device', commDeviceId: 'fixture-terminal', commDeviceStatus: 'ACTIVE', commDeviceName: 'Kochi reception', commBranchId: 'fixture-branch', commBranchName: 'Kochi', commDeviceMode: 'BRANCH_COMMON' })) localStorage.setItem(key, value);
    }
    const user = { employeeId: userId, employeeName: 'Ananya Menon', employeeRole: 'SOC Operator', branchName: 'Command Center', presence: 'ONLINE' };
    const json = (data: unknown) => new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } });
    w.fetch = async (url: string, options: any = {}) => {
      w.requests.push({ url, method: options.method || 'GET' });
      if (url.includes('/directory/branches')) return json([]);
      if (url.includes('/directory/employees')) return json([user]);
      if (url.includes('/device-directory')) return json({ branches: [], linkedEmployees: [], vmsUsers: [user] });
      if (url.includes('/direct-messages') || url.includes('/device-direct-messages')) return json([]);
      if (url.includes('/device-calls/') || url.includes('/calls/employee/')) {
        w.captureOrder.push('call-request');
        if (w.failCall) return new Response(JSON.stringify({ error: 'calling unavailable' }), { status: 503 });
        return json({ call: { id: callId, direction: 'OUTBOUND', status: 'RINGING', targetEmployeeId: userId, targetEmployeeName: 'Ananya Menon' }, credentials: { iceServers: [] } });
      }
      return json({ id: callId });
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      w.captureOrder.push('screen-picker'); w.screenActivation = navigator.userActivation.isActive;
      if (w.cancelShare) throw new DOMException('Cancelled', 'NotAllowedError');
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      canvas.getContext('2d')!.fillRect(0, 0, 640, 360);
      const stream = canvas.captureStream(10); w.sharedStream = stream;
      return stream;
    };
  }, { deviceSurface, userId, callId });
  await page.addScriptTag({ content: bundle });
  if (!deviceSurface) await page.getByRole('button', { name: 'Ananya Menon SOC Operator', exact: true }).waitFor();
  else await page.getByText('Call VMS Command Center', { exact: true }).waitFor();
}

describe('calling pages', () => {
  it('shows the redesigned directory and opens the call workspace with a local camera preview', async () => {
    await mount();
    await page.getByRole('button', { name: 'Ananya Menon SOC Operator', exact: true }).click();
    await page.screenshot({ path: 'tmp/communications-qa/directory-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'tmp/communications-qa/directory-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1360, height: 960 });
    await page.getByRole('button', { name: 'Video Call', exact: true }).last().click();
    await page.getByRole('dialog', { name: 'Call workspace', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector<HTMLVideoElement>('[aria-label="Your local video preview"]')!.videoWidth > 0);
    await page.screenshot({ path: 'tmp/communications-qa/calling-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Cancel call', exact: true }).click();
    await page.getByRole('dialog', { name: 'Call workspace', exact: true }).waitFor({ state: 'hidden' });
  });

  it.each([false, true])('opens screen selection before any call request on the device surface=%s', async deviceSurface => {
    await mount(deviceSurface);
    if (deviceSurface) await page.locator('select').first().selectOption(`VMS_USER:${userId}`);
    else await page.getByRole('button', { name: 'Ananya Menon SOC Operator', exact: true }).click();
    if (deviceSurface) await page.screenshot({ path: 'tmp/communications-qa/device-directory-desktop.png', fullPage: true });
    await page.getByRole('button', { name: deviceSurface ? /Screen Share.*Start Screen Share/ : 'Share Screen', exact: !deviceSurface }).click();
    await page.getByRole('region', { name: 'Active call', exact: true }).waitFor();
    expect(await page.evaluate(() => (window as any).captureOrder)).toEqual(['screen-picker', 'call-request']);
    expect(await page.evaluate(() => (window as any).screenActivation)).toBe(true);
    await page.getByRole('button', { name: 'Cancel call', exact: true }).click();
    await page.waitForFunction(() => (window as any).sharedStream.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'));
  });

  it('does not place a call when screen selection is cancelled', async () => {
    await mount();
    await page.getByRole('button', { name: 'Ananya Menon SOC Operator', exact: true }).click();
    await page.evaluate(() => { (window as any).cancelShare = true; });
    await page.getByRole('button', { name: 'Share Screen', exact: true }).click();
    await page.getByText('Screen sharing was cancelled or blocked. Select a screen, window, or browser tab to share.', { exact: true }).waitFor();
    expect(await page.evaluate(() => (window as any).captureOrder)).toEqual(['screen-picker']);
  });

  it('stops captured screen tracks if starting the call fails', async () => {
    await mount();
    await page.getByRole('button', { name: 'Ananya Menon SOC Operator', exact: true }).click();
    await page.evaluate(() => { (window as any).failCall = true; });
    await page.getByRole('button', { name: 'Share Screen', exact: true }).click();
    await page.getByText('calling unavailable', { exact: true }).waitFor();
    expect(await page.evaluate(() => (window as any).sharedStream.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  });

  it('shows a denied camera permission on the device page without placing a call', async () => {
    await mount(true);
    await page.locator('select').first().selectOption(`VMS_USER:${userId}`);
    await page.evaluate(() => { (window as any).denyCamera = true; });
    await page.getByRole('button', { name: /Video Call.*Start Video Call/ }).click();
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('alert').innerText()).toContain('permission denied');
    expect(await page.evaluate(() => (window as any).captureOrder)).toEqual([]);
  });
});
