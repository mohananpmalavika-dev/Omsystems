import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

await context.addCookies([
  { name: 'sentinel_access', value: 'test-session-token', domain: 'localhost', path: '/' }
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
page.on('console', msg => console.log('PAGE:', msg.text()));

await page.goto('http://localhost:3000/control-room', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// Use real mouse click with Playwright locator instead of element.click()
const summary = page.locator('details.nav-group summary').first();
console.log('Real clicking with Playwright mouse on first summary...');
await summary.click();
await page.waitForTimeout(1000);

const isDetailsOpen = await page.locator('details.nav-group').first().evaluate(el => el.open);
console.log('Is details open after real user click?', isDetailsOpen);
console.log('localStorage now:', await page.evaluate(() => localStorage.getItem('sentinel-grid-open-navigation-groups')));

await browser.close();
