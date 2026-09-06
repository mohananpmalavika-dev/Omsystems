/**
 * Interactive Element Discovery Engine
 *
 * Scans the active page DOM to identify navigable and interactive elements
 * (links, buttons, menu items, tabs, forms, selects).
 */

import type { Page } from "@playwright/test";

export interface DiscoveredElement {
  text: string;
  ariaLabel?: string;
  href?: string;
  role?: string;
  tagName: string;
  selector: string;
  domPath: string;
  isVisible: boolean;
  isEnabled: boolean;
  isNavigation: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
  category: "nav" | "sidebar" | "tab" | "link" | "button" | "dropdown" | "dialog" | "form";
}

export class ElementDiscovery {
  /**
   * Discover interactive elements on page
   */
  async discover(page: Page): Promise<DiscoveredElement[]> {
    return page.evaluate(() => {
      const results: DiscoveredElement[] = [];

      // Helper to generate a unique CSS selector or path
      function getCssPath(el: Element): string {
        if (el.id) return `#${el.id}`;
        const testId = el.getAttribute("data-testid");
        if (testId) return `[data-testid="${testId}"]`;

        const path: string[] = [];
        let current: Element | null = el;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.nodeName.toLowerCase();
          if (current.id) {
            selector = `#${current.id}`;
            path.unshift(selector);
            break;
          } else {
            let sib = current;
            let nth = 1;
            while (sib.previousElementSibling) {
              sib = sib.previousElementSibling;
              if (sib.nodeName.toLowerCase() === selector) nth++;
            }
            if (nth !== 1) selector += `:nth-of-type(${nth})`;
          }
          path.unshift(selector);
          current = current.parentElement;
        }

        return path.join(" > ");
      }

      // Query interactive elements
      const candidates = Array.from(
        document.querySelectorAll(
          'a[href], button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], summary, select, input:not([type="hidden"]), textarea, form'
        )
      );

      for (const el of candidates) {
        // Skip invisible or disabled
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0";

        if (!isVisible) continue;

        const tagName = el.tagName.toLowerCase();
        const text = (el.textContent || (el as HTMLInputElement).value || "").trim().slice(0, 100);
        const ariaLabel = el.getAttribute("aria-label") || undefined;
        const href = (el as HTMLAnchorElement).href || undefined;
        const role = el.getAttribute("role") || undefined;
        const isEnabled = !(el as HTMLButtonElement).disabled;
        const selector = getCssPath(el);

        // Determine category
        let category: DiscoveredElement["category"] = "button";
        const inNav = Boolean(el.closest("nav, header, [role='navigation']"));
        const inSidebar = Boolean(el.closest("aside, .sidebar, [role='complementary']"));

        if (tagName === "form") {
          category = "form";
        } else if (role === "tab" || el.closest('[role="tablist"]')) {
          category = "tab";
        } else if (tagName === "select" || el.getAttribute("aria-haspopup") === "listbox") {
          category = "dropdown";
        } else if (el.hasAttribute("data-dialog") || el.hasAttribute("data-modal-target")) {
          category = "dialog";
        } else if (inSidebar) {
          category = "sidebar";
        } else if (inNav) {
          category = "nav";
        } else if (tagName === "a" || href || role === "link") {
          category = "link";
        }

        results.push({
          text,
          ariaLabel,
          href,
          role,
          tagName,
          selector,
          domPath: selector,
          isVisible,
          isEnabled,
          isNavigation: Boolean(href) || inNav || inSidebar || role === "link",
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          category,
        });
      }

      return results;
    });
  }
}
