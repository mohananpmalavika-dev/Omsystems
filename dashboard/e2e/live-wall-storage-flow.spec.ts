import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const user = {
  id: "qa-user",
  name: "Storage QA",
  email: "storage.qa@example.test",
  role: "super_admin",
  menuAccess: ["/control-room"],
};

const hdd = {
  id: "recorder-1:disk:1",
  deviceId: "recorder-1:disk:1",
  devicePath: "/dev/sda",
  model: "WD Purple Surveillance HDD 4TB",
  mediaType: "HDD",
  operationalStatus: "healthy",
  smartStatus: "healthy",
  capacityBytes: 4_000_000_000_000,
  usedBytes: 2_320_000_000_000,
  availableBytes: 1_680_000_000_000,
  usagePercent: 58,
  temperature: 35,
  powerOnHours: 1200,
  branchId: "qa-branch",
  branchName: "Chennai Central",
  observedAt: "2026-09-28T10:00:00.000Z",
};

const microSd = {
  ...hdd,
  id: "qa-camera:sdcard",
  deviceId: "qa-camera:sdcard",
  devicePath: "/dev/mmcblk0",
  model: "SanDisk High Endurance MicroSD 128GB",
  mediaType: "MicroSD",
  capacityBytes: 128_000_000_000,
  usedBytes: 48_640_000_000,
  availableBytes: 79_360_000_000,
  usagePercent: 38,
};

test("operator signs in, opens Live Wall storage, and views HDD telemetry", async ({ page }) => {
  let loginPayload: Record<string, unknown> | undefined;

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/v1/")) return route.continue();

    const path = url.pathname;
    let data: unknown = { success: true, data: [] };

    if (path.endsWith("/auth/login")) {
      loginPayload = route.request().postDataJSON() as Record<string, unknown>;
      data = { accessToken: "qa-access-token", expiresIn: 3600, user };
    } else if (path.endsWith("/auth/me")) {
      data = { success: true, data: user, user };
    } else if (path.endsWith("/cameras")) {
      data = {
        total: 1,
        data: [{
          id: "qa-camera",
          name: "Main Entrance",
          branchId: "qa-branch",
          branchName: "Chennai Central",
          status: "online",
          ipAddress: "192.0.2.10",
          channel: 0,
          vendor: "Axis",
          model: "QA Camera",
          sourceType: "ip-camera",
          streamProfiles: [],
          capabilities: { ptz: false, audio: false, events: true },
        }],
      };
    } else if (path.endsWith("/health/summary")) {
      data = {
        success: true,
        data: {
          totalCameras: 1,
          camerasOnline: 1,
          camerasOffline: 0,
          storageUsagePercent: 58,
          storageCapacityAvailable: true,
          storageSummary: { totalCount: 1, warningCount: 0, smartIssueCount: 0, raidIssueCount: 0, writeProbeFailureCount: 0 },
        },
      };
    } else if (path.endsWith("/alert-center")) {
      data = { success: true, data: [] };
    } else if (path.endsWith("/live-wall")) {
      data = { success: true, data: { rules: [], alerts: [], summary: { total: 0, open: 0, new: 0, critical: 0, highPriority: 0 } } };
    } else if (path === "/api/operations/storage") {
      data = {
        success: true,
        cameras: [{
          cameraId: "qa-camera",
          branchId: "qa-branch",
          cameraName: "Main Entrance",
          ipAddress: "192.0.2.10",
          activeStorageTier: "dvr_hdd",
          sdCardStatus: "detected",
          dvrStatus: "mapped",
          cloudStatus: "standby",
          storageDetails: hdd.model,
          capacity: "4.00 TB",
          used: "2.32 TB (58%)",
          retentionDays: 90,
        }],
        storageDevices: [microSd, hdd],
        summary: {
          totalCameras: 1,
          tier1SdCardCount: 1,
          tier2DvrHddCount: 1,
          tier3OnlineCloudCount: 0,
          sdCardNode: { name: "Camera MicroSD", capacity: "128 GB", used: "48.64 GB", status: "healthy" },
          dvrHddNode: { name: "Recorder SATA HDD", capacity: "4.00 TB", used: "2.32 TB", status: "healthy" },
          cloudNode: { name: "Cloud Pool", capacity: "50 TB", used: "8.5 TB", status: "healthy" },
        },
        storageNodes: [],
      };
    } else if (path === "/v1/operations/health/disks") {
      data = {
        success: true,
        data: [{
          ...hdd,
          detected: true,
          slotStatus: "present",
          smartAvailable: true,
          failureProbability: 0,
          predictionBasis: "threshold_only",
          sectorGrowth: 0,
          ioErrorGrowth: 0,
          replacementDetected: false,
          previousSerialNumber: "",
          raidStatus: "not_configured",
          raidLevel: "",
          writeVerification: "verified",
          writeLatencyMs: 2,
          reasonCodes: ["disk_detected"],
          lastCheck: "2026-09-28T10:00:00.000Z",
        }],
      };
    } else if (path === "/v1/operations/events") {
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: "event: ready\ndata: {}\n\n" });
    }

    return route.fulfill({ json: data });
  });

  await page.goto("/login?next=%2Fcontrol-room");
  await page.getByLabel("Username", { exact: true }).fill("qa-operator");
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  await expect.poll(() => loginPayload).toBeDefined();
  expect(loginPayload).toMatchObject({ username: "qa-operator", password: "qa-password" });
  await expect(page).toHaveURL(/\/control-room$/);
  await expect(page.getByRole("heading", { name: "Live Operations Stage" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open storage and disk health details" })).toContainText("58%");

  await page.getByRole("link", { name: "Open storage and disk health details" }).click();
  await expect(page).toHaveURL(/\/operations\/storage$/);
  await expect(page.getByRole("heading", { name: "Live Storage Telemetry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hard Disk (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Hard Disk (1)" }).click();
  await expect(page.getByText(hdd.model, { exact: true })).toBeVisible();
  await expect(page.getByText("4.00 TB", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "HDD fleet health" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Disk-slot evidence" })).toBeVisible();
  await expect(page.getByText("HDD detected", { exact: true })).toBeVisible();
});
