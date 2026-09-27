import { chromium } from '../node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
await page.context().addCookies([{ name: 'sentinel_access', value: 'local-visual-qa', domain: '127.0.0.1', path: '/' }]);
await page.addInitScript(() => {
  sessionStorage.setItem('user', JSON.stringify({ id: 'visual-qa', role: 'superadmin', displayName: 'Design preview' }));
  localStorage.setItem('accessToken', 'local-visual-qa');
});
await page.route(/\/(api|v1)\//, async route => {
  const url = route.request().url();
  const data = url.includes('/auth/me') ? { id: 'visual-qa', role: 'superadmin', displayName: 'Design preview' } : url.includes('/command-center') ? { cameras: { total: 0 }, branches: { total: 0 } } : [];
  await route.fulfill({ status: 200, json: { success: true, data } });
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
for (const route of ['/', '/login', '/maintenance', '/reports']) {
  await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  console.log(JSON.stringify({ route, url: page.url(), h1: await page.locator('h1').allTextContents(), overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await page.screenshot({ path: `tmp/redesign-${route.slice(1) || 'dashboard'}.png`, fullPage: false });
  if (route === '/') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'tmp/redesign-mobile.png', fullPage: true });
    console.log('mobile overflow:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.waitForTimeout(350);
    console.log('mobile menu:', await page.locator('#workspace-navigation').getAttribute('class'));
    await page.getByRole('button', { name: 'Close navigation', exact: true }).last().click();
    await page.setViewportSize({ width: 1440, height: 1080 });
    for (const theme of ['dark', 'navy', 'emerald', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.classList.toggle('dark', theme !== 'light'); document.documentElement.classList.toggle('light', theme === 'light'); }, theme);
      console.log('theme:', theme, await page.locator('.dashboard-overview-card').first().evaluate(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color })));
    }
  }
}
console.log('Browser errors:', JSON.stringify(errors));
await browser.close();
