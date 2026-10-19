import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));
  page.on('response', res => {
    if (res.url().includes('live') || res.url().includes('hls') || res.url().includes('webrtc') || res.url().includes('media')) {
      console.log('MEDIA RES:', res.status(), res.url().slice(0, 100));
    }
  });

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
  await page.waitForTimeout(4000);

  // Look for video element
  const video = page.locator('video').first();
  console.log("Video element visible?", await video.isVisible().catch(() => false));

  // Let's click on CP PLUS DVR - Channel 1 under PERAVARUNI or click the video area
  const playBtn = page.locator('button:has-text("Play"), button[aria-label="Play"]').first();
  if (await playBtn.isVisible()) {
    console.log("Clicking play button...");
    await playBtn.click();
  }

  await page.waitForTimeout(8000);

  const videoProps = await video.evaluate(v => ({
    paused: v.paused,
    readyState: v.readyState,
    currentTime: v.currentTime,
    duration: v.duration,
    videoWidth: v.videoWidth,
    videoHeight: v.videoHeight,
    src: v.src,
    currentSrc: v.currentSrc
  })).catch(e => ({ error: e.message }));
  console.log("Video properties:", videoProps);

  await page.screenshot({ path: "scratch/video_inspection.png" });

  await browser.close();
}

main().catch(console.error);
