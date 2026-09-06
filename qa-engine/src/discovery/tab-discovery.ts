/**
 * Tab Discovery & Testing Engine
 *
 * Identifies tab controls (role="tab", tablist) and tests safe tab navigation.
 */

import type { Page } from "@playwright/test";

export interface DiscoveredTab {
  id: string;
  label: string;
  selector: string;
  isSelected: boolean;
  controlsId?: string;
}

export class TabDiscovery {
  /**
   * Find tabs present on the page
   */
  async findTabs(page: Page): Promise<DiscoveredTab[]> {
    return page.evaluate(() => {
      const tabs: DiscoveredTab[] = [];
      const tabElements = Array.from(document.querySelectorAll('[role="tab"], button[data-tab]'));

      for (let i = 0; i < tabElements.length; i++) {
        const el = tabElements[i];
        const label = (el.textContent || el.getAttribute("aria-label") || `Tab ${i + 1}`).trim();
        const isSelected = el.getAttribute("aria-selected") === "true" || el.classList.contains("active");
        const controlsId = el.getAttribute("aria-controls") || undefined;
        const selector = el.id
          ? `#${el.id}`
          : `[role="tab"]:has-text("${label}")`;

        tabs.push({
          id: el.id || `tab-${i}`,
          label,
          selector,
          isSelected,
          controlsId,
        });
      }

      return tabs;
    });
  }

  /**
   * Switch to a tab and measure response
   */
  async switchTab(
    page: Page,
    tab: DiscoveredTab
  ): Promise<{ success: boolean; switchTimeMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      const locator = page.locator(tab.selector).first();
      await locator.click({ timeout: 5000 });
      await page.waitForTimeout(300); // Allow render
      const switchTimeMs = Date.now() - startTime;
      return { success: true, switchTimeMs };
    } catch (err: any) {
      return {
        success: false,
        switchTimeMs: Date.now() - startTime,
        error: err.message,
      };
    }
  }
}
