import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

await context.addCookies([
  { name: 'sentinel_access', value: 'test-session-token', domain: 'localhost', path: '/' },
  { name: 'sentinel_refresh', value: 'test-refresh-token', domain: 'localhost', path: '/' }
]);

const user = { id: 'qa-user', name: 'Design Reviewer', email: 'reviewer@example.test', role: 'super_admin' };
await context.addInitScript(({ user }) => {
  localStorage.setItem('sentinel-grid-active-theme', 'light');
  sessionStorage.setItem('sentinel_browser_session', 'active');
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('accessToken', 'test-session-token');
}, { user });

await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  let data = { data: [], success: true };
  if (url.pathname.endsWith('/auth/me')) data = user;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
});

const page = await context.newPage();
await page.goto('http://localhost:3000/control-room', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// Debug details & summary
const debugInfo = await page.evaluate(() => {
  const groups = [...document.querySelectorAll('details.nav-group')];
  return groups.map(g => ({
    open: g.hasAttribute('open'),
    summaryText: g.querySelector('summary')?.innerText,
    hasClickListener: !!g.querySelector('summary')
  }));
});
console.log('Initial groups debug:', debugInfo);

// Listen to console from page
page.on('console', msg => console.log('PAGE LOG:', msg.text()));

// Add a test click on first summary with detailed tracing
await page.evaluate(() => {
  const summary = document.querySelector('details.nav-group summary');
  console.log('Dispatching click to first summary:', summary?.innerText);
  summary?.click();
});
await page.waitForTimeout(500);

const afterClick = await page.evaluate(() => {
  const groups = [...document.querySelectorAll('details.nav-group')];
  return groups.map(g => ({
    open: g.hasAttribute('open'),
    summaryText: g.querySelector('summary')?.innerText,
    localStorage: localStorage.getItem('sentinel-grid-open-navigation-groups')
  }));
});
console.log('After click groups debug:', afterClick);

// Now test navigation link click!
console.log('\n--- Testing link click ---');
await page.evaluate(() => {
  const link = document.querySelector('.main-nav a[href="/operations/branches"]');
  console.log('Found link in main-nav:', link?.href);
  link?.click();
});
await page.waitForTimeout(1000);
console.log('Page URL 1s after click:', page.url());
await page.waitForTimeout(2000);
console.log('Page URL 3s after click:', page.url());

await browser.close();
