import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", hasTouch: true });

test("camera controls belong only to the selected grid position", async ({ page, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const user = { id: "qa-user", name: "Wall reviewer", email: "wall@example.test", role: "super_admin" };
  const cameras = ["Entrance", "Cash counter"].map((name, index) => ({
    id: `camera-${index}`, name, branchId: "branch", branchName: "QA Branch", status: "online",
    channel: index + 1, ipAddress: `192.0.2.${index + 10}`, sourceType: "ip-camera",
    vendor: "Axis", model: "QA", streamProfiles: [], capabilities: { ptz: false, audio: false, events: true },
  }));
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().addCookies([{ name: "sentinel_access", value: "local-qa", url: baseURL! }]);
  await page.addInitScript(user => {
    sessionStorage.setItem("sentinel_browser_session", "active");
    localStorage.setItem("user", JSON.stringify(user));
  }, user);
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname === "/qa-frame.jpg") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#173d47"/><path d="M0 300L230 120L640 300" fill="none" stroke="#90b9bc" stroke-width="8"/></svg>' });
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/v1/")) return route.continue();
    let data: unknown = { data: [] };
    if (url.pathname === "/api/live") {
      const cameraId = route.request().postDataJSON().cameraId;
      data = { sessionId: `session-${cameraId}`, cameraId, expiresAt: new Date(Date.now() + 3600_000).toISOString(), hls: { url: `${url.origin}/qa-frame.jpg`, bearerToken: "" } };
    } else if (url.pathname.endsWith("/auth/me")) data = user;
    else if (url.pathname.endsWith("/cameras")) data = { data: cameras, total: cameras.length };
    else if (url.pathname.endsWith("/branches")) data = { data: [{ id: "branch", name: "QA Branch", status: "active" }] };
    else if (url.pathname.endsWith("/health/summary")) data = { data: { totalCameras: 2, camerasOnline: 2, camerasOffline: 0 } };
    else if (url.pathname.endsWith("/live-wall")) data = { data: { rules: [], alerts: [], summary: { total: 0, open: 0, new: 0, critical: 0, highPriority: 0 } } };
    else if (url.pathname.endsWith("/capabilities")) data = { domains: [], summary: { capabilities: 0 } };
    await route.fulfill({ json: data });
  });

  await page.goto("/control-room", { timeout: 150_000 });
  await page.getByRole("button", { name: "Fleet wall", exact: true }).click();
  const slots = page.locator(".los-video-stage .grid-camera-slot");
  await expect(slots).toHaveCount(2);
  const first = slots.nth(0);
  const second = slots.nth(1);
  const actions = (slot: typeof first) => slot.locator(".tile-actions");
  await expect(actions(first)).toBeHidden();
  await expect(actions(second)).toBeHidden();
  await first.hover();
  await expect(actions(first)).toBeHidden();
  await expect(first.locator(".slot-controls")).toBeHidden();
  await expect(first.locator(".camera-meta")).toBeHidden();
  const frame = first.locator(".live-player-stage img");
  await expect(frame).toBeVisible();
  await expect(first.locator("button:visible, a:visible, input:visible, select:visible")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("wall-video-only.png"), fullPage: true, animations: "disabled" });
  const originalFrame = await frame.elementHandle();
  await first.locator(".feed-stage").click();
  await expect(actions(first)).toBeVisible();
  await expect(actions(second)).toBeHidden();
  await expect(first.locator(".camera-meta")).toBeVisible();
  await expect(first.locator(".slot-controls")).toBeVisible();
  await expect(first.getByRole("button", { name: /Unmute audio|Mute camera audio/ })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("wall-selected.png"), fullPage: true, animations: "disabled" });
  await second.locator(".feed-stage").click();
  await expect(actions(second)).toBeVisible();
  await expect(actions(first)).toBeHidden();
  expect(await frame.evaluate((element, original) => element === original, originalFrame)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(actions(second)).toBeHidden();

  await first.focus();
  await page.keyboard.press("Enter");
  await expect(actions(first)).toBeVisible();
  await second.focus();
  await page.keyboard.press("Space");
  await expect(actions(second)).toBeVisible();
  await expect(actions(first)).toBeHidden();
  await page.locator(".los-monitor-bar").click({ position: { x: 20, y: 15 } });
  await expect(actions(second)).toBeHidden();

  await page.getByRole("button", { name: "Open fullscreen monitor", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(actions(first)).toBeHidden();
  await first.locator(".feed-stage").click();
  await expect(actions(first)).toBeVisible();
  await expect(actions(second)).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("wall-fullscreen-selected.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Exit fullscreen monitor", exact: true }).click();
  await expect(actions(first)).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".workspace")).toHaveCSS("margin-left", "0px");
  await first.locator(".feed-stage").tap();
  await expect(actions(first)).toBeVisible();
  await expect(actions(second)).toBeHidden();
  await second.locator(".feed-stage").tap();
  await expect(actions(second)).toBeVisible();
  await expect(actions(first)).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: testInfo.outputPath("wall-mobile-selected.png"), fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});
