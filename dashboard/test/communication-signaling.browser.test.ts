import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { build } from 'esbuild';
import { resolve } from 'node:path';

let browser: Browser;
let page: Page;
let bundle: string;

beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import React, {useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
      import {useCommunicationSignaling} from './dashboard/hooks/use-communication-signaling';
      function App(){const signaling=useCommunicationSignaling(window.identity);const [body,setBody]=useState('waiting');
        useEffect(()=>signaling.onMessageCreated(event=>setBody(event.body)),[signaling.onMessageCreated]);
        return <div id="message">{body}</div>;}
      createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: resolve('.'), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', alias: { '@': resolve('dashboard') },
    plugins: [{ name: 'socket-fixture', setup(builder) {
      builder.onResolve({ filter: /^socket.io-client$/ }, () => ({ path: 'socket', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export function io(){const socket={connected:true,handlers:{},emit(){},disconnect(){this.connected=false;this.handlers.disconnect?.('fixture disconnect');},on(name,handler){this.handlers[name]=handler;return this;}};
          (window.sockets ||= []).push(socket);return socket;}`, loader: 'js' }));
    } }],
  });
  bundle = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

describe('communication message subscriptions', () => {
  it.each(['operator', 'device'])('retains %s subscribers through enrollment-token updates', async identity => {
    page = await browser.newPage();
    await page.route('http://communication-signaling.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('http://communication-signaling.test');
    await page.evaluate(identity => {
      (window as any).identity = identity;
      localStorage.setItem('commDeviceToken', 'existing-device-token');
    }, identity);
    await page.addScriptTag({ content: bundle });
    await page.getByText('waiting', { exact: true }).waitFor();
    await page.evaluate(() => {
      localStorage.setItem('commDeviceToken', 'renewed-device-token');
      window.dispatchEvent(new Event('comm-device-enrolled'));
    });
    if (identity === 'device') await page.waitForFunction(() => (window as any).sockets.length === 2);
    else expect(await page.evaluate(() => (window as any).sockets.length)).toBe(1);
    await page.evaluate(() => (window as any).sockets.at(-1).handlers['comm:message:created']({ body: 'Receiver can see this message' }));
    await page.getByText('Receiver can see this message', { exact: true }).waitFor();
  });
});
