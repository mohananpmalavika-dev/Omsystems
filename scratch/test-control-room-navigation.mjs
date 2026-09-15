import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

// Add the auth cookie!
await context.addCookies([
  {
    name: 'sentinel_access',
    value: 'test-session-token',
    domain: 'localhost',
    path: '/',
  },
  {
    name: 'sentinel_refresh',
    value: 'test-refresh-token',
    domain: 'localhost',
    path: '/',
  }
]);

const user = { id: 'qa-user', name: 'Design Reviewer', email: 'reviewer@example.test', role: 'super_admin' };
const branches = [{ id: 'qa-branch', name: 'Chennai Central', code: 'CHN-001', status: 'active' }];
const cameras = Array.from({ length: 6 }, (_, i) => ({
  id: `qa-camera-${i + 1}`,
  name: ['Main entrance', 'Reception', 'Service counter', 'Parking entrance', 'Cash room', 'East corridor'][i],
  branchId: 'qa-branch',
  branchName: 'Chennai Central',
  status: 'offline',
  healthStatus: 'offline',
  ipAddress: `192.0.2.${i + 10}`,
  vendor: 'Axis',
  model: 'M2025',
  sourceType: 'ip-camera',
  streamProfiles: [],
  streams: [],
  capabilities: { ptz: false, audio: false, events: true },
}));

await context.addInitScript(({ user }) => {
  localStorage.setItem('sentinel-grid-active-theme', 'light');
  sessionStorage.setItem('sentinel_browser_session', 'active');
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('accessToken', 'test-session-token');
}, { user });

await context.route('**/*', async route => {
  const req = route.request();
  const url = new URL(req.url());
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  
  let data = { data: [], success: true };
  if (url.pathname.endsWith('/auth/me')) data = user;
  else if (url.pathname.endsWith('/branches')) data = { data: branches };
  else if (url.pathname.endsWith('/cameras')) data = { data: cameras };
  else if (url.pathname.endsWith('/health/summary')) data = { data: { totalCameras: 6, camerasOffline: 6, camerasOnline: 0 } };
  else if (url.pathname.includes('/live-wall')) data = { data: { rules: [], alerts: [], summary: { total: 0, open: 0, new: 0, critical: 0, highPriority: 0 }, sampledAt: new Date().toISOString() } };
  else if (url.pathname.endsWith('/engine/health') || url.pathname.endsWith('/engine-health')) data = { status: 'healthy' };
  else if (url.pathname.endsWith('/capabilities')) data = { domains: [], summary: { capabilities: 0 } };
  else if (url.pathname.endsWith('/connectivity')) data = { profile: null, managedTunnel: null, supported: { tunnel: { available: true, managedAvailable: true } } };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
});

const page = await context.newPage();
const consoleLogs = [];
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
  else consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', err => consoleErrors.push(err.message));

console.log('Navigating to http://localhost:3000/control-room...');
await page.goto('http://localhost:3000/control-room', { waitUntil: 'domcontentloaded' });
console.log('DOM Content Loaded. Waiting for page ready...');
await page.waitForTimeout(4000);

console.log('Current URL:', page.url());
console.log('Title:', await page.title());

// 1. Check sidebar links
const navLinks = page.locator('.main-nav a');
const count = await navLinks.count();
console.log('Nav links count in sidebar:', count);

// Print all groups and items
const groups = await page.locator('details.nav-group').all();
console.log('Nav groups count:', groups.length);
for (let i = 0; i < groups.length; i++) {
  const summaryText = await groups[i].locator('summary').innerText();
  const isOpen = await groups[i].getAttribute('open') !== null;
  const items = await groups[i].locator('.nav-items a').allInnerTexts();
  console.log(`Group: "${summaryText.trim()}" (open: ${isOpen}), items (${items.length}):`, items.slice(0, 3));
}

// Try clicking summary of closed group
for (let i = 0; i < groups.length; i++) {
  const isOpen = await groups[i].getAttribute('open') !== null;
  if (!isOpen) {
    const summaryText = await groups[i].locator('summary').innerText();
    console.log(`Clicking summary of closed group: "${summaryText.trim()}"`);
    await groups[i].locator('summary').click();
    await page.waitForTimeout(500);
    const nowOpen = await groups[i].getAttribute('open') !== null;
    console.log(`  Group is now open: ${nowOpen}`);
    break;
  }
}

// 2. Try clicking an item in the sidebar, e.g. "Command Center" or "Branch Overview"
const branchOverviewLink = page.locator('.main-nav a[href="/operations/branches"]').first();
if (await branchOverviewLink.count() > 0) {
  console.log('Found /operations/branches link, clicking it...');
  await branchOverviewLink.click();
  await page.waitForTimeout(2000);
  console.log('URL after clicking /operations/branches:', page.url());
}

// Try shortcut Overview link
console.log('Trying Overview shortcut link...');
const overviewLink = page.locator('.nav-shortcuts a[href="/"]').first();
if (await overviewLink.count() > 0) {
  await overviewLink.click();
  await page.waitForTimeout(2000);
  console.log('URL after clicking Overview shortcut:', page.url());
}

// 3. Test on mobile / compact viewport
console.log('\n--- Testing compact viewport (390px) ---');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://localhost:3000/control-room', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const menuBtn = page.locator('button.menu-button');
console.log('Menu button visible:', await menuBtn.isVisible());
console.log('Sidebar before menu click, has "open" class:', await page.locator('aside.sidebar').evaluate(el => el.classList.contains('open')));
await menuBtn.click();
await page.waitForTimeout(500);
console.log('Sidebar after menu click, has "open" class:', await page.locator('aside.sidebar').evaluate(el => el.classList.contains('open')));
console.log('Sidebar inert attribute:', await page.locator('aside.sidebar').getAttribute('inert'));

console.log('\nConsole errors during test:', consoleErrors);

await browser.close();
