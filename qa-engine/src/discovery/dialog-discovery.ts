/**
 * Dialog & Modal Testing Engine
 *
 * Discovers and safely tests dialogs/modals (headings, close buttons, Escape key, backdrop),
 * while strictly preventing the execution of destructive action buttons.
 */

import type { Page } from "@playwright/test";
import { DestructiveActionClassifier } from "../safety/destructive-action-classifier.js";

export interface DiscoveredDialog {
  isOpen: boolean;
  heading?: string;
  selector: string;
  buttons: Array<{
    text: string;
    isCloseAction: boolean;
    isDestructive: boolean;
    selector: string;
  }>;
  hasCloseButton: boolean;
  hasBackdrop: boolean;
}

export class DialogDiscovery {
  private safetyClassifier = new DestructiveActionClassifier();

  /**
   * Check if any modal or dialog is currently open in the DOM
   */
  async inspectActiveDialog(page: Page): Promise<DiscoveredDialog | null> {
    const dialogInfo = await page.evaluate(() => {
      const dialog = document.querySelector(
        'dialog[open], [role="dialog"], [role="alertdialog"], .modal.show, .modal.open, [data-state="open"]'
      );
      if (!dialog) return null;

      const headingEl = dialog.querySelector("h1, h2, h3, h4, .modal-title, [data-dialog-title]");
      const heading = (headingEl?.textContent || "").trim();

      const buttons = Array.from(dialog.querySelectorAll("button, [role='button'], input[type='button']")).map((btn) => {
        const text = (btn.textContent || (btn as HTMLInputElement).value || "").trim();
        const ariaLabel = btn.getAttribute("aria-label") || "";
        const isCloseAction = /close|cancel|dismiss|x\b/i.test(`${text} ${ariaLabel}`);
        return {
          text,
          ariaLabel,
          isCloseAction,
          id: btn.id,
          classes: btn.className,
        };
      });

      const backdrop = Boolean(
        document.querySelector(".modal-backdrop, .overlay, [data-overlay], [aria-hidden='true'].fixed")
      );

      return {
        heading,
        buttons,
        hasBackdrop: backdrop,
        selector: dialog.id ? `#${dialog.id}` : '[role="dialog"], dialog[open]',
      };
    });

    if (!dialogInfo) return null;

    // Classify buttons with DestructiveActionClassifier
    const classifiedButtons = dialogInfo.buttons.map((btn) => {
      const isDestructive = this.safetyClassifier.isDestructive({
        text: btn.text,
        ariaLabel: btn.ariaLabel,
        cssClasses: btn.classes,
      });

      return {
        text: btn.text,
        isCloseAction: btn.isCloseAction,
        isDestructive,
        selector: btn.id ? `#${btn.id}` : `button:has-text("${btn.text}")`,
      };
    });

    return {
      isOpen: true,
      heading: dialogInfo.heading,
      selector: dialogInfo.selector,
      buttons: classifiedButtons,
      hasCloseButton: classifiedButtons.some((b) => b.isCloseAction),
      hasBackdrop: dialogInfo.hasBackdrop,
    };
  }

  /**
   * Safely dismiss active dialog via close button or Escape key
   */
  async safelyDismiss(page: Page, dialog: DiscoveredDialog): Promise<boolean> {
    try {
      // 1. Try safe close/cancel button first
      const closeButton = dialog.buttons.find((b) => b.isCloseAction && !b.isDestructive);
      if (closeButton) {
        const locator = page.locator(closeButton.selector).first();
        if (await locator.isVisible().catch(() => false)) {
          await locator.click({ timeout: 2000 });
          await page.waitForTimeout(300);
          return true;
        }
      }

      // 2. Try Escape key
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // Verify it closed
      const stillOpen = await this.inspectActiveDialog(page);
      return stillOpen === null;
    } catch {
      return false;
    }
  }
}
