/**
 * Blank Page & White-Screen Crash Detector
 *
 * Detects unrendered, crashed, or completely blank pages using
 * DOM node counts, text length, and main viewport heuristics.
 */

import type { Page } from "@playwright/test";

export interface BlankCheckResult {
  isBlank: boolean;
  elementCount: number;
  textLength: number;
  hasMainContent: boolean;
  reason?: string;
}

export class BlankPageDetector {
  private readonly minTextLength = 20;
  private readonly minVisibleElements = 5;

  /**
   * Check if active page is blank or crashed
   */
  async check(page: Page, gracePeriodMs = 2500): Promise<BlankCheckResult> {
    // Wait grace period for client-side rendering / hydrations
    await page.waitForTimeout(gracePeriodMs);

    return page.evaluate((options) => {
      if (!document.body) {
        return {
          isBlank: true,
          elementCount: 0,
          textLength: 0,
          hasMainContent: false,
          reason: "Missing <body> tag in DOM",
        };
      }

      const bodyText = (document.body.innerText || "").trim();
      const textLength = bodyText.length;

      // Check visible elements
      const allElements = Array.from(document.body.querySelectorAll("*"));
      let visibleCount = 0;

      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          visibleCount++;
        }
      }

      const hasMainContent = Boolean(
        document.querySelector("main, article, [role='main'], #root > div, #__next > div")
      );

      const isBlank = visibleCount < options.minVisibleElements && textLength < options.minTextLength;

      return {
        isBlank,
        elementCount: visibleCount,
        textLength,
        hasMainContent,
        reason: isBlank
          ? `Page rendered only ${visibleCount} visible element(s) and ${textLength} character(s) of text`
          : undefined,
      };
    }, { minTextLength: this.minTextLength, minVisibleElements: this.minVisibleElements });
  }
}
