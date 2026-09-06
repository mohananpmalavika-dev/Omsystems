/**
 * Broken Navigation & Error Page Detector
 *
 * Detects HTTP 404/500 pages, application error screens,
 * router crashes, and broken user flow transitions.
 */

import type { Page, Response } from "@playwright/test";

export interface BrokenNavResult {
  isBroken: boolean;
  statusCode?: number;
  errorTitle?: string;
  reason?: string;
}

export class BrokenNavigationDetector {
  /**
   * Check if the page represents an error or broken route
   */
  async check(page: Page, lastResponse?: Response | null): Promise<BrokenNavResult> {
    const statusCode = lastResponse ? lastResponse.status() : undefined;

    // 1. Direct HTTP error status
    if (statusCode && statusCode >= 400) {
      return {
        isBroken: true,
        statusCode,
        errorTitle: `HTTP ${statusCode}`,
        reason: `Server responded with HTTP ${statusCode}`,
      };
    }

    // 2. Check DOM for common SPA 404/500/Crash indicators
    const domError = await page.evaluate(() => {
      const title = document.title.toLowerCase();
      const bodyText = document.body ? document.body.innerText.toLowerCase() : "";

      if (title.includes("404") || title.includes("not found")) {
        return { isBroken: true, errorTitle: "404 Not Found", reason: "Page title indicates 404 Not Found" };
      }

      if (title.includes("500") || title.includes("internal server error")) {
        return { isBroken: true, errorTitle: "500 Internal Error", reason: "Page title indicates 500 Server Error" };
      }

      // Check headings
      const headings = Array.from(document.querySelectorAll("h1, h2, h3"));
      for (const h of headings) {
        const text = (h.textContent || "").toLowerCase();
        if (text.includes("404") || text.includes("page not found") || text.includes("route not found")) {
          return { isBroken: true, errorTitle: "404 Not Found", reason: `Heading indicates "${text.trim()}"` };
        }
        if (text.includes("something went wrong") || text.includes("unexpected error") || text.includes("crash")) {
          return { isBroken: true, errorTitle: "Application Crash", reason: `Error boundary displayed "${text.trim()}"` };
        }
      }

      return null;
    });

    if (domError) {
      return domError;
    }

    return { isBroken: false };
  }
}
