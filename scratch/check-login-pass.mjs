import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto('https://3-7-216-169.sslip.io/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.waitForTimeout(1000);

  // Fill credentials
  await page.locator('#username').fill('mgdhanyamohan');
  await page.locator('#password').fill('SentinelMasterAdmin2026!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForTimeout(6000);
  console.log('Current URL after login:', page.url());
  await page.screenshot({ path: 'scratch/after_login_success.png' });
  
  await browser.close();
}
run().catch(console.error);
