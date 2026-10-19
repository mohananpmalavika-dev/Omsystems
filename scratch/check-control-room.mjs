import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("Navigating to https://35-200-130-81.sslip.io/login...");
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

  console.log("Navigating directly to /control-room...");
  await page.goto("https://35-200-130-81.sslip.io/control-room", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(5000);

  // Look for branch filter / buttons on control-room
  const peraBtn = page.getByText('PERAVARUNI', { exact: false }).first();
  if (await peraBtn.isVisible()) {
    console.log("Found PERAVARUNI button/text, clicking...");
    await peraBtn.click().catch(() => {});
    await page.waitForTimeout(4000);
  }

  // Wait for video streams to load
  await page.waitForTimeout(6000);

  await page.screenshot({ path: "scratch/control_room_peravaruni.png", fullPage: true });
  console.log("Screenshot saved to scratch/control_room_peravaruni.png");

  // Also check branch page
  await page.goto("https://35-200-130-81.sslip.io/operations/branches/d8467a57-dae8-4012-ba5e-c3254075aa61", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "scratch/branch_peravaruni.png", fullPage: true });
  console.log("Screenshot saved to scratch/branch_peravaruni.png");

  await browser.close();
}

main().catch(console.error);
