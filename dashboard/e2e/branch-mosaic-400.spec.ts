import { expect, test } from "@playwright/test";

test("renders a complete 20x20 branch status wall without internal scrolling", async ({ page }) => {
  const branches = Array.from({ length: 400 }, (_, index) => ({
    id: `branch-${String(index + 1).padStart(3, "0")}`,
    name: `Branch ${String(index + 1).padStart(3, "0")}`,
    code: `B${String(index + 1).padStart(3, "0")}`,
    region: `Region ${Math.floor(index / 20) + 1}`,
    healthStatus: index % 29 === 0 ? "critical" : index % 11 === 0 ? "warning" : "healthy",
    healthScore: index % 29 === 0 ? 35 : index % 11 === 0 ? 72 : 100,
    lastHealthCheck: "2026-07-30T12:00:00.000Z",
    totalCameras: 8, onlineCameras: 8, recordingCameras: 8,
    totalRecorders: 1, onlineRecorders: 1, recorderStatus: "online",
    criticalAlerts: index % 29 === 0 ? 1 : 0,
    edgeAgentStatus: "online", internetStatus: "online",
    edgeAgentHeartbeat: "2026-07-30T12:00:00.000Z",
  }));

  await page.route("**/api/control/v1/operations/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/health/summary")) {
      return route.fulfill({ json: { success: true, data: {
        totalBranches: 400, onlineBranches: 400, offlineBranches: 0,
        healthyBranches: 350, warningBranches: 36, criticalBranches: 14, unknownBranches: 0,
        overallHealthScore: 96, totalCameras: 3_200, camerasOnline: 3_200,
        camerasOffline: 0, camerasUnknown: 0, camerasRecording: 3_200,
        recordingFailures: 0, retentionBreaches: 0, activeCriticalAlerts: 14,
        totalEdgeAgents: 400, edgeAgentsOnline: 400, edgeAgentsOffline: 0,
        edgeAgentsWarning: 0, edgeAgentsUnknown: 0, timestamp: "2026-07-30T12:00:00.000Z",
      } } });
    }
    if (pathname.endsWith("/health/branches")) {
      return route.fulfill({ json: { success: true, data: {
        branches, total: branches.length, limit: 500, offset: 0,
      } } });
    }
    if (pathname.endsWith("/health/retention")) {
      return route.fulfill({ json: { success: true, data: { items: [] } } });
    }
    if (pathname.endsWith("/health/policy")) {
      return route.fulfill({ json: { success: true, data: { retentionDays: 180, retentionWarningDays: 7 } } });
    }
    if (pathname.endsWith("/health/network")) {
      return route.fulfill({ json: { success: true, data: {
        branches: [], summary: { totalBranches: 0, online: 0, degraded: 0, failover: 0, offline: 0, unknown: 0 },
      } } });
    }
    if (pathname.endsWith("/health/recorders")) {
      return route.fulfill({ json: { success: true, data: { recorders: [], summary: {
        total: 0, online: 0, offline: 0, degraded: 0, unknown: 0,
        recording: 0, partial: 0, stopped: 0, unverified: 0, affectedBranches: 0,
      } } } });
    }
    if (pathname.endsWith("/health/disks")) return route.fulfill({ json: { success: true, data: [] } });
    if (pathname.endsWith("/alerts")) return route.fulfill({ json: { success: true, data: { alerts: [] } } });
    return route.fulfill({ status: 204 });
  });

  await page.goto("/operations");
  const mosaic = page.getByRole("region", { name: "Enterprise branch health mosaic" });
  await expect(mosaic.getByText("400 branches", { exact: false })).toBeVisible();
  await mosaic.scrollIntoViewIfNeeded();

  const startedAt = Date.now();
  await mosaic.getByRole("button", { name: "20×20" }).click();
  const tiles = mosaic.locator("a.branch-mosaic-tile");
  await expect(tiles).toHaveCount(400);
  expect(Date.now() - startedAt).toBeLessThan(3_000);

  const grid = mosaic.locator(".branch-mosaic-viewport .absolute.grid");
  const columnCount = await grid.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
  expect(columnCount).toBe(20);

  const viewportBox = await mosaic.locator(".branch-mosaic-viewport").boundingBox();
  const lastTileBox = await tiles.last().boundingBox();
  expect(viewportBox).not.toBeNull();
  expect(lastTileBox).not.toBeNull();
  expect(lastTileBox!.y + lastTileBox!.height).toBeLessThanOrEqual(viewportBox!.y + viewportBox!.height + 1);
});
