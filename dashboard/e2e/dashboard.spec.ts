import { expect, test } from "@playwright/test";

test("loads branches and starts an authorized demo feed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const branchResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/branches"),
  );
  await page.goto("/");
  const branchResponse = await branchResponsePromise;
  expect(branchResponse.status()).toBe(200);
  expect((await branchResponse.json()).data).toHaveLength(4);
  await expect(page.getByRole("heading", { name: "Security operations" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Bengaluru Central/ })).toBeVisible();
  await expect(page.getByText("Main Entrance", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Watch live" }).first().click();
  await expect(page.getByText("Secure demo feed").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("keeps branch monitoring usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Bengaluru Central/ })).toBeVisible();
  await page.locator(".menu-button").click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByText("Main Entrance", { exact: true })).toBeVisible();
});
