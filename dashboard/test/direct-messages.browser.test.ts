import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { build } from 'esbuild';
import { resolve } from 'node:path';

let browser: Browser;
let page: Page;
let bundle: string;

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
        import {useDirectMessages} from './dashboard/hooks/use-direct-messages';
        const subscribe = handler => { window.messageCreated = handler; return () => { window.messageCreated = null; }; };
        function App() {
          const [contact, select] = useState('');
          const [enabled, setEnabled] = useState(true);
          const thread = useDirectMessages(contact ? 'OPERATOR' : undefined, contact || undefined, subscribe, window.deviceMode, enabled);
          return <><button onClick={() => select('alice')}>Alice</button><button onClick={() => select('bob')}>Bob</button>
            <button onClick={() => select('')}>Clear</button><button onClick={() => setEnabled(false)}>Disable</button>
            <button onClick={() => thread.loadDirectMessages()}>Refresh</button>
            <div id="messages">{thread.directMessages.map(m => <p key={m.id}>{m.body}</p>)}</div>
            <div id="status">{thread.messagesError || (thread.messagesLoading ? 'Loading' : 'Ready')}</div></>;
        }
        createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: resolve('.'), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    alias: { '@': resolve('dashboard') },
  });
  bundle = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

async function mount(deviceMode = false) {
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.route('http://communications.test/**', route => route.fulfill({
    contentType: 'text/html', body: '<div id="root"></div>',
  }));
  await page.goto('http://communications.test');
  await page.evaluate(deviceMode => {
    const w = window as any;
    w.deviceMode = deviceMode;
    w.requests = [];
    w.fetch = (url: string) => new Promise(resolve => {
      w.requests.push({ url, finish: (body: string, status = 200) => resolve(new Response(JSON.stringify({
        data: [{ id: body, body }], error: 'unavailable',
      }), { status, headers: { 'content-type': 'application/json' } })) });
    });
  }, deviceMode);
  await page.addScriptTag({ content: bundle });
  await page.getByRole('button', { name: 'Alice', exact: true }).waitFor();
}

async function finish(index: number, body: string, status = 200) {
  await page.evaluate(({ index, body, status }) => (window as any).requests[index].finish(body, status), { index, body, status });
}

describe('messages for the selected contact', () => {
  it('loads only the selected conversation and clears messages when the contact changes', async () => {
    await mount();
    expect(await page.evaluate(() => (window as any).requests.length)).toBe(0);
    await page.getByRole('button', { name: 'Alice', exact: true }).click();
    await page.waitForFunction(() => (window as any).requests.length === 1);
    expect(await page.evaluate(() => (window as any).requests[0].url))
      .toBe('/api/v1/communications/direct-messages?contactType=OPERATOR&contactId=alice');
    await finish(0, 'Alice conversation');
    await page.getByText('Alice conversation', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Bob', exact: true }).click();
    expect(await page.locator('#messages').innerText()).toBe('');
    await page.waitForFunction(() => (window as any).requests.length === 2);
    await finish(1, 'Bob conversation');
    await page.getByText('Bob conversation', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    expect(await page.locator('#messages').innerText()).toBe('');
    expect(await page.evaluate(() => (window as any).requests.length)).toBe(2);
  });

  it('ignores a previous contact response that arrives after switching', async () => {
    await mount();
    await page.getByRole('button', { name: 'Alice', exact: true }).click();
    await page.waitForFunction(() => (window as any).requests.length === 1);
    await page.getByRole('button', { name: 'Bob', exact: true }).click();
    await page.waitForFunction(() => (window as any).requests.length === 2);
    await finish(1, 'Bob conversation');
    await page.getByText('Bob conversation', { exact: true }).waitFor();
    await finish(0, 'Alice conversation');
    expect(await page.locator('#messages').innerText()).toBe('Bob conversation');
  });

  it('keeps newer refresh results when an older request finishes late', async () => {
    await mount();
    await page.getByRole('button', { name: 'Alice', exact: true }).click();
    await page.waitForFunction(() => (window as any).requests.length === 1);
    await page.evaluate(() => (window as any).messageCreated({}));
    await page.waitForFunction(() => (window as any).requests.length === 2);
    await finish(1, 'New message');
    await page.getByText('New message', { exact: true }).waitFor();
    await finish(0, 'Old message');
    expect(await page.locator('#messages').innerText()).toBe('New message');
  });

  it('uses the device endpoint and drops pending responses after disabling', async () => {
    await mount(true);
    await page.getByRole('button', { name: 'Alice', exact: true }).click();
    await page.waitForFunction(() => (window as any).requests.length === 1);
    expect(await page.evaluate(() => (window as any).requests[0].url))
      .toBe('/v1/communications/device-direct-messages?contactType=OPERATOR&contactId=alice');
    await page.getByRole('button', { name: 'Disable', exact: true }).click();
    await finish(0, 'Disabled conversation');
    expect(await page.locator('#messages').innerText()).toBe('');
  });

  it('shows load failures for the selected contact and can retry', async () => {
    await mount();
    await page.getByRole('button', { name: 'Alice', exact: true }).click();
    await page.waitForFunction(() => (window as any).requests.length === 1);
    await finish(0, '', 404);
    await page.getByText('Messaging is unavailable on this server.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => (window as any).requests.length === 2);
    await finish(1, 'Recovered conversation');
    await page.getByText('Recovered conversation', { exact: true }).waitFor();
    expect(await page.locator('#status').innerText()).toBe('Ready');
  });
});
