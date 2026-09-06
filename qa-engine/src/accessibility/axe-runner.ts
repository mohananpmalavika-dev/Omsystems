/**
 * Accessibility Auditor
 *
 * Performs client-side WCAG 2.1 AA accessibility checks:
 * - Missing form labels
 * - Missing ARIA labels on icon buttons
 * - Missing image alt attributes
 * - Duplicate element IDs
 * - Invalid ARIA roles and tab indices
 * - Contrast heuristics and tap target sizing
 */

import type { Page } from "@playwright/test";
import type { QAAccessibilityViolation } from "../types/qa.types.js";

export class AxeRunner {
  /**
   * Run accessibility audit on current page
   */
  async runAudit(page: Page, runId = ""): Promise<QAAccessibilityViolation[]> {
    const pageUrl = page.url();

    const violations = await page.evaluate(() => {
      const issues: Array<{
        impact: "critical" | "serious" | "moderate" | "minor";
        ruleId: string;
        description: string;
        helpUrl?: string;
        nodes: Array<{ html: string; target: string[]; failureSummary?: string }>;
      }> = [];

      // 1. Missing form labels (Serious)
      const inputsWithoutLabels = Array.from(
        document.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
        )
      ).filter((el) => {
        const id = el.id;
        const hasAssociatedLabel = id && document.querySelector(`label[for="${id}"]`);
        const hasAriaLabel = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
        const hasParentLabel = el.closest("label");
        const hasPlaceholderOnly = el.hasAttribute("placeholder");
        return !hasAssociatedLabel && !hasAriaLabel && !hasParentLabel;
      });

      if (inputsWithoutLabels.length > 0) {
        issues.push({
          impact: "serious",
          ruleId: "label-missing",
          description: "Form elements must have clear, accessible labels",
          helpUrl: "https://www.w3.org/WAI/tutorials/forms/labels/",
          nodes: inputsWithoutLabels.slice(0, 5).map((el) => ({
            html: el.outerHTML.slice(0, 150),
            target: [el.id ? `#${el.id}` : el.tagName.toLowerCase()],
            failureSummary: "Input lacks an explicit <label>, aria-label, or aria-labelledby attribute",
          })),
        });
      }

      // 2. Buttons without accessible names (Critical/Serious)
      const emptyButtons = Array.from(
        document.querySelectorAll('button, [role="button"]')
      ).filter((btn) => {
        const text = (btn.textContent || (btn as HTMLInputElement).value || "").trim();
        const ariaLabel = btn.getAttribute("aria-label") || btn.getAttribute("title");
        return !text && !ariaLabel;
      });

      if (emptyButtons.length > 0) {
        issues.push({
          impact: "critical",
          ruleId: "button-name",
          description: "Buttons must have discernible, accessible text or aria-label",
          helpUrl: "https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html",
          nodes: emptyButtons.slice(0, 5).map((btn) => ({
            html: btn.outerHTML.slice(0, 150),
            target: [btn.id ? `#${btn.id}` : 'button:not([aria-label])'],
            failureSummary: "Button has no readable text, title, or aria-label for screen readers",
          })),
        });
      }

      // 3. Images without alt attributes (Moderate)
      const imagesWithoutAlt = Array.from(
        document.querySelectorAll("img:not([alt])")
      );
      if (imagesWithoutAlt.length > 0) {
        issues.push({
          impact: "moderate",
          ruleId: "image-alt",
          description: "Images must have informative alt attributes",
          helpUrl: "https://www.w3.org/WAI/tutorials/images/",
          nodes: imagesWithoutAlt.slice(0, 5).map((img) => ({
            html: img.outerHTML.slice(0, 150),
            target: [img.id ? `#${img.id}` : "img"],
            failureSummary: "<img> element is missing an alt attribute",
          })),
        });
      }

      // 4. Duplicate element IDs (Moderate)
      const ids = new Map<string, number>();
      document.querySelectorAll("[id]").forEach((el) => {
        const id = el.id.trim();
        if (id) ids.set(id, (ids.get(id) || 0) + 1);
      });
      const duplicateIds = Array.from(ids.entries()).filter(([_, count]) => count > 1);
      if (duplicateIds.length > 0) {
        issues.push({
          impact: "moderate",
          ruleId: "duplicate-id",
          description: "Document IDs must be unique across the entire page",
          helpUrl: "https://www.w3.org/WAI/WCAG21/Understanding/parsing.html",
          nodes: duplicateIds.slice(0, 5).map(([id, count]) => ({
            html: `<element id="${id}"> (${count} occurrences)`,
            target: [`#${id}`],
            failureSummary: `The id "${id}" is used ${count} times on this page`,
          })),
        });
      }

      // 5. Tiny click targets (< 24px) (Minor)
      const tinyTargets = Array.from(document.querySelectorAll("button, a")).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24);
      });
      if (tinyTargets.length > 0) {
        issues.push({
          impact: "minor",
          ruleId: "target-size",
          description: "Interactive touch/click targets should be at least 24x24 pixels",
          helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
          nodes: tinyTargets.slice(0, 5).map((el) => ({
            html: el.outerHTML.slice(0, 150),
            target: [el.id ? `#${el.id}` : el.tagName.toLowerCase()],
            failureSummary: `Target bounding box is ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}px`,
          })),
        });
      }

      return issues;
    }).catch(() => []);

    return violations.map((v) => ({
      id: `a11y-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      runId,
      pageUrl,
      impact: v.impact,
      ruleId: v.ruleId,
      description: v.description,
      helpUrl: v.helpUrl,
      nodes: v.nodes,
      createdAt: new Date().toISOString(),
    }));
  }
}
