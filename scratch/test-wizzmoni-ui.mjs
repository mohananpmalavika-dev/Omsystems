import { chromium } from 'playwright';

async function testDashboard() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  console.log('Navigating to login page...');
  await page.goto('https://34-14-220-41.sslip.io/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const passTab = page.getByRole('button', { name: 'Password', exact: true });
  if (await passTab.isVisible()) {
    await passTab.click();
    await page.waitForTimeout(500);
  }

  await page.locator('#username').fill('test');
  await page.locator('#password').fill('test@123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForTimeout(4000);

  console.log('Current URL after login:', page.url());
  await page.screenshot({ path: 'scratch/wizzmoni_dashboard_1.png', fullPage: true });

  // Let's check page title and any navigation links
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page text snippet:\n', text.slice(0, 1000));

  // If there is a cameras link or camera-monitoring link, let's navigate or check
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({ href: a.href, text: a.innerText })));
  console.log('Links on page:', links);

  // Navigate to /cameras or /camera-monitoring if available
  await page.goto('https://34-14-220-41.sslip.io/camera-monitoring', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/wizzmoni_camera_monitoring.png', fullPage: true });

  const camText = await page.evaluate(() => document.body.innerText);
  console.log('Camera monitoring text snippet:\n', camText.slice(0, 1000));

  await browser.close();
}

testDashboard().catch(console.error);
