/**
 * Playwright Browser Manager
 *
 * Manages browser instances, isolated contexts, device profiles,
 * tracing, video recording, and clean teardown.
 */

import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { QABrowserType, QADeviceProfile } from "../types/qa.types";
import { mkdirSync } from "node:fs";

export interface BrowserLaunchOptions {
  browserType?: QABrowserType;
  deviceProfile?: QADeviceProfile;
  recordVideo?: boolean;
  videoDir?: string;
  enableTrace?: boolean;
  headless?: boolean;
  timeoutMs?: number;
}

export const DEVICE_VIEWPORTS: Record<QADeviceProfile, { width: number; height: number; isMobile?: boolean }> = {
  "Desktop 1920x1080": { width: 1920, height: 1080, isMobile: false },
  "Desktop 1440x900": { width: 1440, height: 900, isMobile: false },
  "Desktop 1366x768": { width: 1366, height: 768, isMobile: false },
  "Tablet 1024x768": { width: 1024, height: 768, isMobile: true },
  "Tablet 768x1024": { width: 768, height: 1024, isMobile: true },
  "Mobile 390x844": { width: 390, height: 844, isMobile: true },
  "Mobile 360x800": { width: 360, height: 800, isMobile: true },
};

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /**
   * Launch browser and initialize isolated context
   */
  async launch(options: BrowserLaunchOptions): Promise<{
    browser: Browser;
    context: BrowserContext;
    page: Page;
  }> {
    const bType = options.browserType || "chromium";
    const profile = options.deviceProfile || "Desktop 1920x1080";
    const viewport = DEVICE_VIEWPORTS[profile] || DEVICE_VIEWPORTS["Desktop 1920x1080"];
    const headless = options.headless ?? true;
    const timeoutMs = options.timeoutMs ?? 30_000;

    // Launch appropriate engine
    const launcher = bType === "firefox" ? firefox : bType === "webkit" ? webkit : chromium;
    this.browser = await launcher.launch({
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    // Configure context options
    const contextOptions: any = {
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile ?? false,
      hasTouch: viewport.isMobile ?? false,
      ignoreHTTPSErrors: true,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 KryptoVisionQA/1.0",
    };

    // Video recording
    if (options.recordVideo && options.videoDir) {
      mkdirSync(options.videoDir, { recursive: true });
      contextOptions.recordVideo = {
        dir: options.videoDir,
        size: { width: Math.min(viewport.width, 1920), height: Math.min(viewport.height, 1080) },
      };
    }

    this.context = await this.browser.newContext(contextOptions);
    this.context.setDefaultTimeout(timeoutMs);
    this.context.setDefaultNavigationTimeout(timeoutMs);

    // Tracing
    if (options.enableTrace) {
      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
    }

    this.page = await this.context.newPage();

    return {
      browser: this.browser,
      context: this.context,
      page: this.page,
    };
  }

  /**
   * Stop tracing and export to zip
   */
  async stopTracing(tracePath: string): Promise<void> {
    if (this.context) {
      try {
        await this.context.tracing.stop({ path: tracePath });
      } catch (err) {
        console.warn("[BrowserManager] Failed to stop tracing:", err);
      }
    }
  }

  /**
   * Close page, context, and browser instance cleanly
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    } catch (err) {
      console.error("[BrowserManager] Error during browser teardown:", err);
    }
  }
}
