import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { build } from "esbuild";
import { resolve } from "node:path";

let browser: Browser, page: Page, bundle: string;
beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import React, {useRef, useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {useLiveWallAlertFocus} from './dashboard/hooks/use-live-wall-alert-focus';
      import {LiveAiOverlay} from './dashboard/components/live-ai-overlay';
      function Wall() {
        const wall = useRef(null);
        const [alerts, setAlerts] = useState([]);
        const [enabled, setEnabled] = useState(true);
        const [visible, setVisible] = useState(true);
        window.updateAlerts = setAlerts; window.enableFocus = setEnabled; window.showCamera = setVisible;
        useLiveWallAlertFocus(wall, new Map([['camera-a', {rules:[], alerts}]]), enabled);
        return <div ref={wall} data-alerts={JSON.stringify(alerts)}>{visible && <article data-camera-id="camera-a" style={{width:320,height:180,background:'#444'}}>
          <video/><LiveAiOverlay alerts={alerts}/></article>}<article data-camera-id="camera-b"><video/></article></div>;
      }
      createRoot(document.getElementById('root')).render(<Wall/>);`, resolveDir: resolve('.'), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', alias: { '@': resolve('dashboard') },
  });
  bundle = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

async function mount() {
  page = await browser.newPage();
  await page.route('http://localhost:3219/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://localhost:3219');
  await page.addScriptTag({ content: bundle });
  await page.locator('video').first().waitFor({ state: 'attached' });
  await page.evaluate(() => {
    (window as any).originalVideo = document.querySelector('video');
    (window as any).scrolls = [];
    HTMLElement.prototype.scrollIntoView = function () { (window as any).scrolls.push(this.dataset.cameraId); };
  });
}
function alert(id = 'event-1', status = 'new', severity = 'P2') {
  return { id, cameraId: 'camera-a', title: 'Helmet detected', severity, status, firstDetectedAt: new Date().toISOString(),
    confidence: .95, boundingBox: { x: .2, y: .2, width: .3, height: .4 } };
}
async function send(alerts: unknown[]) {
  await page.evaluate(value => (window as any).updateAlerts(value), alerts);
  await page.waitForFunction(value => document.querySelector('[data-alerts]')?.getAttribute('data-alerts') === value, JSON.stringify(alerts));
}

describe('live wall alert attention', () => {
  it('briefly focuses the affected camera without tinting video or changing its element', async () => {
    await mount();
    await send([alert()]);
    await page.waitForFunction(() => document.querySelector('[data-camera-id="camera-a"]')!.getAnimations().length === 1);
    expect(await page.evaluate(() => (window as any).scrolls)).toEqual(['camera-a']);
    expect(await page.locator('circle[fill^="url(#heat-radial"]').count()).toBe(0);
    expect(await page.evaluate(() => document.querySelector('video') === (window as any).originalVideo)).toBe(true);
    expect(await page.locator('[data-camera-id="camera-b"]').evaluate(el => el.getAnimations().length)).toBe(0);
    await page.waitForFunction(() => document.querySelector('[data-camera-id="camera-a"]')!.getAnimations().length === 0);
    await send([alert()]);
    expect(await page.evaluate(() => (window as any).scrolls)).toEqual(['camera-a']);
    await send([alert('event-2')]);
    await page.waitForFunction(() => (window as any).scrolls.length === 2);
  });

  it('ignores closed and low priority alerts and cancels attention when disabled', async () => {
    await mount();
    await send([alert('resolved', 'resolved'), alert('suppressed', 'suppressed'), alert('false', 'false_alarm'), alert('low', 'new', 'P4')]);
    expect(await page.evaluate(() => (window as any).scrolls)).toEqual([]);
    await send([alert('active')]);
    await page.waitForFunction(() => (window as any).scrolls.length === 1);
    await page.evaluate(() => (window as any).enableFocus(false));
    await page.waitForFunction(() => document.querySelector('[data-camera-id="camera-a"]')!.getAnimations().length === 0);
    await send([alert('disabled')]);
    expect(await page.evaluate(() => (window as any).scrolls)).toEqual(['camera-a']);
  });

  it('waits for the affected tile to mount before consuming its alert', async () => {
    await mount();
    await page.evaluate(() => (window as any).showCamera(false));
    await page.locator('[data-camera-id="camera-a"]').waitFor({ state: 'detached' });
    await send([alert()]);
    expect(await page.evaluate(() => (window as any).scrolls)).toEqual([]);
    await page.evaluate(() => (window as any).showCamera(true));
    await page.waitForFunction(() => (window as any).scrolls.length === 1);
  });
});
