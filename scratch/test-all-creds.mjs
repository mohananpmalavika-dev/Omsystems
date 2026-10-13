import { chromium } from 'playwright';

const testCreds = [
  { u: 'dhanya', p: 'dhanya123' },
  { u: 'mgdhanyamohan', p: 'dhanya123' },
  { u: 'mgdhanyamohan', p: 'mgdhanyamohan' },
  { u: 'mgdhanyamohan', p: 'admin123' },
  { u: 'admin', p: 'admin' },
  { u: 'admin', p: 'admin123' },
  { u: 'superadmin', p: 'superadmin' },
  { u: 'mgdhanyamohan@omsystems.bank', p: 'dhanya123' },
  { u: 'mgdhanyamohan@omsystems.bank', p: 'SentinelMasterAdmin2026!' },
];

async function tryHost(host) {
  console.log('Testing host:', host);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  for (const cred of testCreds) {
    try {
      await page.goto(`${host}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);

      // Check if password button exists
      const passTab = page.getByRole('button', { name: 'Password', exact: true });
      if (await passTab.isVisible()) {
        await passTab.click();
        await page.waitForTimeout(500);
      }

      await page.locator('#username').fill(cred.u);
      await page.locator('#password').fill(cred.p);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.waitForTimeout(3000);

      const url = page.url();
      console.log(`[${host}] ${cred.u} / ${cred.p} => URL: ${url}`);
      if (!url.includes('/login')) {
        console.log(`SUCCESS! Logged in with ${cred.u} / ${cred.p} on ${host}`);
        await page.screenshot({ path: `scratch/login_success_${cred.u}.png` });
        await browser.close();
        return { host, cred, success: true };
      }
    } catch (e) {
      console.log(`Error testing ${cred.u}: ${e.message}`);
    }
  }
  await browser.close();
  return null;
}

async function run() {
  await tryHost('https://3-7-216-169.sslip.io');
  await tryHost('https://34-14-220-41.sslip.io');
}

run();
