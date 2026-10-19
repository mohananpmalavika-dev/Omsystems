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

  console.log("Logged in! Clicking 'Live' button on sidebar...");
  const liveBtn = page.getByRole('button', { name: 'Live', exact: true }).or(page.locator('button:has-text("Live")')).first();
  await liveBtn.click();
  await page.waitForTimeout(4000);

  console.log("Current URL after Live click:", page.url());

  // Click on branch selector at the top (e.g. "All branches")
  console.log("Looking for Branch selector...");
  const branchBtn = page.getByRole('button', { name: /branches/i }).or(page.locator('button:has-text("branches")')).first();
  if (await branchBtn.isVisible()) {
    console.log("Clicking branch selector button...");
    await branchBtn.click();
    await page.waitForTimeout(1000);

    // Look for PERAVARUNI in dropdown / modal
    const peraOption = page.getByText('PERAVARUNI', { exact: false }).first();
    if (await peraOption.isVisible()) {
      console.log("Selecting PERAVARUNI branch...");
      await peraOption.click();
      await page.waitForTimeout(4000);
    }
  }

  // Wait 5 seconds for live streams to play
  await page.waitForTimeout(5000);

  // Take screenshot of live cameras
  await page.screenshot({ path: "scratch/peravaruni_live_view.png", fullPage: true });
  console.log("Screenshot saved to scratch/peravaruni_live_view.png");

  await browser.close();
}

main().catch(console.error);
