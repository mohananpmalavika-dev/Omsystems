import { expect, test, type Page, type Route } from "@playwright/test";

const user = { id: "qa-user", name: "Reviewer", email: "reviewer@example.test", role: "super_admin" };
const branches = [
  { id: "qa-branch", name: "Chennai Central", code: "CHN-001", status: "active" },
  { id: "qa-other", name: "Delhi Central", code: "DEL-001", status: "active" },
];
const cameras = [
  { id: "qa-entrance", name: "Main entrance", branchId: "qa-branch", branchName: "Chennai Central", status: "offline", channel: 0 },
  { id: "qa-reception", name: "Reception", branchId: "qa-branch", branchName: "Chennai Central", status: "offline", channel: 1 },
  { id: "qa-delhi", name: "Delhi entrance", branchId: "qa-other", branchName: "Delhi Central", status: "offline", channel: 2 },
].map((camera) => ({ ...camera, ipAddress: "192.0.2.10", vendor: "Axis", model: "Test", sourceType: "ip-camera", streamProfiles: [], capabilities: { ptz: false, audio: false, events: true } }));

async function mockWorkspace(page: Page, portableHandler?: (route: Route) => Promise<void>) {
  await page.addInitScript((user) => {
    sessionStorage.setItem("sentinel_browser_session", "active");
    localStorage.setItem("user", JSON.stringify(user));
  }, user);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    let data: unknown = { success: true, data: [] };
    if (path.endsWith("/auth/me")) data = user;
    else if (path.endsWith("/branches")) data = { data: branches };
    else if (path.endsWith("/cameras")) {
      const branchId = /branches\/([^/]+)\/cameras$/.exec(path)?.[1];
      data = { data: branchId ? cameras.filter((camera) => camera.branchId === branchId) : cameras };
    }
    else if (path.endsWith("/health/summary")) data = { data: { totalCameras: 3, camerasOffline: 3, camerasOnline: 0 } };
    else if (path.endsWith("/alerts/alert-center")) data = { data: [{ cameraId: "qa-reception", severity: "critical", status: "open" }] };
    else if (path.endsWith("/provisioning")) data = { run: null };
    else if (path.endsWith("/live-wall")) data = { data: { rules: [], alerts: [], summary: { total: 0, open: 0, new: 0, critical: 0, highPriority: 0 }, sampledAt: new Date().toISOString() } };
    else if (path.endsWith("/engine-health")) data = { status: "healthy" };
    else if (path.endsWith("/capabilities")) data = { domains: [], summary: { capabilities: 0 } };
    else if (path.endsWith("/connectivity")) data = { profile: null, managedTunnel: null, supported: { tunnel: { available: true, managedAvailable: true } } };
    else if (path === "/api/portable-camera/devices") {
      if (portableHandler) return portableHandler(route);
      data = { devices: [], revokedDevices: [] };
    }
    await route.fulfill({ json: data });
  });
}

test("Live Wall resets hidden channels and updates equal-size camera searches", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/control-room");
  await page.getByRole("button", { name: "Clear All Filters", exact: true }).click();
  const slots = page.locator(".grid-camera-slot");
  await expect(slots).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Unavailable shown" })).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search cameras by name, IP address, or channel" });
  await search.fill("Main entrance");
  await expect(slots).toHaveCount(1);
  await expect(slots).toHaveAttribute("data-activity-camera-id", "qa-entrance");
  await search.fill("Reception");
  await expect(slots).toHaveCount(1);
  await expect(slots).toHaveAttribute("data-activity-camera-id", "qa-reception");
});

test("Live Wall includes offline alert cameras and scopes status counts", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/control-room");
  await page.getByRole("button", { name: "Alerts (1)", exact: true }).click();
  await expect(page.locator(".grid-camera-slot")).toHaveAttribute("data-activity-camera-id", "qa-reception");
  await page.locator("#branch-select").selectOption("qa-other");
  await expect(page.getByRole("button", { name: "Alerts (0)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "All Feeds (1)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Offline (1)", exact: true }).click();
  await expect(page.locator(".grid-camera-slot")).toHaveAttribute("data-activity-camera-id", "qa-delhi");
});

test("branch onboarding ignores a delayed portable-device response from the previous branch", async ({ page }) => {
  let releaseOldResponse!: () => void;
  const oldResponseGate = new Promise<void>((resolve) => { releaseOldResponse = resolve; });
  let oldRequestSeen!: () => void;
  const oldRequest = new Promise<void>((resolve) => { oldRequestSeen = resolve; });
  const device = (id: string, branchId: string) => ({ id, deviceName: id, type: "WINDOWS", state: "ENROLLED", metadata: { branchId } });
  await mockWorkspace(page, async (route) => {
    const branch = new URL(route.request().url()).searchParams.get("branchId");
    if (branch === "qa-branch") {
      oldRequestSeen();
      await oldResponseGate;
      await route.fulfill({ json: { devices: [device("Old branch laptop", "qa-branch")], revokedDevices: [] } });
    } else {
      await route.fulfill({ json: { devices: [device("Delhi laptop", "qa-other")], revokedDevices: [] } });
    }
  });
  await page.goto("/admin/branch-onboarding");
  await oldRequest;
  await page.getByLabel("Branch location", { exact: true }).selectOption("qa-other");
  const portable = page.locator(".portable-camera-section");
  await expect(portable.getByText("Delhi laptop", { exact: true })).toBeVisible();
  const oldResponse = page.waitForResponse((response) => response.url().includes("/api/portable-camera/devices?branchId=qa-branch"));
  releaseOldResponse();
  await (await oldResponse).finished();
  await expect(portable.getByText("Old branch laptop", { exact: true })).toHaveCount(0);
  await expect(portable.getByText("Delhi laptop", { exact: true })).toBeVisible();
});
