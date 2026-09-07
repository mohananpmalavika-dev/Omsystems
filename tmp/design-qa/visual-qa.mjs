import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const out = 'C:/Omsystems/tmp/design-qa';
const label = process.argv[2] || 'before';
const user = { id: 'qa-user', name: 'Design Reviewer', email: 'reviewer@example.test', role: 'super_admin' };
const branches = [{ id: 'qa-branch', name: 'Chennai Central', code: 'CHN-001', status: 'active' }];
const cameras = Array.from({length: 6}, (_, i) => ({
  id: `qa-camera-${i + 1}`, name: ['Main entrance', 'Reception', 'Service counter', 'Parking entrance', 'Cash room', 'East corridor'][i],
  branchId: 'qa-branch', branchName: 'Chennai Central', status: 'offline', healthStatus: 'offline',
  ipAddress: `192.0.2.${i + 10}`, vendor: 'Axis', model: 'M2025', sourceType: 'ip-camera',
  streamProfiles: [], streams: [], capabilities: { ptz: false, audio: false, events: true },
}));
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true});
const report = [];
for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
  const context = await browser.newContext({viewport});
  await context.addInitScript(({user}) => {
    sessionStorage.setItem('sentinel_browser_session', 'active');
    localStorage.setItem('user', JSON.stringify(user));
  }, {user});
  const calls = [];
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    calls.push(`${req.method()} ${url.pathname}`);
    let data = {data: [], success: true};
    if (url.pathname.endsWith('/auth/me')) data = user;
    else if (url.pathname.endsWith('/branches')) data = {data: branches};
    else if (url.pathname.endsWith('/cameras')) data = {data: cameras};
    else if (url.pathname.endsWith('/organization/tree')) data = {data: []};
    else if (url.pathname.endsWith('/health/summary')) data = {data: {totalCameras: 6, camerasOffline: 6, camerasOnline: 0}};
    else if (url.pathname.includes('/live-wall')) data = {data: {rules: [], alerts: [], summary: {total: 0, open: 0, new: 0, critical: 0, highPriority: 0}, sampledAt: new Date().toISOString()}};
    else if (url.pathname.endsWith('/engine/health')) data = {status: 'healthy'};
    else if (url.pathname.endsWith('/capabilities')) data = {domains: [], summary: {capabilities: 0}};
    else if (url.pathname.endsWith('/connectivity')) data = {profile: null, managedTunnel: null, supported: {tunnel: {available: true, managedAvailable: true}}};
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)});
  });
  for (const target of ['control-room', 'admin/branch-onboarding']) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:3000/${target}`, {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(3000);
    const path = `${out}/${label}-${target.replaceAll('/', '-')}-${viewport.width}.png`;
    await page.screenshot({path, fullPage: true});
    const info = await page.evaluate(() => ({
      title: document.title,
      width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
      text: document.body.innerText.slice(0, 9000),
      overflow: [...document.querySelectorAll('body *')].map(el => ({tag: el.tagName, text: el.innerText?.slice(0,100), class: el.className, rect: el.getBoundingClientRect().toJSON()})).filter(x => x.rect.width > 0 && (x.rect.right > innerWidth + 2 || x.rect.left < -2)).slice(0, 25),
    }));
    report.push({target, viewport, path, url: page.url(), errors, ...info});
    await page.close();
  }
  console.log(JSON.stringify({viewport, calls: [...new Set(calls)]}));
  await context.close();
}
await browser.close();
await fs.writeFile(`${out}/${label}-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.map(({text, overflow, ...r}) => ({...r, text: text.slice(0,300), overflowCount: overflow.length})), null, 2));
