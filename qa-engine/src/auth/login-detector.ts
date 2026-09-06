/**
 * Login Detector
 *
 * Employs multi-signal weighted scoring to accurately detect login pages
 * across diverse web applications without relying on brittle single selectors.
 */

import type { Page } from "@playwright/test";

export interface LoginSignals {
  hasPasswordInput: boolean;
  hasUsernameOrEmailInput: boolean;
  hasSubmitButton: boolean;
  hasForgotPassword: boolean;
  score: number;
  isLoginPage: boolean;
  detectedSelectors: {
    usernameSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
  };
}

export interface LoginSelectorOverride {
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
}

export class LoginDetector {
  private readonly threshold = 5;

  /**
   * Scan page for login signals and calculate confidence score
   */
  async detect(page: Page, override?: LoginSelectorOverride): Promise<LoginSignals> {
    // If override provided and selectors exist, confirm login page
    if (override?.passwordSelector) {
      const passwordExists = await page.locator(override.passwordSelector).first().isVisible().catch(() => false);
      if (passwordExists) {
        return {
          hasPasswordInput: true,
          hasUsernameOrEmailInput: true,
          hasSubmitButton: true,
          hasForgotPassword: false,
          score: 10,
          isLoginPage: true,
          detectedSelectors: {
            usernameSelector: override.usernameSelector,
            passwordSelector: override.passwordSelector,
            submitSelector: override.submitSelector,
          },
        };
      }
    }

    // Inspect DOM signals
    const signals = await page.evaluate(() => {
      let score = 0;
      let passwordSelector: string | undefined;
      let usernameSelector: string | undefined;
      let submitSelector: string | undefined;

      // 1. Password input detection (+5 points)
      const passwordInputs = Array.from(
        document.querySelectorAll('input[type="password"], input[name*="password" i], input[id*="password" i]')
      ) as HTMLInputElement[];

      const hasPasswordInput = passwordInputs.length > 0;
      if (hasPasswordInput) {
        score += 5;
        const target = passwordInputs[0];
        passwordSelector = target.id ? `#${target.id}` : target.name ? `input[name="${target.name}"]` : 'input[type="password"]';
      }

      // 2. Username or Email input detection (+3 points)
      const usernameInputs = Array.from(
        document.querySelectorAll(
          'input[type="email"], input[name*="user" i], input[name*="email" i], input[id*="user" i], input[id*="email" i], input[autocomplete="username"], input[autocomplete="email"]'
        )
      ) as HTMLInputElement[];

      const hasUsernameOrEmailInput = usernameInputs.length > 0;
      if (hasUsernameOrEmailInput) {
        score += 3;
        const target = usernameInputs[0];
        usernameSelector = target.id ? `#${target.id}` : target.name ? `input[name="${target.name}"]` : target.type === "email" ? 'input[type="email"]' : 'input[type="text"]';
      } else {
        // Fallback: first text input if password exists
        const firstText = document.querySelector('form input[type="text"], input[type="text"]') as HTMLInputElement;
        if (firstText && hasPasswordInput) {
          score += 2;
          usernameSelector = firstText.id ? `#${firstText.id}` : firstText.name ? `input[name="${firstText.name}"]` : 'input[type="text"]';
        }
      }

      // 3. Login / Sign-in button detection (+3 points)
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'));
      let hasSubmitButton = false;
      for (const btn of buttons) {
        const text = (btn.textContent || (btn as HTMLInputElement).value || "").trim().toLowerCase();
        if (/log\s*in|sign\s*in|continue|proceed|submit/i.test(text)) {
          score += 3;
          hasSubmitButton = true;
          submitSelector = btn.id ? `#${btn.id}` : `button:has-text("${text}")`;
          break;
        }
      }

      // 4. Forgot password link (+1 point)
      const links = Array.from(document.querySelectorAll("a"));
      const hasForgotPassword = links.some((a) =>
        /forgot|reset\s*password|trouble\s*signing\s*in/i.test(a.textContent || "")
      );
      if (hasForgotPassword) {
        score += 1;
      }

      return {
        hasPasswordInput,
        hasUsernameOrEmailInput,
        hasSubmitButton,
        hasForgotPassword,
        score,
        detectedSelectors: {
          usernameSelector,
          passwordSelector,
          submitSelector,
        },
      };
    });

    return {
      ...signals,
      isLoginPage: signals.score >= this.threshold,
    };
  }
}
