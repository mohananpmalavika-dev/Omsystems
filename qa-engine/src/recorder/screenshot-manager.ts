/**
 * Screenshot Manager
 *
 * Takes screenshots at critical milestones (login, new pages, dialogs, errors)
 * while ensuring sensitive fields (passwords, tokens, secret keys) are masked.
 */

import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface ScreenshotOptions {
  label: string;
  isError?: boolean;
  fullPage?: boolean;
  maskSensitive?: boolean;
}

export class ScreenshotManager {
  private screenshotIndex = 0;
  private screenshotsDir: string;
  private capturedPaths: Array<{ label: string; filePath: string; relativePath: string }> = [];

  constructor(baseArtifactsDir: string) {
    this.screenshotsDir = join(baseArtifactsDir, "screenshots");
    mkdirSync(this.screenshotsDir, { recursive: true });
  }

  /**
   * Take screenshot with secret masking
   */
  async capture(page: Page, options: ScreenshotOptions): Promise<string> {
    this.screenshotIndex++;
    const indexStr = String(this.screenshotIndex).padStart(3, "0");
    const safeLabel = options.label.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase().slice(0, 40);
    const fileName = `${indexStr}-${safeLabel}.png`;
    const filePath = join(this.screenshotsDir, fileName);
    const relativePath = `screenshots/${fileName}`;

    try {
      // Mask password inputs and sensitive attributes before capturing
      if (options.maskSensitive ?? true) {
        await page.evaluate(() => {
          const sensitiveElements = document.querySelectorAll(
            'input[type="password"], [data-secret], [data-mask], [data-testid*="password"], [data-testid*="token"]'
          );
          sensitiveElements.forEach((el) => {
            (el as HTMLElement).style.filter = "blur(8px)";
          });
        }).catch(() => {});
      }

      await page.screenshot({
        path: filePath,
        fullPage: options.fullPage ?? false,
        timeout: 5000,
      });

      // Restore elements
      if (options.maskSensitive ?? true) {
        await page.evaluate(() => {
          const sensitiveElements = document.querySelectorAll(
            'input[type="password"], [data-secret], [data-mask], [data-testid*="password"], [data-testid*="token"]'
          );
          sensitiveElements.forEach((el) => {
            (el as HTMLElement).style.filter = "";
          });
        }).catch(() => {});
      }

      this.capturedPaths.push({ label: options.label, filePath, relativePath });
      return relativePath;
    } catch (err) {
      console.warn(`[ScreenshotManager] Failed to capture screenshot "${fileName}":`, err);
      return "";
    }
  }

  getCaptured(): Array<{ label: string; filePath: string; relativePath: string }> {
    return this.capturedPaths;
  }
}
