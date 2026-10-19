import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto("https://35-200-130-81.sslip.io/login", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(1500);

  const passTab = page.getByRole('button', { name: 'Password', exact: true });
  if (await passTab.isVisible()) {
    await passTab.click();
    await page.waitForTimeout(300);
  }

  await page.locator('#username').fill('test');
  await page.locator('#password').fill('test@123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForTimeout(4000);

  console.log("Dumping elements...");
  const links = await page.$$eval('a', els => els.map(e => ({ text: e.innerText.trim(), href: e.href })));
  console.log("Links:", links);

  const buttons = await page.$$eval('button', els => els.map(e => e.innerText.trim()));
  console.log("Buttons:", buttons);

  await browser.close();
}

main().catch(console.error);
