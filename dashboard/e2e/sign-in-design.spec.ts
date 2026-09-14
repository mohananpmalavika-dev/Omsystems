import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const theme of ["light", "dark", "navy", "emerald"]) {
  test(`sign-in stays readable and usable with saved ${theme} theme`, async ({ page }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("sentinel-grid-active-theme", theme);
      localStorage.setItem("sentinel-grid-org-branding", JSON.stringify({
        organizationId: null, orgName: "OM Systems", orgCode: "OM", logoUrl: null, tagline: "Security operations",
      }));
    }, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login?logout=true", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "signed out successfully" })).toBeVisible();
    await expect(page.locator(".login-header h1")).toHaveCSS("color", "rgb(23, 43, 69)");
    await expect(page.locator(".login-card")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.getByRole("button", { name: "Password", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Select color theme" })).toHaveCount(0);
    await expect(page.getByText("OM Systems", { exact: true })).toHaveCount(1);
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("example-password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByText("Use an organization code", { exact: true }).click();
    await expect(page.getByLabel("Organization Code", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  });
}
