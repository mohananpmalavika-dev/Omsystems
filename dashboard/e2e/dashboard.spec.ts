import { expect, test } from "@playwright/test";

test("loads the command center and exposes the branch workspace", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.route("**/api/control/v1/operations/command-center", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data: { branches: { total: 0, healthy: 0 }, cameras: { total: 0 } } }),
  }));
  await page.route("**/api/control/v1/operations/branches", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data: [] }),
  }));

  const branchResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/control/v1/operations/branches"),
  );
  await page.goto("/");
  const branchResponse = await branchResponsePromise;
  expect(branchResponse.status()).toBe(200);
  expect(Array.isArray((await branchResponse.json()).data)).toBe(true);
  await expect(page.getByRole("heading", { name: "Surveillance Command Center" })).toBeVisible();
  await expect(page.getByText("Fleet Operational Board", { exact: true })).toBeVisible();
  const workspaceLink = page.getByRole("link", { name: "Workspace →" }).first();
  if (await workspaceLink.count()) {
    await expect(workspaceLink).toBeVisible();
  } else {
    await expect(page.getByText(/No branches enrolled yet|Branch telemetry unavailable/)).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("keeps branch monitoring usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".menu-button").click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Surveillance Command Center" })).toBeVisible();
});
