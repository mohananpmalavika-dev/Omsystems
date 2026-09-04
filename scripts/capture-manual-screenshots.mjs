import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/manuals/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const BASE_URL = 'https://3-7-216-169.sslip.io';

const SCREENS = [
  { id: 'SS-001', name: 'login', path: '/login', requiresAuth: false },
  { id: 'SS-002', name: 'command-center', path: '/', requiresAuth: true },
  { id: 'SS-003', name: 'live-video-wall', path: '/control-room', requiresAuth: true },
  { id: 'SS-004', name: 'synced-playback', path: '/playback/synced', requiresAuth: true },
  { id: 'SS-005', name: 'recordings-vault', path: '/recordings', requiresAuth: true },
  { id: 'SS-006', name: 'alert-operations', path: '/operations/alerts', requiresAuth: true },
  { id: 'SS-007', name: 'incident-response', path: '/incidents', requiresAuth: true },
  { id: 'SS-008', name: 'evidence-vault', path: '/evidence', requiresAuth: true },
  { id: 'SS-009', name: 'ai-command-center', path: '/operations/ai-command-center', requiresAuth: true },
  { id: 'SS-010', name: 'ai-rules-automation', path: '/analytics/rules', requiresAuth: true },
  { id: 'SS-011', name: 'camera-health', path: '/operations/cameras', requiresAuth: true },
  { id: 'SS-012', name: 'storage-management', path: '/operations/storage', requiresAuth: true },
  { id: 'SS-013', name: 'organization-admin', path: '/admin/organization', requiresAuth: true },
  { id: 'SS-014', name: 'device-configuration', path: '/maintenance/device-configuration', requiresAuth: true },
  { id: 'SS-015', name: 'maintenance-workorders', path: '/maintenance/workorders', requiresAuth: true },
  { id: 'SS-016', name: 'compliance-framework', path: '/compliance', requiresAuth: true },
  { id: 'SS-017', name: 'capability-matrix', path: '/admin/platform/capabilities', requiresAuth: true },
];

async function capture() {
  console.log('Launching browser for screenshot capture...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // 1. Capture Login
  console.log('Capturing Login screen...');
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const loginPath = path.join(SCREENSHOT_DIR, 'SS-001-login.png');
    await page.screenshot({ path: loginPath });
    console.log('✓ Captured SS-001-login.png');
  } catch (err) {
    console.error('Failed to capture login:', err.message);
  }

  // 2. Perform Login
  console.log('Authenticating as superadmin...');
  try {
    await page.fill('#username', 'mgdhanyamohan');
    await page.fill('#password', 'SentinelMasterAdmin2026!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
    console.log('Current URL after submit:', page.url());
  } catch (err) {
    console.error('Authentication step failed:', err.message);
  }

  // 3. Capture Authenticated Screens
  for (const screen of SCREENS) {
    if (!screen.requiresAuth) continue;
    const targetUrl = `${BASE_URL}${screen.path}`;
    const filename = `${screen.id}-${screen.name}.png`;
    const outputPath = path.join(SCREENSHOT_DIR, filename);

    console.log(`Capturing ${screen.id} (${screen.name}) at ${screen.path}...`);
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: outputPath });
      const stats = fs.statSync(outputPath);
      console.log(`✓ Captured ${filename} (${stats.size} bytes)`);
    } catch (err) {
      console.error(`✗ Failed to capture ${filename}:`, err.message);
    }
  }

  await browser.close();
  console.log('Finished capturing screenshots!');
}

capture().catch(err => {
  console.error('Screenshot process fatal error:', err);
  process.exit(1);
});
