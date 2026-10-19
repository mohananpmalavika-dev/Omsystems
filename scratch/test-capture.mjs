import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  for (const host of ['https://3-7-216-169.sslip.io', 'https://35-200-130-81.sslip.io']) {
    console.log('Testing host:', host);
    try {
      await page.goto(`${host}/login`, { waitUntil: 'domcontentloaded', timeout: 12000 });
      console.log('Opened login at', host, 'title:', await page.title());
      
      await page.fill('#username', 'mgdhanyamohan');
      await page.fill('#password', 'SentinelMasterAdmin2026!');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
      console.log('After login URL:', page.url());
      if (!page.url().includes('/login')) {
        console.log('SUCCESSFULLY LOGGED IN ON', host);
        await page.screenshot({ path: 'scratch/after_login.png' });
        break;
      }
    } catch (e) {
      console.error('Failed on host', host, e.message);
    }
  }

  await browser.close();
}

main().catch(console.error);
