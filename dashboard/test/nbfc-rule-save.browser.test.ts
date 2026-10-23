import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { resolve } from 'node:path';

let browser: Browser;
let page: Page;
let bundle: string;

beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{NbfcRulesWorkspace}from'./dashboard/components/nbfc-rules/nbfc-rules-workspace';createRoot(document.getElementById('root')).render(<NbfcRulesWorkspace/>);`, resolveDir: resolve('.'), loader: 'tsx' },
    bundle: true, write: false, outfile: resolve('.tmp/rule-save-check/browser.js'), format: 'iife', jsx: 'automatic',
    alias: { '@': resolve('dashboard') },
  });
  bundle = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  browser = await chromium.launch({ headless: true, timeout: 60000 });
}, 60000);
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

const rule = {
  id: 'rule-1', name: 'Closing clearance', description: 'Checks closing occupancy',
  enabled: false, state: 'INACTIVE', branchIds: [] as string[], cameraIds: [] as string[],
  condition: { metric: 'person_count', operator: 'GREATER_THAN', value: 0 },
  detectorType: 'person', durationMs: 60000, cooldownMs: 180000,
  schedule: { type: 'BRANCH_CLOSING', start: '18:00', end: '08:30', timezone: 'Asia/Kolkata' },
  severity: 'HIGH', actions: ['CREATE_ALERT', 'NOTIFY_BRANCH_MANAGER'], version: 1,
};

async function mount(options: { multipleTargets?: boolean; failOnce?: boolean; deferred?: boolean } = {}) {
  page = await browser.newPage(); page.setDefaultTimeout(5000);
  await page.route('http://rules.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://rules.test/analytics/rules');
  await page.evaluate(({ rule, options }) => {
    const w = window as any;
    const current = { ...rule, ...(options.multipleTargets ? { branchIds: ['b1','b2'], cameraIds: ['c1','c2'] } : {}) };
    w.saves = [];
    let failed = false;
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    w.fetch = async (url: string, init: any = {}) => {
      if (init.method === 'PATCH' || init.method === 'POST') {
        const payload = JSON.parse(init.body); w.saves.push({ url, method: init.method, payload });
        if (options.deferred) await new Promise<void>(resolve => { w.finishSave = resolve; });
        if (options.failOnce && !failed) { failed = true; return json({ error: 'storage_unavailable', message: 'Rule storage is temporarily unavailable. Please retry.' }, 503); }
        return json({ ...current, ...payload, id: current.id, version: 2 });
      }
      if (url === '/api/ai/rules') return json({ rules: [current] });
      if (url === '/api/branches') return json({ data: [{ id: 'b1', name: 'Bettaiah' }, { id: 'b2', name: 'Kollam' }] });
      if (url === '/api/ai/cameras') return json({ cameras: [{ id: 'c1', branchId: 'b1', name: 'Lobby' }, { id: 'c2', branchId: 'b2', name: 'Vault' }] });
      if (url === '/api/ai/zones') return json({ zones: [] });
      if (url === '/api/ai/rule-templates') return json({ templates: [] });
      if (url === '/api/ai/health') return json({ models: [] });
      return json({});
    };
  }, { rule, options });
  await page.addScriptTag({ content: bundle });
  await page.getByRole('button', { name: 'AI Rules (1)', exact: true }).click();
}

const saves = () => page.evaluate(() => (window as any).saves);
const edit = () => page.getByRole('button', { name: 'Edit Closing clearance', exact: true }).click();
const submit = () => page.getByRole('button', { name: 'Save & Apply Rule', exact: true }).click();

describe('rule builder save and apply', () => {
  it('applies a previously global, disabled rule to the branch selected on the page', async () => {
    await mount();
    await page.getByLabel('Branch', { exact: true }).selectOption('b1');
    await edit();
    expect(await page.getByLabel('Branch Target', { exact: true }).inputValue()).toBe('b1');
    await submit();
    await page.getByRole('status').waitFor();
    expect((await saves())[0]).toMatchObject({ method: 'PATCH', payload: { branchIds: ['b1'], cameraIds: [], scopeType: 'BRANCH', state: 'ACTIVE', enabled: true, condition: { value: 0 }, schedule: { start: '18:00', end: '08:30' } } });
    expect(await page.getByRole('dialog').count()).toBe(0);
  });

  it('guides an unscoped live save to the target field before making a request', async () => {
    await mount(); await edit(); await submit();
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('alert').innerText()).toContain('Select a branch or camera');
    expect(await saves()).toHaveLength(0);
    expect(await page.getByLabel('Branch Target', { exact: true }).evaluate(el => document.activeElement === el)).toBe(true);
    await page.getByLabel('Branch Target', { exact: true }).selectOption('b2');
    await submit(); await page.getByRole('status').waitFor();
    expect((await saves())[0].payload.branchIds).toEqual(['b2']);
  });

  it('preserves every existing branch and camera when editing a rule with multiple targets', async () => {
    await mount({ multipleTargets: true });
    await page.getByLabel('Branch', { exact: true }).selectOption('b1'); await edit();
    await submit(); await page.getByRole('status').waitFor();
    expect((await saves())[0].payload).toMatchObject({ branchIds: ['b1','b2'], cameraIds: ['c1','c2'] });
  });

  it('shows the server error, keeps form values, and allows a successful retry', async () => {
    await mount({ failOnce: true });
    await page.getByLabel('Branch', { exact: true }).selectOption('b1'); await edit();
    await submit(); await page.getByRole('alert').waitFor();
    expect(await page.getByRole('alert').innerText()).toContain('Rule storage is temporarily unavailable');
    expect(await page.getByLabel('Rule Name', { exact: true }).inputValue()).toBe(rule.name);
    await submit(); await page.getByRole('status').waitFor();
    expect(await saves()).toHaveLength(2);
  });

  it('prevents duplicate submissions while the save is pending', async () => {
    await mount({ deferred: true });
    await page.getByLabel('Branch', { exact: true }).selectOption('b1'); await edit();
    await page.getByRole('button', { name: 'Save & Apply Rule', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await page.getByRole('button', { name: 'Saving & Applying...' }).waitFor();
    expect(await page.getByRole('button', { name: 'Saving & Applying...' }).isDisabled()).toBe(true);
    expect(await saves()).toHaveLength(1);
    await page.evaluate(() => (window as any).finishSave()); await page.getByRole('status').waitFor();
  });

  it('inherits the selected camera for new rules and clears it when changing the branch', async () => {
    await mount(); await page.getByLabel('Branch', { exact: true }).selectOption('b1');
    await page.getByLabel('Camera', { exact: true }).selectOption('c1');
    await page.getByRole('button', { name: 'Create AI Rule', exact: true }).click();
    expect(await page.getByLabel('Camera Stream', { exact: true }).inputValue()).toBe('c1');
    await page.getByLabel('Branch Target', { exact: true }).selectOption('b2');
    expect(await page.getByLabel('Camera Stream', { exact: true }).inputValue()).toBe('ALL');
    await page.getByLabel('Rule Name', { exact: true }).fill('Kollam rule');
    await submit(); await page.getByRole('status').waitFor();
    expect((await saves())[0]).toMatchObject({ method: 'POST', payload: { branchIds: ['b2'], cameraIds: [], state: 'SHADOW', enabled: true } });
  });
});
