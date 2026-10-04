import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const { outputFiles } = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {FullscreenAlertPortal} from './dashboard/components/fullscreen-alert-portal.tsx'; createRoot(document.getElementById('root')).render(<><div id="wall"><button onClick={() => document.getElementById('wall').requestFullscreen()}>Fullscreen wall</button><div id="tile"><button onClick={() => document.getElementById('tile').requestFullscreen()}>Fullscreen tile</button></div></div><FullscreenAlertPortal><button id="alert" onClick={() => document.getElementById('alert').textContent = 'Acknowledged'}>Helmet worn detected</button></FullscreenAlertPortal></>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', jsx: 'automatic',
});
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/app.js' ? outputFiles[0].text : '<div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#alert').waitFor();
  assert.equal(await page.locator('#alert').evaluate(el => el.parentElement.tagName), 'BODY');
  for (const [button, target] of [['Fullscreen wall', 'wall'], ['Fullscreen tile', 'tile']]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.waitForFunction(id => document.fullscreenElement?.id === id && document.getElementById('alert')?.parentElement?.id === id, target);
    await page.locator('#alert').click();
    assert.equal(await page.locator('#alert').textContent(), 'Acknowledged');
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement && document.getElementById('alert')?.parentElement === document.body);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: alert visible and interactive in real wall/tile fullscreen; restored to body on exit; no browser errors.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
