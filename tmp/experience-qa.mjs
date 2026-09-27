import { chromium } from '../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const routes = ['/', '/modules', '/operations/branches', '/operations/cameras', '/operations/edge-agents', '/operations/storage', '/operations/recording', '/operations/alerts', '/operations/ha-failover', '/analytics', '/analytics/branch-comparison', '/analytics/people', '/analytics/face', '/analytics/banking/authorized-persons', '/maintenance', '/maintenance/health', '/maintenance/assets', '/maintenance/assets/new', '/maintenance/workorders/new', '/maintenance/privacy', '/maintenance/reports', '/compliance', '/compliance/risks', '/compliance/controls', '/compliance/assessments', '/audit/branch-compliance', '/admin', '/admin/system', '/admin/branch-onboarding', '/admin/ai-quality', '/admin/database', '/security-devices', '/security-devices/discovery', '/security-devices/branch-posture', '/communications/calls', '/communications/connect', '/reports', '/reports/mis', '/reports/ai-analytics/roi', '/recordings', '/video-search', '/evidence', '/incidents', '/incidents/create', '/account/security', '/support', '/performance', '/digital-twin', '/federation', '/login', '/forgot-password', '/reset-password', '/privacy', '/terms'];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await context.addCookies([{ name: 'sentinel_access', value: 'local-visual-qa', domain: '127.0.0.1', path: '/' }]);
await context.addInitScript(() => {
  localStorage.setItem('accessToken', 'local-visual-qa');
  sessionStorage.setItem('user', JSON.stringify({ id: 'visual-qa', role: 'superadmin', displayName: 'Design preview' }));
});
await context.route(/\/(api|v1)\//, async route => {
  const url = route.request().url();
  if (url.includes('/auth/me')) return route.fulfill({ status: 200, json: { id: 'visual-qa', role: 'superadmin', displayName: 'Design preview' } });
  if (url.includes('/operations/alerts')) return route.fulfill({ status: 200, json: { success: true, data: [] } });
  if (url.includes('/command-center')) return route.fulfill({ status: 200, json: { success: true, data: { cameras: { total: 0 }, branches: { total: 0 } } } });
  if (url.includes('/operations/branches')) return route.fulfill({ status: 200, json: { success: true, data: [] } });
  return route.fulfill({ status: 503, json: { success: false, message: 'Preview: service data unavailable' } });
});
fs.mkdirSync('tmp/experience-qa', { recursive: true });
const results = [];
let index = 0;
async function worker() {
  const page = await context.newPage();
  let pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  while (index < routes.length) {
    const route = routes[index++];
    pageErrors = [];
    try {
      const response = await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForTimeout(1000);
      const name = route.replaceAll('/', '-').replace(/^-/, '') || 'dashboard';
      await page.screenshot({ path: `tmp/experience-qa/${name}.png` });
      if (['/modules', '/maintenance', '/communications/calls', '/compliance/risks', '/admin/system'].includes(route)) {
        await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('dark'); document.documentElement.classList.remove('light'); });
        await page.screenshot({ path: `tmp/experience-qa/${name}-dark.png` });
        await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light'); });
      }
      const desktop = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, headings: [...document.querySelectorAll('h1')].map(el => el.textContent?.trim()), styledHeadings: document.querySelectorAll('.workspace-heading, .page-hero, .module-hero, .dashboard-hero, .recording-header').length, errorPage: document.body.innerText.includes('This page couldn’t load') }));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(700);
      const mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      await page.screenshot({ path: `tmp/experience-qa/${name}-mobile.png` });
      await page.setViewportSize({ width: 1440, height: 1000 });
      const result = { route, status: response?.status(), desktop, mobile, errors: [...pageErrors] };
      results.push(result);
      console.log(JSON.stringify(result));
    } catch (error) { results.push({ route, error: error.message }); console.log(route, error.message); }
  }
  await page.close();
}
await Promise.all([worker(), worker()]);
fs.writeFileSync('tmp/experience-qa/results.json', JSON.stringify(results, null, 2));
await browser.close();
const files = [];
function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'page.tsx') files.push(p); } }
walk('dashboard/app');
function walkComponents(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walkComponents(p); else if (e.name.endsWith('.tsx')) files.push(p); } }
walkComponents('dashboard/components');
const syntaxErrors = [];
for (const file of files) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  for (const diagnostic of result.diagnostics ?? []) if (diagnostic.category === ts.DiagnosticCategory.Error) syntaxErrors.push({ file, error: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') });
}
console.log('Source validation:', JSON.stringify({ pages: files.length, syntaxErrors }));
