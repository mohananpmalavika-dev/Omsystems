/**
 * Login Executor
 *
 * Safely fills and submits authentication credentials into detected form fields.
 */

import type { Page } from "@playwright/test";
import type { LoginSignals } from "./login-detector.js";

export interface LoginCredentials {
  username?: string;
  password?: string;
}

export class LoginExecutor {
  /**
   * Perform login using detected or provided selectors
   */
  async execute(
    page: Page,
    signals: LoginSignals,
    credentials: LoginCredentials,
    timeoutMs = 15_000
  ): Promise<{ success: boolean; message: string }> {
    if (!credentials.username || !credentials.password) {
      return { success: false, message: "Username or password not provided" };
    }

    try {
      const usernameSelector = signals.detectedSelectors.usernameSelector || 'input[type="text"], input[type="email"]';
      const passwordSelector = signals.detectedSelectors.passwordSelector || 'input[type="password"]';

      // 1. Fill username
      const userField = page.locator(usernameSelector).first();
      await userField.waitFor({ state: "visible", timeout: timeoutMs });
      await userField.click();
      await userField.fill(credentials.username);

      // 2. Fill password
      const passField = page.locator(passwordSelector).first();
      await passField.waitFor({ state: "visible", timeout: timeoutMs });
      await passField.click();
      await passField.fill(credentials.password);

      // 3. Submit form
      if (signals.detectedSelectors.submitSelector) {
        const submitBtn = page.locator(signals.detectedSelectors.submitSelector).first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
        } else {
          await passField.press("Enter");
        }
      } else {
        await passField.press("Enter");
      }

      return { success: true, message: "Credentials submitted successfully" };
    } catch (err: any) {
      return { success: false, message: `Failed to submit login form: ${err.message}` };
    }
  }
}
