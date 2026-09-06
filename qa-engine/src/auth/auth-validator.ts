/**
 * Auth Validator
 *
 * Validates whether login succeeded using multiple browser signals
 * and accurately categorizes login blockers (MFA, CAPTCHA, Invalid Credentials, etc.).
 */

import type { Page, BrowserContext } from "@playwright/test";
import type { QAAuthStatus } from "../types/qa.types.js";

export interface AuthValidationResult {
  isAuthenticated: boolean;
  status: QAAuthStatus;
  message: string;
  detectedUrl: string;
}

export class AuthValidator {
  /**
   * Validate post-login state
   */
  async validate(
    page: Page,
    context: BrowserContext,
    initialLoginUrl: string,
    timeoutMs = 15_000
  ): Promise<AuthValidationResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const currentUrl = page.url();

      // 1. Check for CAPTCHA blockers
      const hasCaptcha = await page.evaluate(() => {
        const frames = Array.from(document.querySelectorAll("iframe"));
        const captchaFrame = frames.some((f) =>
          /recaptcha|hcaptcha|turnstile|arkoselabs/i.test(f.src || "")
        );
        const captchaElements = document.querySelectorAll(
          ".g-recaptcha, .h-captcha, [data-sitekey], #cf-turnstile"
        );
        return captchaFrame || captchaElements.length > 0;
      });

      if (hasCaptcha) {
        return {
          isAuthenticated: false,
          status: "CAPTCHA_PRESENT",
          message: "CAPTCHA detected on authentication page; automated solver disabled by security policy",
          detectedUrl: currentUrl,
        };
      }

      // 2. Check for MFA / 2FA blockers
      const hasMfa = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText.toLowerCase() : "";
        return (
          /two-factor|2fa|multi-factor|authenticator\s*code|verification\s*code|enter\s*the\s*6-digit|sms\s*code/i.test(
            bodyText
          ) &&
          Boolean(document.querySelector('input[type="text"], input[inputmode="numeric"], input[autocomplete="one-time-code"]'))
        );
      });

      if (hasMfa) {
        return {
          isAuthenticated: false,
          status: "MFA_REQUIRED",
          message: "MFA/Two-Factor verification required; please run with a test account with MFA disabled",
          detectedUrl: currentUrl,
        };
      }

      // 3. Check for explicit login error messages in DOM
      const explicitError = await page.evaluate(() => {
        const alerts = Array.from(
          document.querySelectorAll('.alert, [role="alert"], .error, .toast-error, .text-red-500, .text-destructive')
        );
        for (const el of alerts) {
          const text = (el.textContent || "").trim();
          if (/invalid\s*credentials|incorrect\s*username|wrong\s*password|user\s*not\s*found|access\s*denied/i.test(text)) {
            return text;
          }
        }
        return null;
      });

      if (explicitError) {
        return {
          isAuthenticated: false,
          status: "INVALID_CREDENTIALS",
          message: `Authentication rejected by server: "${explicitError}"`,
          detectedUrl: currentUrl,
        };
      }

      // 4. Check for success indicators:
      // - URL changed away from login
      // - Common authenticated dashboard elements appeared (sidebar, header, user menu, logout button)
      const urlChanged = currentUrl !== initialLoginUrl && !currentUrl.includes("/login");
      const hasDashboardElements = await page.evaluate(() => {
        const hasContainer = Boolean(
          document.querySelector(
            'header, nav, aside, [role="navigation"], .sidebar, [data-testid*="user-menu"], a[href*="logout"]'
          )
        );
        if (hasContainer) return true;
        const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
        return buttons.some((b) => /log\s*out|sign\s*out/i.test(b.textContent || ""));
      });

      // 5. Check cookies
      const cookies = await context.cookies().catch(() => []);
      const hasAuthCookie = cookies.some((c) =>
        /session|token|sentinel|auth|jwt/i.test(c.name)
      );

      if (urlChanged && (hasDashboardElements || hasAuthCookie)) {
        return {
          isAuthenticated: true,
          status: "SUCCESS",
          message: "Successfully authenticated; dashboard session active",
          detectedUrl: currentUrl,
        };
      }

      await page.waitForTimeout(500);
    }

    // If timeout reached without resolving
    return {
      isAuthenticated: false,
      status: "LOGIN_TIMEOUT",
      message: `Authentication timed out after ${Math.round(timeoutMs / 1000)}s without reaching dashboard`,
      detectedUrl: page.url(),
    };
  }
}
